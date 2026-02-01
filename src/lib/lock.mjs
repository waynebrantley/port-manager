#!/usr/bin/env node

import { open, unlink, stat, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PORTS_DIR = join(homedir(), '.port-manager');
const LOCK_PATH = join(PORTS_DIR, 'registry.json.lock');
const STALE_LOCK_AGE_MS = 60000; // 60 seconds

/**
 * Ensure the port-manager directory exists.
 */
async function ensurePortsDir() {
  if (!existsSync(PORTS_DIR)) {
    await mkdir(PORTS_DIR, { recursive: true });
  }
}

/**
 * Acquire an exclusive lock on the registry.
 * Will retry until timeout or lock is acquired.
 * Automatically removes stale locks.
 */
export async function acquireLock(timeoutMs = 30000) {
  await ensurePortsDir();
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
export async function releaseLock() {
  try {
    await unlink(LOCK_PATH);
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
export async function withLock(fn, timeoutMs = 30000) {
  await acquireLock(timeoutMs);
  try {
    return await fn();
  } finally {
    await releaseLock();
  }
}
