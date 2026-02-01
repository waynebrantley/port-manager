---
name: release
description: Create and publish a new release
author: Wayne Brantley
version: 1.0.0
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

2. **Check for uncommitted changes**:
   ```bash
   git status -s
   ```
   If there are uncommitted changes, inform the user and ask if they want to:
   - Commit them now (you can help with commit message)
   - Stash them
   - Cancel the release

3. **Check current branch**:
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```
   Inform the user which branch they're releasing from. Confirm if this is correct.

4. **Check if gh CLI is available**:
   ```bash
   command -v gh
   ```
   If available, offer to use the automated script. If not, use the npm scripts method.

5. **Execute the release**:

   **If gh CLI is available:**
   ```bash
   ./scripts/release.sh [type]
   ```

   **If gh CLI is NOT available:**
   ```bash
   pnpm run release:[type]
   ```
   Then guide the user to create the GitHub Release manually:
   - Go to https://github.com/waynebrantley/port-manager/releases
   - Click "Draft a new release"
   - Select the tag that was just created
   - Add release notes
   - For beta/alpha: Check "Set as a pre-release"
   - Click "Publish release"

6. **For first release only** - If this is version 1.0.0 or the first release:
   - Inform the user they need to manually publish first: `pnpm publish --provenance`
   - Then configure npm Trusted Publishing at https://www.npmjs.com/package/@wbrantley/port-manager/access
   - Configure:
     - Repository: `waynebrantley/port-manager`
     - Workflow: `.github/workflows/publish.yml`

7. **Monitor the release**:
   - Provide the GitHub Actions workflow URL to monitor: https://github.com/waynebrantley/port-manager/actions
   - Provide the npm package URL: https://www.npmjs.com/package/@wbrantley/port-manager

## Important Notes

- Always run tests before releasing
- Pre-releases (beta/alpha) are published to npm under the `next` tag
- Regular releases are published under the `latest` tag
- The GitHub Actions workflow automatically publishes to npm after a GitHub Release is created
- For first release, manual npm publish is required to set up the package

## Examples

**User says:** `/release patch`
- You determine they want a patch release
- Check for uncommitted changes
- Check current branch
- Execute `./scripts/release.sh patch` (if gh available) or `pnpm run release:patch`
- Guide through any remaining manual steps
- Provide monitoring URLs

**User says:** `/release`
- Ask which type of release they want
- Then proceed with the steps above

**User says:** `/release beta from feature branch`
- Confirm they want to release beta from current branch
- Proceed with beta release
- Remind them that beta releases use the `next` tag on npm
