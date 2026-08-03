import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { toCanonicalPath, toNativePath, toIdentifier, isWsl, resetWslCache, setWslOverride } from '../src/lib/paths.mjs';
import { getLockPath } from '../src/lib/lock.mjs';
import { findStaleLeases } from '../src/lib/registry.mjs';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of ['WSL_DISTRO_NAME', 'PORT_MANAGER_WSL_MOUNT_ROOT', 'PORT_MANAGER_REGISTRY_DIR']) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
  setWslOverride(null);
}

describe('toCanonicalPath', () => {
  afterEach(restoreEnv);

  it('converts Windows backslash paths to forward slashes', () => {
    expect(toCanonicalPath('C:\\Projects\\worktrees\\spike-0600\\HangFire'))
      .toBe('C:/Projects/worktrees/spike-0600/HangFire');
  });

  it('converts a WSL mount path to the Windows drive form', () => {
    expect(toCanonicalPath('/mnt/c/Projects/worktrees/spike-0600/HangFire'))
      .toBe('C:/Projects/worktrees/spike-0600/HangFire');
  });

  it('uppercases the drive letter so c:/ and C:/ are one identity', () => {
    expect(toCanonicalPath('c:/Projects/x')).toBe('C:/Projects/x');
    expect(toCanonicalPath('/mnt/C/Projects/x')).toBe('C:/Projects/x');
  });

  it('handles a bare drive root', () => {
    expect(toCanonicalPath('/mnt/c')).toBe('C:/');
    expect(toCanonicalPath('/mnt/d/')).toBe('D:/');
  });

  it('leaves ordinary Linux paths untouched', () => {
    expect(toCanonicalPath('/home/me/projects/x')).toBe('/home/me/projects/x');
  });

  it('does not mistake a real directory for a drive mount', () => {
    // /mnt/cdrom is a directory, not drive C. The letter must be followed by
    // a separator or end-of-string to count as a mount.
    expect(toCanonicalPath('/mnt/cdrom/data')).toBe('/mnt/cdrom/data');
    expect(toCanonicalPath('/mnt/carrots')).toBe('/mnt/carrots');
  });

  it('honours a custom WSL mount root', () => {
    process.env.PORT_MANAGER_WSL_MOUNT_ROOT = '/windows';
    expect(toCanonicalPath('/windows/c/x')).toBe('C:/x');
    // With the root overridden, the default location is no longer special.
    expect(toCanonicalPath('/mnt/c/x')).toBe('/mnt/c/x');
  });

  it('passes through empty values', () => {
    expect(toCanonicalPath('')).toBe('');
    expect(toCanonicalPath(null)).toBe(null);
  });
});

describe('toNativePath', () => {
  afterEach(restoreEnv);

  it('converts a canonical Windows path to a mount path when running under WSL', () => {
    setWslOverride(true);
    expect(toNativePath('C:/Projects/x')).toBe('/mnt/c/Projects/x');
    expect(toNativePath('C:/')).toBe('/mnt/c/');
  });

  it('leaves canonical paths alone when not under WSL', () => {
    setWslOverride(false);
    expect(toNativePath('C:/Projects/x')).toBe('C:/Projects/x');
  });

  it('leaves Linux paths alone under WSL', () => {
    setWslOverride(true);
    expect(toNativePath('/home/me/x')).toBe('/home/me/x');
  });

  it('round-trips with toCanonicalPath under WSL', () => {
    setWslOverride(true);
    const native = '/mnt/c/Projects/x';
    expect(toNativePath(toCanonicalPath(native))).toBe(native);
  });
});

describe('toIdentifier', () => {
  afterEach(restoreEnv);

  it('gives Windows and WSL views of one worktree the SAME identifier', () => {
    // This is the whole point of the change: without it the same worktree
    // holds two independent lease sets and ports get double-allocated.
    const fromWindows = toIdentifier('C:\\Projects\\worktrees\\spike-0600\\HangFire');
    const fromWsl = toIdentifier('/mnt/c/Projects/worktrees/spike-0600/HangFire');
    expect(fromWindows).toBe(fromWsl);
  });

  it('stays byte-compatible with identifiers already in existing registries', () => {
    // Real value read from the live Windows registry before this change.
    expect(toIdentifier('C:\\Projects\\worktrees\\spike-0600\\HangFire'))
      .toBe('C/Projects/worktrees/spike-0600/HangFire');
  });

  it('strips the drive colon', () => {
    expect(toIdentifier('C:/Projects/x')).toBe('C/Projects/x');
  });
});

describe('getLockPath', () => {
  it('places the lock beside the registry it guards', () => {
    expect(getLockPath('/shared/reg/registry.json')).toBe(join('/shared/reg', 'registry.json.lock'));
  });

  it('follows a relocated registry rather than the home directory', () => {
    // A homedir-derived lock would leave a shared registry unguarded, since
    // each host would take a different lock while writing the same file.
    const a = getLockPath('/mnt/c/Users/me/.port-manager/registry.json');
    const b = getLockPath('/home/me/.port-manager/registry.json');
    expect(a).not.toBe(b);
    expect(a).toBe(join('/mnt/c/Users/me/.port-manager', 'registry.json.lock'));
  });
});

describe('findStaleLeases with cross-host paths', () => {
  let root;

  beforeEach(async () => {
    root = join(tmpdir(), 'pm-paths-test', randomBytes(6).toString('hex'));
    await mkdir(join(root, 'c', 'Projects', 'live'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    restoreEnv();
  });

  it('does not mark a Windows-written lease stale when read from WSL', async () => {
    // Regression guard: stored paths are canonical (C:/...), which no WSL host
    // can stat. Without conversion every Windows lease reads as stale and the
    // next `clean` silently drops the whole registry.
    process.env.PORT_MANAGER_WSL_MOUNT_ROOT = root;
    setWslOverride(true);

    expect(toNativePath('C:/Projects/live')).toBe(`${root}/c/Projects/live`);

    const registry = {
      leases: [
        { port: 3300, pool: 'frontend', identifier: 'C/Projects/live', worktreePath: 'C:/Projects/live', leasedAt: new Date().toISOString() }
      ]
    };

    const stale = await findStaleLeases(registry, { isPortInUse: async () => false });
    expect(stale).toHaveLength(0);
  });

  it('still detects a genuinely missing worktree', async () => {
    const registry = {
      leases: [
        { port: 3301, pool: 'frontend', identifier: 'C/Projects/gone', worktreePath: join(root, 'definitely-not-here'), leasedAt: new Date().toISOString() }
      ]
    };

    const stale = await findStaleLeases(registry, { isPortInUse: async () => false });
    expect(stale).toHaveLength(1);
    expect(stale[0].reason).toBe('worktree path does not exist');
  });
});
