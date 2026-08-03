# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-08-03

### Added

- `PORT_MANAGER_REGISTRY_DIR` — relocate the registry so several hosts can share
  one set of leases. Intended for a Windows host and a WSL distro on the same
  machine, which otherwise resolve `os.homedir()` to different directories and
  each keep a private registry.
- `PORT_MANAGER_WSL_MOUNT_ROOT` — override where WSL mounts Windows drives
  (default `/mnt`), for setups that change `automount.root` in `/etc/wsl.conf`.
- `src/lib/paths.mjs` with `toCanonicalPath`, `toNativePath`, `toIdentifier`,
  and `isWsl`.

### Fixed

- **Same worktree got two independent lease sets across hosts.** Identifiers and
  `worktreePath` are now stored canonically (`C:/Projects/x`), so a worktree
  reached as `C:\Projects\x` from Windows and `/mnt/c/Projects/x` from WSL is one
  identity. Previously both sides could lease the same port to the same worktree.
  Existing registries are unaffected — canonical form is what Windows already wrote.
- **The lock did not guard a relocated registry.** The lock path was derived from
  `os.homedir()` rather than from the registry being written, so a shared registry
  was mutated with no effective mutual exclusion. The lock now always sits beside
  its registry. This also isolates the test suite, which previously serialized every
  test on one global lock shared with real usage.
- **Stale detection would have swept every cross-host lease.** `findStaleLeases`
  called `existsSync` on the stored path; under WSL a canonical `C:/...` path never
  exists, so every Windows-written lease read as stale and the next `cleanup` would
  have dropped it. Stored paths are now converted to a native form before any
  filesystem check.

### Notes

- A git worktree created by Windows git stores an absolute `gitdir: C:/...` that
  WSL git cannot resolve (and vice versa), so automatic project detection still
  fails inside such worktrees regardless of registry configuration. Fix with
  `git config --global worktree.useRelativePaths true` and `git worktree repair`
  on git 2.48+.

## [1.0.2]

- Initial published release.
