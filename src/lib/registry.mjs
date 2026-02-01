#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const PORTS_DIR = join(homedir(), '.port-manager');
export const REGISTRY_PATH = join(PORTS_DIR, 'registry.json');

/**
 * Ensure the port-manager directory exists.
 */
export async function ensurePortsDir(portsDir = PORTS_DIR) {
  if (!existsSync(portsDir)) {
    await mkdir(portsDir, { recursive: true });
  }
}

/**
 * Get the default registry structure.
 */
function getDefaultRegistry() {
  return {
    version: '1.0',
    pools: {
      frontend: { rangeStart: 3300, rangeEnd: 3499 },
      backend: { rangeStart: 5300, rangeEnd: 5499 },
      storybook: { rangeStart: 6300, rangeEnd: 6499 }
    },
    leases: []
  };
}

/**
 * Initialize the registry with default structure.
 */
async function initRegistry(registryPath = REGISTRY_PATH) {
  const portsDir = dirname(registryPath);
  await ensurePortsDir(portsDir);
  const registry = getDefaultRegistry();
  registry.lastModified = new Date().toISOString();
  await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  return registry;
}

/**
 * Initialize a new registry (overwrites existing one).
 * Used by the init command.
 */
export async function createNewRegistry(registryPath = REGISTRY_PATH) {
  return await initRegistry(registryPath);
}

/**
 * Get the current registry, initializing if needed.
 */
export async function getRegistry(registryPath = REGISTRY_PATH) {
  const portsDir = dirname(registryPath);
  await ensurePortsDir(portsDir);

  if (!existsSync(registryPath)) {
    return await initRegistry(registryPath);
  }

  const content = await readFile(registryPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Save the registry to disk.
 */
export async function saveRegistry(registry, registryPath = REGISTRY_PATH) {
  registry.lastModified = new Date().toISOString();
  await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
}

/**
 * Validate that a pool exists in the registry.
 */
export function validatePool(registry, poolName) {
  if (!registry.pools[poolName]) {
    const availablePools = Object.keys(registry.pools).join(', ');
    throw new Error(`Unknown pool: ${poolName}. Available pools: ${availablePools}`);
  }
}

/**
 * Get an existing lease for an identifier in a specific pool with optional tag.
 */
export function getExistingLease(registry, identifier, pool, tag = '') {
  return registry.leases.find(
    lease => lease.identifier === identifier && lease.pool === pool && (lease.tag || '') === tag
  );
}

/**
 * Get all leased ports in a specific pool.
 */
export function getLeasedPorts(registry, pool) {
  return registry.leases
    .filter(lease => lease.pool === pool)
    .map(lease => lease.port);
}

/**
 * Get all leased ports across all pools.
 */
export function getAllLeasedPorts(registry) {
  return registry.leases.map(lease => lease.port);
}

/**
 * Add a lease to the registry.
 */
export function addLease(registry, { port, pool, identifier, worktreePath, tag = '' }) {
  const lease = {
    port,
    pool,
    identifier,
    worktreePath: worktreePath || '',
    tag: tag || '',
    leasedAt: new Date().toISOString()
  };

  registry.leases.push(lease);
  return lease;
}

/**
 * Remove leases by port number.
 */
export function removeLeasesByPort(registry, port) {
  const initialCount = registry.leases.length;
  registry.leases = registry.leases.filter(lease => lease.port !== port);
  return initialCount - registry.leases.length;
}

/**
 * Remove leases by identifier.
 */
export function removeLeasesByIdentifier(registry, identifier) {
  const initialCount = registry.leases.length;
  registry.leases = registry.leases.filter(lease => lease.identifier !== identifier);
  return initialCount - registry.leases.length;
}

/**
 * Remove leases by identifier and tag.
 */
export function removeLeasesByTag(registry, identifier, tag = '') {
  const initialCount = registry.leases.length;
  registry.leases = registry.leases.filter(
    lease => !(lease.identifier === identifier && (lease.tag || '') === tag)
  );
  return initialCount - registry.leases.length;
}

/**
 * Get leases filtered by pool and/or identifier.
 */
export function getLeases(registry, { pool, identifier, global = false } = {}) {
  let leases = registry.leases;

  if (!global && identifier) {
    leases = leases.filter(lease => lease.identifier === identifier);
  }

  if (pool) {
    leases = leases.filter(lease => lease.pool === pool);
  }

  return leases;
}

/**
 * Find stale leases.
 * A lease is stale if:
 * - worktreePath is set but directory doesn't exist, OR
 * - lease is older than threshold AND port is not in use
 */
export async function findStaleLeases(registry, { isPortInUse, staleThresholdDays = 7 } = {}) {
  const staleLeases = [];
  const now = Date.now();
  const staleThresholdMs = staleThresholdDays * 24 * 60 * 60 * 1000;

  for (const lease of registry.leases) {
    let isStale = false;
    let reason = '';

    // Check if worktree path exists
    if (lease.worktreePath && !existsSync(lease.worktreePath)) {
      isStale = true;
      reason = 'worktree path does not exist';
    }

    // Check lease age
    if (!isStale && lease.leasedAt) {
      const leasedAt = new Date(lease.leasedAt).getTime();
      const age = now - leasedAt;

      if (age > staleThresholdMs) {
        // Only mark as stale if port is not in use
        if (isPortInUse && !(await isPortInUse(lease.port))) {
          isStale = true;
          reason = `lease older than ${staleThresholdDays} days and port not in use`;
        }
      }
    }

    if (isStale) {
      staleLeases.push({ lease, reason });
    }
  }

  return staleLeases;
}

/**
 * Remove stale leases from the registry.
 */
export function removeStaleLeases(registry, staleLeases) {
  const stalePorts = staleLeases.map(item => item.lease.port);
  const initialCount = registry.leases.length;
  registry.leases = registry.leases.filter(lease => !stalePorts.includes(lease.port));
  return initialCount - registry.leases.length;
}

/**
 * Add a new pool to the registry.
 */
export function addPool(registry, name, rangeStart, rangeEnd) {
  if (registry.pools[name]) {
    throw new Error(`Pool '${name}' already exists`);
  }

  registry.pools[name] = { rangeStart, rangeEnd };
}

/**
 * Update an existing pool's range.
 */
export function updatePool(registry, name, rangeStart, rangeEnd) {
  if (!registry.pools[name]) {
    throw new Error(`Pool '${name}' does not exist`);
  }

  registry.pools[name] = { rangeStart, rangeEnd };
}

/**
 * Delete a pool from the registry.
 * Returns the number of leases that were in this pool.
 */
export function deletePool(registry, name) {
  if (!registry.pools[name]) {
    throw new Error(`Pool '${name}' does not exist`);
  }

  // Count leases in this pool
  const leasesInPool = registry.leases.filter(lease => lease.pool === name);
  const count = leasesInPool.length;

  // Remove the pool
  delete registry.pools[name];

  return count;
}

/**
 * Clear all leases for a specific pool.
 */
export function clearPoolLeases(registry, poolName) {
  const initialCount = registry.leases.length;
  registry.leases = registry.leases.filter(
    lease => lease.pool !== poolName
  );
  return initialCount - registry.leases.length;
}

/**
 * Get all pools.
 */
export function getAllPools(registry) {
  return Object.entries(registry.pools).map(([name, config]) => ({
    name,
    rangeStart: config.rangeStart,
    rangeEnd: config.rangeEnd
  }));
}
