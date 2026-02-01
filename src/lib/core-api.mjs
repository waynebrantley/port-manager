#!/usr/bin/env node

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { withLock } from './lock.mjs';
import { isPortInUse } from './port-check.mjs';
import {
  getRegistry,
  saveRegistry,
  validatePool,
  getExistingLease,
  getLeasedPorts,
  addLease,
  removeLeasesByIdentifier,
  removeLeasesByTag,
  getLeases,
  findStaleLeases,
  removeStaleLeases,
  createNewRegistry,
  addPool,
  updatePool,
  deletePool,
  clearPoolLeases,
  getAllPools,
  REGISTRY_PATH
} from './registry.mjs';

const execAsync = promisify(exec);

/**
 * Core API for Port Manager.
 * Provides programmatic access to all port management functionality.
 */
export class PortManagerAPI {
  constructor(options = {}) {
    this.registryPath = options.registryPath || REGISTRY_PATH;
    this.portChecker = options.portChecker || isPortInUse;
  }

  /**
   * Get the git root directory by walking up from current directory.
   */
  async getGitRoot() {
    try {
      const { stdout } = await execAsync('git rev-parse --show-toplevel');
      return stdout.trim();
    } catch (err) {
      return null;
    }
  }

  /**
   * Get auto-detected identifier from git root.
   */
  async getAutoIdentifier() {
    const gitRoot = await this.getGitRoot();
    if (!gitRoot) {
      return null;
    }
    // Normalize path separators and remove drive colons for consistency
    return gitRoot.replace(/\\/g, '/').replace(/:/g, '');
  }

  /**
   * Lease a port from a pool.
   */
  async lease(pool, tag = '', identifier = null, worktreePath = null) {
    if (!pool) {
      throw new Error('Pool is required for lease action');
    }

    // Default tag to empty string
    tag = tag || '';

    if (!identifier) {
      identifier = await this.getAutoIdentifier();
      if (!identifier) {
        throw new Error('Could not auto-detect project. Not in a git repository.');
      }
    }

    if (!worktreePath) {
      worktreePath = await this.getGitRoot();
    }

    return await withLock(async () => {
      const registry = await getRegistry(this.registryPath);

      // Validate pool
      validatePool(registry, pool);

      // Check for existing lease with this tag
      const existingLease = getExistingLease(registry, identifier, pool, tag);
      if (existingLease) {
        return { port: existingLease.port, lease: existingLease };
      }

      // Get pool range
      const { rangeStart, rangeEnd } = registry.pools[pool];

      // Get leased ports in this pool
      const leasedPorts = getLeasedPorts(registry, pool);

      // Find next available port
      let foundPort = null;

      for (let port = rangeStart; port <= rangeEnd; port++) {
        const portAvailable = !leasedPorts.includes(port) && !(await this.portChecker(port));

        if (portAvailable) {
          foundPort = port;
          break;
        }
      }

      if (!foundPort) {
        throw new Error(`Pool '${pool}' exhausted (range: ${rangeStart}-${rangeEnd})`);
      }

      // Create the lease
      const lease = addLease(registry, { port: foundPort, pool, identifier, worktreePath, tag });

      await saveRegistry(registry, this.registryPath);
      return { port: foundPort, lease };
    });
  }

  /**
   * Release leased ports.
   */
  async release(tag = undefined, identifier = null) {
    if (!identifier) {
      identifier = await this.getAutoIdentifier();
      if (!identifier) {
        throw new Error('Could not auto-detect identifier. Not in a git repository.');
      }
    }

    return await withLock(async () => {
      const registry = await getRegistry(this.registryPath);
      let removedCount;

      if (tag !== undefined) {
        // Release by tag
        removedCount = removeLeasesByTag(registry, identifier, tag);
      } else {
        // Release all for identifier
        removedCount = removeLeasesByIdentifier(registry, identifier);
      }

      if (removedCount === 0) {
        if (tag !== undefined) {
          throw new Error(`No lease found with tag '${tag}'`);
        } else {
          throw new Error('No leases found for current project');
        }
      }

      await saveRegistry(registry, this.registryPath);
      return { removedCount, leases: registry.leases };
    });
  }

  /**
   * List leases.
   */
  async list(filterPool = null, showGlobal = false, identifier = null) {
    const registry = await getRegistry(this.registryPath);

    if (!showGlobal && !identifier) {
      identifier = await this.getAutoIdentifier();
    }

    const leases = getLeases(registry, {
      pool: filterPool,
      identifier,
      global: showGlobal
    });

    return leases;
  }

  /**
   * Check if a port is available.
   */
  async check(port) {
    if (!port) {
      throw new Error('Port is required for check action');
    }

    const registry = await getRegistry(this.registryPath);

    // Check if leased
    const lease = registry.leases.find(l => l.port === port);
    if (lease) {
      return {
        available: false,
        leased: true,
        inUse: false,
        details: { identifier: lease.identifier, pool: lease.pool }
      };
    }

    // Check if in use
    if (await this.portChecker(port)) {
      return {
        available: false,
        leased: false,
        inUse: true,
        details: {}
      };
    }

    return {
      available: true,
      leased: false,
      inUse: false,
      details: {}
    };
  }

  /**
   * Clean up stale leases.
   */
  async cleanup(isDryRun = false) {
    return await withLock(async () => {
      const registry = await getRegistry(this.registryPath);
      const staleLeases = await findStaleLeases(registry, { isPortInUse: this.portChecker });

      if (staleLeases.length === 0) {
        return { staleLeases: [], removedCount: 0, dryRun: isDryRun };
      }

      if (isDryRun) {
        return { staleLeases, removedCount: 0, dryRun: true };
      }

      const removedCount = removeStaleLeases(registry, staleLeases);
      await saveRegistry(registry, this.registryPath);
      return { staleLeases, removedCount };
    });
  }

  /**
   * Get environment variables for leases.
   */
  async env(identifier = null) {
    if (!identifier) {
      identifier = await this.getAutoIdentifier();
      if (!identifier) {
        throw new Error('Could not auto-detect identifier. Not in a git repository.');
      }
    }

    const registry = await getRegistry(this.registryPath);
    const leases = getLeases(registry, { identifier });

    if (leases.length === 0) {
      throw new Error('No leases found for current project');
    }

    const envVars = {};
    for (const lease of leases) {
      const poolName = lease.pool;
      const tag = lease.tag || '';
      let varName;

      // Build variable name: POOL_TAG_PORT or POOL_PORT if no tag
      if (tag) {
        varName = `${poolName.toUpperCase()}_${tag.toUpperCase()}_PORT`;
      } else {
        varName = `${poolName.toUpperCase()}_PORT`;
      }

      envVars[varName] = lease.port;
    }

    return envVars;
  }

  /**
   * Initialize a new registry.
   */
  async init(force = false) {
    if (existsSync(this.registryPath) && !force) {
      throw new Error(`Registry already exists at ${this.registryPath}`);
    }

    const registry = await createNewRegistry(this.registryPath);
    return { success: true, registry };
  }

  /**
   * List all pools or show details for a specific pool.
   */
  async poolList(poolName = null) {
    const registry = await getRegistry(this.registryPath);

    // If poolName is provided, show details for that pool
    if (poolName) {
      // Validate pool exists
      if (!registry.pools[poolName]) {
        const availablePools = Object.keys(registry.pools).join(', ');
        throw new Error(`Pool '${poolName}' does not exist. Available pools: ${availablePools}`);
      }

      const pool = registry.pools[poolName];
      const leases = registry.leases.filter(
        lease => lease.pool === poolName
      );

      return {
        name: poolName,
        rangeStart: pool.rangeStart,
        rangeEnd: pool.rangeEnd,
        totalPorts: pool.rangeEnd - pool.rangeStart + 1,
        reservedCount: leases.length,
        leases
      };
    }

    // Otherwise, list all pools
    const pools = getAllPools(registry);
    return pools;
  }

  /**
   * Add a new pool.
   */
  async poolAdd(poolName, rangeStart, rangeEnd) {
    if (!poolName || !rangeStart || !rangeEnd) {
      throw new Error('Pool name, range start, and range end are required');
    }

    if (rangeStart >= rangeEnd) {
      throw new Error('Range start must be less than range end');
    }

    return await withLock(async () => {
      const registry = await getRegistry(this.registryPath);

      addPool(registry, poolName, rangeStart, rangeEnd);
      await saveRegistry(registry, this.registryPath);

      return { success: true, poolName, rangeStart, rangeEnd };
    });
  }

  /**
   * Update a pool's range.
   */
  async poolUpdate(poolName, rangeStart, rangeEnd) {
    if (!poolName || !rangeStart || !rangeEnd) {
      throw new Error('Pool name, range start, and range end are required');
    }

    if (rangeStart >= rangeEnd) {
      throw new Error('Range start must be less than range end');
    }

    return await withLock(async () => {
      const registry = await getRegistry(this.registryPath);

      // Check if any leases would be out of range
      const affectedLeases = registry.leases.filter(
        lease => (lease.pool === poolName || lease.pool === `${poolName}-https`) &&
                 (lease.port < rangeStart || lease.port > rangeEnd)
      );

      if (affectedLeases.length > 0) {
        throw new Error(`${affectedLeases.length} lease(s) would be outside the new range. Please release these leases first or choose a different range.`);
      }

      updatePool(registry, poolName, rangeStart, rangeEnd);
      await saveRegistry(registry, this.registryPath);

      return { success: true, poolName, rangeStart, rangeEnd };
    });
  }

  /**
   * Delete a pool.
   */
  async poolDelete(poolName) {
    if (!poolName) {
      throw new Error('Pool name is required');
    }

    return await withLock(async () => {
      const registry = await getRegistry(this.registryPath);

      const leaseCount = deletePool(registry, poolName);

      if (leaseCount > 0) {
        throw new Error(`Pool '${poolName}' has ${leaseCount} active lease(s). Please release or clear these leases first.`);
      }

      await saveRegistry(registry, this.registryPath);

      return { success: true, poolName };
    });
  }

  /**
   * Clear all leases for a pool.
   */
  async poolClear(poolName) {
    if (!poolName) {
      throw new Error('Pool name is required');
    }

    return await withLock(async () => {
      const registry = await getRegistry(this.registryPath);

      // Validate pool exists
      if (!registry.pools[poolName]) {
        const availablePools = Object.keys(registry.pools).join(', ');
        throw new Error(`Pool '${poolName}' does not exist. Available pools: ${availablePools}`);
      }

      const removedCount = clearPoolLeases(registry, poolName);

      if (removedCount === 0) {
        return { success: true, poolName, removedCount: 0 };
      }

      await saveRegistry(registry, this.registryPath);

      return { success: true, poolName, removedCount };
    });
  }
}
