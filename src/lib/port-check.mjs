#!/usr/bin/env node

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execAsync = promisify(exec);

/**
 * Check if a port is currently in use on the system.
 * Works cross-platform (Windows, Linux, macOS).
 */
export async function isPortInUse(port) {
  const plat = platform();

  try {
    if (plat === 'win32') {
      // Windows: Use netstat
      const { stdout } = await execAsync(`netstat -an | findstr ":${port} "`);
      return stdout.trim().length > 0;
    } else if (plat === 'darwin') {
      // macOS: Use lsof or netstat
      try {
        const { stdout } = await execAsync(`lsof -iTCP:${port} -sTCP:LISTEN -t`);
        return stdout.trim().length > 0;
      } catch (err) {
        // lsof not found or no process, try netstat
        try {
          const { stdout } = await execAsync(`netstat -an | grep "LISTEN" | grep ":${port} "`);
          return stdout.trim().length > 0;
        } catch {
          return false;
        }
      }
    } else {
      // Linux/Unix: Use ss or netstat
      try {
        const { stdout } = await execAsync(`ss -tuln | grep ":${port} "`);
        return stdout.trim().length > 0;
      } catch (err) {
        // ss not found, try netstat
        try {
          const { stdout } = await execAsync(`netstat -tuln | grep ":${port} "`);
          return stdout.trim().length > 0;
        } catch {
          return false;
        }
      }
    }
  } catch (err) {
    // Command failed (no matches found, or command not available)
    // Assume port is not in use
    return false;
  }
}
