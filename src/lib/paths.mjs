#!/usr/bin/env node

import { readFileSync } from 'node:fs';

/**
 * Path canonicalization for shared registries.
 *
 * A single registry may be written by port-manager running on Windows and by
 * port-manager running inside WSL against the same drive. The two see different
 * paths for one directory (`C:\Projects\x` vs `/mnt/c/Projects/x`), so leases
 * must be stored in one canonical form or the same worktree gets two independent
 * lease sets and the port conflict this tool prevents comes back.
 *
 * Canonical form is the Windows-style `C:/Projects/x` — it was already what
 * Windows hosts wrote, so existing registries stay valid without migration.
 */

// WSL exposes fixed drives under a configurable root; /mnt is the default.
// Read lazily rather than at module load: callers (and tests) may set the
// override after this module is first imported.
function mountRoot() {
  return (process.env.PORT_MANAGER_WSL_MOUNT_ROOT || '/mnt').replace(/\/+$/, '');
}

let cachedIsWsl = null;

/**
 * Detect whether we are running inside WSL.
 * Result is cached — /proc/version does not change within a process.
 */
export function isWsl() {
  if (cachedIsWsl !== null) {
    return cachedIsWsl;
  }

  if (process.platform !== 'linux') {
    cachedIsWsl = false;
    return cachedIsWsl;
  }

  if (process.env.WSL_DISTRO_NAME) {
    cachedIsWsl = true;
    return cachedIsWsl;
  }

  try {
    cachedIsWsl = readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    cachedIsWsl = false;
  }

  return cachedIsWsl;
}

/**
 * Reset the cached WSL detection so the next isWsl() re-probes. Test-only seam.
 */
export function resetWslCache() {
  cachedIsWsl = null;
}

/**
 * Force the WSL answer. Test-only seam.
 *
 * Real detection is deliberately gated on process.platform === 'linux', so a
 * Windows or macOS test host cannot reach the WSL branches through environment
 * variables alone. Pass null to hand control back to real detection.
 */
export function setWslOverride(value) {
  cachedIsWsl = value === null ? null : Boolean(value);
}

/**
 * Convert a native path to the canonical cross-platform form stored in the registry.
 *
 * Windows  C:\Projects\x     -> C:/Projects/x
 * WSL      /mnt/c/Projects/x -> C:/Projects/x
 * Linux    /home/me/x        -> /home/me/x   (unchanged)
 */
export function toCanonicalPath(p) {
  if (!p) {
    return p;
  }

  let s = String(p).replace(/\\/g, '/');

  // /mnt/c/... -> C:/...   The drive letter must be followed by a separator or
  // end of string, so real directories like /mnt/cdrom are left alone.
  const root = mountRoot();
  const wslMatch = s.match(new RegExp(`^${escapeRegExp(root)}/([a-zA-Z])(/|$)`));
  if (wslMatch) {
    const drive = wslMatch[1].toUpperCase();
    const rest = s.slice(`${root}/${wslMatch[1]}`.length);
    return `${drive}:${rest || '/'}`;
  }

  // Normalize drive-letter case so c:/x and C:/x are one identity.
  return s.replace(/^([a-zA-Z]):/, (_, d) => `${d.toUpperCase()}:`);
}

/**
 * Convert a canonical path back to something the current host can stat.
 *
 * Required before any filesystem check on a stored path: under WSL,
 * existsSync('C:/Projects/x') is always false, which would make every
 * Windows-written lease look stale and get swept by `clean`.
 */
export function toNativePath(p) {
  if (!p) {
    return p;
  }

  const s = String(p).replace(/\\/g, '/');
  const driveMatch = s.match(/^([a-zA-Z]):(\/.*)?$/);

  if (driveMatch && isWsl()) {
    return `${mountRoot()}/${driveMatch[1].toLowerCase()}${driveMatch[2] || '/'}`;
  }

  return s;
}

/**
 * Build the registry identifier for a path: canonical form with the drive colon
 * removed. Kept here so the identifier and the stored worktreePath cannot drift.
 */
export function toIdentifier(p) {
  if (!p) {
    return p;
  }
  return toCanonicalPath(p).replace(/:/g, '');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
