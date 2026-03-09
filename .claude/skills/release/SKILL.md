---
name: release
description: Create and publish a new release
author: Wayne Brantley
version: 3.0.0
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
   The script handles all validation (uncommitted changes, correct branch, tests).

   **Branch rules enforced by the script:**
   - Stable releases (`patch`, `minor`, `major`) must be run from the `main` branch
   - Pre-releases (`beta`, `alpha`) can be run from any branch

4. **What happens after the script runs:**

   **For stable releases (patch/minor/major):**
   The script creates a PR with the version bump. Tell the user:
   - Merge the PR — everything else is automatic
   - The `auto-release` workflow detects the "Release v*" commit and creates the tag + GitHub Release
   - The `publish` workflow then publishes to npm

   **For pre-releases (beta/alpha):**
   The script creates the tag and GitHub Release immediately. Tell the user:
   - The publish workflow runs automatically
   - The package is published under the `next` npm tag
   - Install with: `npm install @wbrantley/port-manager@next`

5. **Provide monitoring links**:
   - GitHub Actions: https://github.com/waynebrantley/port-manager/actions
   - npm package: https://www.npmjs.com/package/@wbrantley/port-manager

## Important Notes

- This project uses **pnpm** as its package manager
- The script runs `pnpm test` before proceeding
- Main branch is protected — stable releases must go through a PR
- After PR merge, tagging and releasing is fully automated via GitHub Actions
- Pre-releases are published to npm under the `next` tag
- Stable releases are published under the `latest` tag
