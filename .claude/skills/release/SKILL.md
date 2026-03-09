---
name: release
description: Create and publish a new release
author: Wayne Brantley
version: 2.0.0
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
   The script handles everything in one step:
   - Validates branch and clean working tree
   - Runs tests
   - Bumps version in package.json
   - Commits, tags, and pushes
   - Creates GitHub Release

   **Branch rules enforced by the script:**
   - Stable releases (`patch`, `minor`, `major`) must be run from the `main` branch
   - Pre-releases (`beta`, `alpha`) can be run from any branch

4. **After the script completes**, the GitHub Actions publish workflow runs automatically. Provide monitoring links:
   - GitHub Actions: https://github.com/waynebrantley/port-manager/actions
   - npm package: https://www.npmjs.com/package/@wbrantley/port-manager

   For pre-releases, remind the user the package is published under the `next` tag:
   `npm install @wbrantley/port-manager@next`

## Important Notes

- This project uses **pnpm** as its package manager
- The script runs `pnpm test` before proceeding
- Pre-releases are published to npm under the `next` tag
- Stable releases are published under the `latest` tag
- The publish workflow (`.github/workflows/publish.yml`) triggers on GitHub Release creation
