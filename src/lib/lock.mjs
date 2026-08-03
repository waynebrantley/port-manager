#!/usr/bin/env node

import { open, unlink, stat, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REGISTRY_PATH } from './registry.mjs';

const STALE_LOCK_AGE_MS = 60000; // 60 seconds

/**
 * Resolve the lock file that guards a given registry.
 *
 * The lock must sit beside the registry it protects. A lock derived from
 * homedir() instead would leave a shared registry (PORT_MANAGER_REGISTRY_DIR)
 * completely unguarded across hosts, since each host would take a different
 * lock while mutating the same file.
 */
export function getLockPath(registryPath = REGISTRY_PATH) {
  return join(dirname(registryPath), 'registry.json.lock');
}

async function ensureLockDir(lockPath) {
  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Acquire an exclusive lock on the registry.
 * Will retry until timeout or lock is acquired.
 * Automatically removes stale locks.
 */
export async function acquireLock(timeoutMs = 30000, registryPath = REGISTRY_PATH) {
  const LOCK_PATH = getLockPath(registryPath);
  await ensureLockDir(LOCK_PATH);
  const startTime = Date.now();

  while (true) {
    try {
      // Try to create lock file exclusively
      const handle = await open(LOCK_PATH, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      await handle.close();
      return; // Lock acquired
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock file exists, check if it's stale
        try {
          const stats = await stat(LOCK_PATH);
          const lockAge = Date.now() - stats.mtimeMs;

          if (lockAge > STALE_LOCK_AGE_MS) {
            // Stale lock, remove it
            try {
              await unlink(LOCK_PATH);
              continue; // Try to acquire again
            } catch (unlinkErr) {
              // Someone else may have removed it, continue
              if (unlinkErr.code !== 'ENOENT') {
                throw unlinkErr;
              }
            }
          }
        } catch (statErr) {
          if (statErr.code === 'ENOENT') {
            // Lock was removed, try again
            continue;
          }
          throw statErr;
        }

        // Check timeout
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          throw new Error(`Failed to acquire lock after ${timeoutMs}ms`);
        }

        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Release the lock by removing the lock file.
 */
export async function releaseLock(registryPath = REGISTRY_PATH) {
  try {
    await unlink(getLockPath(registryPath));
  } catch (err) {
    // Ignore ENOENT - lock file already removed
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Execute a function with the lock acquired.
 * Automatically releases the lock when done.
 */
export async function withLock(fn, timeoutMs = 30000, registryPath = REGISTRY_PATH) {
  await acquireLock(timeoutMs, registryPath);
  try {
    return await fn();
  } finally {
    await releaseLock(registryPath);
  }
}
