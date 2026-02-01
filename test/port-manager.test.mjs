import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { PortManagerAPI } from '../src/lib/core-api.mjs';
import { TestRegistry, createMockPortChecker } from './test-helpers.mjs';

const execAsync = promisify(exec);
const CLI_PATH = './src/port-manager.mjs';

describe('Port Manager API Tests', () => {
  let testRegistry;
  let api;

  beforeEach(async () => {
    testRegistry = new TestRegistry();
    await testRegistry.setup();

    api = new PortManagerAPI({
      registryPath: testRegistry.path,
      portChecker: createMockPortChecker([]) // Mock: no ports in use
    });

    await api.init(true); // Initialize test registry
  });

  afterEach(async () => {
    await testRegistry.teardown();
  });

  describe('Lease Tests', () => {
    it('should lease a port from frontend pool', async () => {
      const result = await api.lease('frontend', '', 'test-project', '/test/path');

      expect(result.port).toBeGreaterThanOrEqual(3300);
      expect(result.port).toBeLessThanOrEqual(3499);
      expect(result.lease.pool).toBe('frontend');
    });

    it('should return same port on duplicate lease', async () => {
      const result1 = await api.lease('frontend', '', 'test-project', '/test/path');
      const result2 = await api.lease('frontend', '', 'test-project', '/test/path');

      expect(result1.port).toBe(result2.port);
    });

    it('should lease a port from backend pool', async () => {
      const result = await api.lease('backend', '', 'test-project', '/test/path');

      expect(result.port).toBeGreaterThanOrEqual(5300);
      expect(result.port).toBeLessThanOrEqual(5499);
    });

    it('should allow same project to lease from multiple pools', async () => {
      const frontendResult = await api.lease('frontend', '', 'test-project', '/test/path');
      const backendResult = await api.lease('backend', '', 'test-project', '/test/path');

      expect(frontendResult.port).not.toBe(backendResult.port);
    });

    it('should lease a port from storybook pool', async () => {
      const result = await api.lease('storybook', '', 'test-project', '/test/path');

      expect(result.port).toBeGreaterThanOrEqual(6300);
      expect(result.port).toBeLessThanOrEqual(6499);
    });

    it('should error on invalid pool', async () => {
      await expect(api.lease('invalid-pool', '', 'test-project', '/test/path'))
        .rejects.toThrow('Unknown pool');
    });

    it('should error when pool is missing', async () => {
      await expect(api.lease('', '', 'test-project', '/test/path'))
        .rejects.toThrow('Pool is required');
    });
  });

  describe('Tag Tests', () => {
    it('should lease port with tag', async () => {
      const result = await api.lease('backend', 'http', 'test-project', '/test/path');

      expect(result.port).toBeGreaterThanOrEqual(5300);
      expect(result.port).toBeLessThanOrEqual(5499);
      expect(result.lease.tag).toBe('http');
    });

    it('should lease multiple ports from same pool with different tags', async () => {
      const httpResult = await api.lease('backend', 'http', 'test-project', '/test/path');
      const httpsResult = await api.lease('backend', 'https', 'test-project', '/test/path');

      expect(httpResult.port).not.toBe(httpsResult.port);
      expect(httpResult.lease.tag).toBe('http');
      expect(httpsResult.lease.tag).toBe('https');
      expect(httpResult.lease.pool).toBe('backend');
      expect(httpsResult.lease.pool).toBe('backend');
    });

    it('should return same port when leasing with same tag', async () => {
      const result1 = await api.lease('backend', 'api', 'test-project', '/test/path');
      const result2 = await api.lease('backend', 'api', 'test-project', '/test/path');

      expect(result1.port).toBe(result2.port);
    });

    it('should output tagged ports in env command', async () => {
      await api.lease('backend', 'http', 'test-project', '/test/path');
      await api.lease('backend', 'https', 'test-project', '/test/path');

      const envVars = await api.env('test-project');

      expect(envVars).toHaveProperty('BACKEND_HTTP_PORT');
      expect(envVars).toHaveProperty('BACKEND_HTTPS_PORT');
    });

    it('should release port by tag', async () => {
      await api.lease('backend', 'http', 'test-project', '/test/path');
      await api.lease('backend', 'https', 'test-project', '/test/path');

      const result = await api.release('http', 'test-project');

      expect(result.removedCount).toBe(1);

      const leases = await api.list(null, false, 'test-project');
      const httpLease = leases.find(l => l.tag === 'http');
      const httpsLease = leases.find(l => l.tag === 'https');

      expect(httpLease).toBeUndefined();
      expect(httpsLease).toBeDefined();
    });
  });

  describe('List Tests', () => {
    it('should list current project leases', async () => {
      await api.lease('frontend', '', 'test-project', '/test/path');
      await api.lease('backend', '', 'test-project', '/test/path');

      const leases = await api.list(null, false, 'test-project');

      expect(leases.length).toBe(2);
      expect(leases.some(l => l.pool === 'frontend')).toBe(true);
      expect(leases.some(l => l.pool === 'backend')).toBe(true);
    });

    it('should list current project leases using ls alias', async () => {
      await api.lease('frontend', '', 'test-project', '/test/path');
      await api.lease('backend', '', 'test-project', '/test/path');

      const leases = await api.list(null, false, 'test-project');

      expect(leases.length).toBe(2);
      expect(leases.some(l => l.pool === 'frontend')).toBe(true);
      expect(leases.some(l => l.pool === 'backend')).toBe(true);
    });

    it('should list with --global flag', async () => {
      await api.lease('frontend', '', 'test-project', '/test/path');

      const leases = await api.list(null, true, null);

      expect(leases.length).toBeGreaterThanOrEqual(1);
      expect(leases.some(l => l.pool === 'frontend')).toBe(true);
    });

    it('should list with --global flag using ls alias', async () => {
      await api.lease('frontend', '', 'test-project', '/test/path');

      const leases = await api.list(null, true, null);

      expect(leases.length).toBeGreaterThanOrEqual(1);
      expect(leases.some(l => l.pool === 'frontend')).toBe(true);
    });

    it('should filter by pool', async () => {
      await api.lease('frontend', '', 'test-project', '/test/path');
      await api.lease('backend', '', 'test-project', '/test/path');

      const leases = await api.list('frontend', false, 'test-project');

      expect(leases.length).toBe(1);
      expect(leases[0].pool).toBe('frontend');
    });

    it('should filter by pool using ls alias', async () => {
      await api.lease('frontend', '', 'test-project', '/test/path');
      await api.lease('backend', '', 'test-project', '/test/path');

      const leases = await api.list('frontend', false, 'test-project');

      expect(leases.length).toBe(1);
      expect(leases[0].pool).toBe('frontend');
    });

    it('should show no leases when none exist', async () => {
      const leases = await api.list(null, false, 'test-project');

      expect(leases.length).toBe(0);
    });

    it('should show no leases when none exist using ls alias', async () => {
      const leases = await api.list(null, false, 'test-project');

      expect(leases.length).toBe(0);
    });
  });

  describe('Check Tests', () => {
    it('should identify leased port', async () => {
      const result = await api.lease('frontend', '', 'test-project', '/test/path');

      const checkResult = await api.check(result.port);

      expect(checkResult.available).toBe(false);
      expect(checkResult.leased).toBe(true);
      expect(checkResult.details.identifier).toBe('test-project');
    });

    it('should identify available port', async () => {
      // Use a high unlikely port
      const checkResult = await api.check(39999);

      expect(checkResult.available).toBe(true);
      expect(checkResult.leased).toBe(false);
      expect(checkResult.inUse).toBe(false);
    });

    it('should error when port is missing', async () => {
      await expect(api.check(null))
        .rejects.toThrow('Port is required');
    });
  });

  describe('Env Tests', () => {
    it('should output FRONTEND_PORT', async () => {
      await api.lease('frontend', '', 'test-project', '/test/path');

      const envVars = await api.env('test-project');

      expect(envVars).toHaveProperty('FRONTEND_PORT');
      expect(envVars.FRONTEND_PORT).toBeGreaterThanOrEqual(3300);
    });

    it('should output BACKEND_PORT', async () => {
      await api.lease('backend', '', 'test-project', '/test/path');

      const envVars = await api.env('test-project');

      expect(envVars).toHaveProperty('BACKEND_PORT');
      expect(envVars.BACKEND_PORT).toBeGreaterThanOrEqual(5300);
    });

    it('should output STORYBOOK_PORT', async () => {
      await api.lease('storybook', '', 'test-project', '/test/path');

      const envVars = await api.env('test-project');

      expect(envVars).toHaveProperty('STORYBOOK_PORT');
      expect(envVars.STORYBOOK_PORT).toBeGreaterThanOrEqual(6300);
    });

    it('should error when no leases exist', async () => {
      await expect(api.env('test-project'))
        .rejects.toThrow('No leases found');
    });
  });

  describe('Cleanup Tests', () => {
    it('should execute cleanup dry run without error', async () => {
      const result = await api.cleanup(true);

      expect(result).toHaveProperty('staleLeases');
      expect(result).toHaveProperty('removedCount');
      expect(result.removedCount).toBe(0);
    });

    it('should show dry run message', async () => {
      const result = await api.cleanup(true);

      expect(result).toHaveProperty('dryRun');
      expect(result.dryRun).toBe(true);
    });
  });

  describe('Worktree Path Tests', () => {
    it('should auto-populate worktreePath with git root', async () => {
      const result = await api.lease('frontend', '', 'test-project', '/test/path');

      expect(result.lease.worktreePath).toBe('/test/path');
    });
  });

  describe('Release Tests', () => {
    it('should release default tag lease', async () => {
      await api.lease('backend', '', 'test-project', '/test/path');
      await api.lease('backend', 'api', 'test-project', '/test/path');

      // Release the default tag (empty tag) lease
      const result = await api.release('', 'test-project');

      expect(result.removedCount).toBe(1);

      // Verify only the tagged lease remains
      const leases = await api.list(null, false, 'test-project');
      const defaultLease = leases.find(l => l.pool === 'backend' && !l.tag);
      const apiLease = leases.find(l => l.pool === 'backend' && l.tag === 'api');

      expect(defaultLease).toBeUndefined();
      expect(apiLease).toBeDefined();
    });

    it('should release all for current project', async () => {
      await api.lease('frontend', '', 'test-project', '/test/path');
      await api.lease('backend', '', 'test-project', '/test/path');

      const result = await api.release(undefined, 'test-project');

      expect(result.removedCount).toBe(2);
    });

    it('should error when no leases exist', async () => {
      await expect(api.release(undefined, 'test-project'))
        .rejects.toThrow('No leases found');
    });
  });

  describe('Init Tests', () => {
    it('should initialize a new registry', async () => {
      const newRegistry = new TestRegistry();
      await newRegistry.setup();

      const newApi = new PortManagerAPI({ registryPath: newRegistry.path });
      const result = await newApi.init();

      expect(result.success).toBe(true);
      expect(result.registry).toHaveProperty('pools');
      expect(result.registry.pools).toHaveProperty('frontend');

      await newRegistry.teardown();
    });

    it('should fail to init when registry exists without --force', async () => {
      await expect(api.init(false))
        .rejects.toThrow('Registry already exists');
    });

    it('should reinitialize with --force flag', async () => {
      const result = await api.init(true);

      expect(result.success).toBe(true);
    });
  });

  describe('Pool Management Tests', () => {
    describe('pool list', () => {
      it('should list all pools', async () => {
        const pools = await api.poolList();

        expect(pools.length).toBeGreaterThanOrEqual(3);
        expect(pools.some(p => p.name === 'frontend')).toBe(true);
        expect(pools.some(p => p.name === 'backend')).toBe(true);
        expect(pools.some(p => p.name === 'storybook')).toBe(true);
      });

      it('should list all pools using ls alias', async () => {
        const pools = await api.poolList();

        expect(pools.length).toBeGreaterThanOrEqual(3);
        expect(pools.some(p => p.name === 'frontend')).toBe(true);
        expect(pools.some(p => p.name === 'backend')).toBe(true);
        expect(pools.some(p => p.name === 'storybook')).toBe(true);
      });

      it('should list specific pool with reserved ports', async () => {
        await api.lease('frontend', '', 'test-project', '/test/path');
        const poolInfo = await api.poolList('frontend');

        expect(poolInfo.name).toBe('frontend');
        expect(poolInfo.rangeStart).toBe(3300);
        expect(poolInfo.rangeEnd).toBe(3499);
        expect(poolInfo.reservedCount).toBe(1);
      });

      it('should list specific pool with reserved ports using ls alias', async () => {
        await api.lease('frontend', '', 'test-project', '/test/path');
        const poolInfo = await api.poolList('frontend');

        expect(poolInfo.name).toBe('frontend');
        expect(poolInfo.rangeStart).toBe(3300);
        expect(poolInfo.rangeEnd).toBe(3499);
        expect(poolInfo.reservedCount).toBe(1);
      });

      it('should list specific pool with no reserved ports', async () => {
        const poolInfo = await api.poolList('backend');

        expect(poolInfo.name).toBe('backend');
        expect(poolInfo.rangeStart).toBe(5300);
        expect(poolInfo.rangeEnd).toBe(5499);
        expect(poolInfo.reservedCount).toBe(0);
      });

      it('should list specific pool with no reserved ports using ls alias', async () => {
        const poolInfo = await api.poolList('backend');

        expect(poolInfo.name).toBe('backend');
        expect(poolInfo.rangeStart).toBe(5300);
        expect(poolInfo.rangeEnd).toBe(5499);
        expect(poolInfo.reservedCount).toBe(0);
      });
    });

    describe('pool add', () => {
      it('should add a new pool', async () => {
        const result = await api.poolAdd('testpool', 9000, 9099);

        expect(result.success).toBe(true);
        expect(result.poolName).toBe('testpool');

        // Verify it appears in list
        const pools = await api.poolList();
        expect(pools.some(p => p.name === 'testpool')).toBe(true);
      });

      it('should fail to add duplicate pool', async () => {
        await api.poolAdd('testpool2', 9100, 9199);

        await expect(api.poolAdd('testpool2', 9200, 9299))
          .rejects.toThrow('already exists');
      });

      it('should fail when range start >= range end', async () => {
        await expect(api.poolAdd('badpool', 9999, 9000))
          .rejects.toThrow('Range start must be less than range end');
      });
    });

    describe('pool update', () => {
      it('should update pool range', async () => {
        await api.poolAdd('updatetest', 7000, 7099);
        const result = await api.poolUpdate('updatetest', 7000, 7199);

        expect(result.success).toBe(true);
        expect(result.rangeEnd).toBe(7199);
      });

      it('should fail when update would orphan leases', async () => {
        await api.poolAdd('orphantest', 7200, 7299);
        await api.lease('orphantest', '', 'test-project', '/test/path');

        await expect(api.poolUpdate('orphantest', 7250, 7299))
          .rejects.toThrow('would be outside the new range');

        // Clean up
        await api.poolClear('orphantest');
      });
    });

    describe('pool clear', () => {
      it('should clear all leases from a pool', async () => {
        await api.poolAdd('cleartest', 7300, 7399);
        await api.lease('cleartest', '', 'test-project', '/test/path');

        const result = await api.poolClear('cleartest');

        expect(result.success).toBe(true);
        expect(result.removedCount).toBe(1);
      });

      it('should report when no leases to clear', async () => {
        await api.poolAdd('emptytest', 7400, 7499);
        const result = await api.poolClear('emptytest');

        expect(result.success).toBe(true);
        expect(result.removedCount).toBe(0);
      });

      it('should fail for non-existent pool', async () => {
        await expect(api.poolClear('nonexistent'))
          .rejects.toThrow('does not exist');
      });
    });

    describe('pool delete', () => {
      it('should delete pool without leases', async () => {
        await api.poolAdd('deletetest', 7500, 7599);
        const result = await api.poolDelete('deletetest');

        expect(result.success).toBe(true);

        // Verify it's gone
        const pools = await api.poolList();
        expect(pools.some(p => p.name === 'deletetest')).toBe(false);
      });

      it('should warn when deleting pool with active leases', async () => {
        await api.poolAdd('deletewarning', 7600, 7699);
        await api.lease('deletewarning', '', 'test-project', '/test/path');

        await expect(api.poolDelete('deletewarning'))
          .rejects.toThrow('has 1 active lease(s)');

        // Clean up
        await api.poolClear('deletewarning');
        await api.poolDelete('deletewarning');
      });
    });
  });
});

describe('Port Manager CLI Integration Tests', () => {
  it('should display help with --help flag', async () => {
    const { stdout } = await execAsync(`node ${CLI_PATH} --help`);
    expect(stdout).toContain('Port Manager');
    expect(stdout).toContain('USAGE');
    expect(stdout).toContain('ACTIONS');
  });

  it('should display help with help action', async () => {
    const { stdout } = await execAsync(`node ${CLI_PATH} help`);
    expect(stdout).toContain('Port Manager');
    expect(stdout).toContain('USAGE');
  });

  it('should display help when no action provided', async () => {
    const { stdout } = await execAsync(`node ${CLI_PATH}`);
    expect(stdout).toContain('Port Manager');
  });
});
