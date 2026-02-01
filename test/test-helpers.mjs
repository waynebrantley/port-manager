import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

/**
 * Test registry utility for creating isolated temporary registries.
 * Each test gets its own registry in a temp directory to avoid conflicts.
 */
export class TestRegistry {
  constructor() {
    this.id = randomBytes(8).toString('hex');
    this.dir = join(tmpdir(), 'port-manager-test', this.id);
    this.path = join(this.dir, 'registry.json');
  }

  async setup() {
    await mkdir(this.dir, { recursive: true });
  }

  async teardown() {
    await rm(this.dir, { recursive: true, force: true });
  }
}

/**
 * Create a mock port checker for testing.
 * Returns a function that simulates port availability checks without spawning shell commands.
 * @param {number[]} inUsePorts - Array of ports to report as in use
 * @returns {Function} Mock port checker function
 */
export function createMockPortChecker(inUsePorts = []) {
  return async (port) => inUsePorts.includes(port);
}
