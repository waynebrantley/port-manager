---
name: release
description: Create and publish a new release
author: Wayne Brantley
version: 1.1.0
---

# Release Skill

Creates a new release of the port-manager package.

## Instructions

You are helping the user create a release of the port-manager npm package. Follow these steps:

1. **Determine release type** - Ask the user which type of release they want (unless they already specified):
   - `patch` - Bug fixes (1.0.0 → 1.0.1)
   - `minor` - New features (1.0.0 → 1.1.0)
   - `major` - Breaking changes (1.0.0 → 2.0.0)
   - `beta` - Beta pre-release (1.0.0 → 1.0.1-beta.0)
   - `alpha` - Alpha pre-release (1.0.0 → 1.0.1-alpha.0)

2. **Verify prerequisites**:
   - Confirm `gh` CLI is available: `command -v gh`
   - If not installed, stop and tell the user to install it from https://cli.github.com/ — the release scripts require it.

3. **Execute the release script**:
   ```bash
   ./scripts/release.sh [type]
   ```
   The script handles all validation (uncommitted changes, correct branch, running tests) and will exit with an error if anything is wrong. Do NOT duplicate these checks before running the script.

   **Branch rules enforced by the script:**
   - Stable releases (`patch`, `minor`, `major`) must be run from the `main` branch
   - Pre-releases (`beta`, `alpha`) can be run from any branch

4. **Post-release steps depend on release type**:

   **For stable releases (patch/minor/major):**
   The script creates a PR. Tell the user:
   - Wait for CI to pass on the PR
   - Merge the PR (squash merge)
   - Then run: `./scripts/finalize-release.sh`
   - The finalize script creates the git tag and GitHub Release on the merged commit
   - The GitHub Release triggers the publish workflow to npm

   **For pre-releases (beta/alpha):**
   The script creates the tag and GitHub Release immediately. Tell the user:
   - The publish workflow will run automatically
   - The package will be published to npm under the `next` tag
   - Install with: `npm install @wbrantley/port-manager@next`

5. **Provide monitoring links**:
   - GitHub Actions: https://github.com/waynebrantley/port-manager/actions
   - npm package: https://www.npmjs.com/package/@wbrantley/port-manager

## Important Notes

- This project uses **pnpm** as its package manager
- The `release.sh` script runs `pnpm test` before proceeding
- Pre-releases are published to npm under the `next` tag
- Stable releases are published under the `latest` tag
- The publish workflow (`.github/workflows/publish.yml`) triggers on GitHub Release creation
- Do NOT use `pnpm run release:*` scripts in package.json — they are legacy and do not follow the PR-based workflow

## Examples

**User says:** `/release patch`
- Run `./scripts/release.sh patch`
- Guide through PR merge + finalize steps

**User says:** `/release`
- Ask which type of release they want
- Then run the script

**User says:** `/release beta`
- Run `./scripts/release.sh beta`
- Inform that tag and release are created immediately
- Provide monitoring links
