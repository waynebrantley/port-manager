# Release Guide

This document explains how to create releases for port-manager.

## Using the Release Skill (Easiest)

If you're using Claude Code, you can use the `/release` skill for a fully guided release process:

```
/release patch
/release minor
/release major
/release beta
/release alpha
```

Or just type `/release` and Claude will ask which type you want.

**What the skill does:**
- Checks for uncommitted changes
- Confirms the branch you're releasing from
- Runs tests
- Bumps the version
- Creates and pushes tags
- Creates GitHub Release (if gh CLI is available)
- Provides monitoring URLs
- Guides you through any manual steps

This is the recommended method as it handles all edge cases and provides guidance throughout the process.

## Quick Release (Recommended)

The easiest way to create a release is using the release script:

```bash
# Patch release (1.0.0 → 1.0.1)
./scripts/release.sh patch

# Minor release (1.0.0 → 1.1.0)
./scripts/release.sh minor

# Major release (1.0.0 → 2.0.0)
./scripts/release.sh major

# Beta release (1.0.0 → 1.0.1-beta.0)
./scripts/release.sh beta

# Alpha release (1.0.0 → 1.0.1-alpha.0)
./scripts/release.sh alpha
```

**What it does:**
1. Runs tests
2. Bumps version in package.json
3. Creates git commit
4. Creates and pushes git tag
5. Creates GitHub Release
6. GitHub Actions automatically publishes to npm

**Requirements:**
- [GitHub CLI](https://cli.github.com/) installed (`gh` command)
- Authenticated with GitHub (`gh auth login`)

## Manual Release

If you don't have GitHub CLI, you can use npm scripts:

### For regular releases (patch/minor/major):

```bash
# Patch: 1.0.0 → 1.0.1
pnpm run release:patch

# Minor: 1.0.0 → 1.1.0
pnpm run release:minor

# Major: 1.0.0 → 2.0.0
pnpm run release:major
```

### For pre-releases (beta/alpha):

```bash
# Beta: 1.0.0 → 1.0.1-beta.0
pnpm run release:beta

# Alpha: 1.0.0 → 1.0.1-alpha.0
pnpm run release:alpha
```

**After running the npm script:**
1. Go to [GitHub Releases](https://github.com/waynebrantley/port-manager/releases)
2. Click "Draft a new release"
3. Select the tag that was just created
4. Add release notes
5. For beta/alpha: Check "Set as a pre-release"
6. Click "Publish release"
7. GitHub Actions will automatically publish to npm

## Releasing from a Branch

Both methods work from any branch:

```bash
# From a feature branch
git checkout feature/my-feature
./scripts/release.sh beta

# From main branch
git checkout main
./scripts/release.sh patch
```

The release will be created from whatever branch you're currently on.

## Semantic Versioning

We follow [Semantic Versioning](https://semver.org/):

- **Patch** (1.0.0 → 1.0.1): Bug fixes, minor changes
- **Minor** (1.0.0 → 1.1.0): New features, backward compatible
- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Beta/Alpha**: Pre-release versions for testing

## npm Distribution Tags

- **Regular releases** → published to `latest` tag (default install)
- **Pre-releases** (beta/alpha) → published to `next` tag

Users install pre-releases with:
```bash
npm install port-manager@next
```

## First Release Setup

For the very first release (v1.0.0):

1. Manually publish once:
   ```bash
   pnpm publish --provenance
   ```

2. Configure npm Trusted Publishing:
   - Go to https://www.npmjs.com/package/@wbrantley/port-manager/access
   - Add GitHub Actions publishing access
   - Repository: `waynebrantley/port-manager`
   - Workflow: `.github/workflows/publish.yml`

3. All future releases will work automatically

## Troubleshooting

**"gh: command not found"**
- Install GitHub CLI: https://cli.github.com/
- Or use manual release method instead

**"uncommitted changes" error**
- Commit or stash your changes first
- `git status` to see what's uncommitted

**Tests failing**
- Fix the tests before releasing
- Tests must pass to create a release

**GitHub Actions not publishing**
- Check that npm Trusted Publishing is configured
- View workflow logs in the Actions tab
- Ensure the workflow has completed successfully
