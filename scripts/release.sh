#!/usr/bin/env bash
set -e

# Release helper script for port-manager
# Usage: ./scripts/release.sh [patch|minor|major|beta|alpha]
#
# For stable releases: creates a PR with the version bump.
# When merged, the auto-release workflow creates the tag and GitHub Release,
# which triggers the publish workflow to npm.
#
# For pre-releases: tags and releases immediately from the current branch.

RELEASE_TYPE="${1:-patch}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"

echo "Creating $RELEASE_TYPE release"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "  Install it from: https://cli.github.com/"
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Check if there are uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo "Error: You have uncommitted changes. Please commit or stash them first."
    git status -s
    exit 1
fi

# Ensure we're up to date
echo "Pulling latest changes..."
git pull

# Run tests first
echo "Running tests..."
pnpm test

# Determine release type and validate branch
echo "Preparing $RELEASE_TYPE release from branch: $CURRENT_BRANCH"
case "$RELEASE_TYPE" in
    patch|minor|major)
        # Stable releases must be from main branch
        if [[ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]]; then
            echo "Error: Stable releases must be from the $MAIN_BRANCH branch."
            echo "  Current branch: $CURRENT_BRANCH"
            echo "  For pre-releases from feature branches, use: beta or alpha"
            exit 1
        fi
        NEW_VERSION=$(npm version $RELEASE_TYPE --no-git-tag-version)
        IS_PRERELEASE=false
        ;;
    beta|alpha)
        # Pre-releases can be from any branch
        echo "Creating pre-release from branch: $CURRENT_BRANCH"
        NEW_VERSION=$(npm version prerelease --preid=$RELEASE_TYPE --no-git-tag-version)
        IS_PRERELEASE=true
        ;;
    *)
        echo "Error: Invalid release type: $RELEASE_TYPE"
        echo "  Valid types: patch, minor, major, beta, alpha"
        exit 1
        ;;
esac

echo "New version: $NEW_VERSION"

if [[ "$IS_PRERELEASE" == "false" ]]; then
    # Stable release: create branch and PR, auto-release workflow handles the rest
    RELEASE_BRANCH="release/$NEW_VERSION"
    git checkout -b "$RELEASE_BRANCH"

    git add package.json
    git commit -m "Release $NEW_VERSION"

    echo "Pushing release branch..."
    git push -u origin "$RELEASE_BRANCH"

    echo "Creating pull request..."
    PR_URL=$(gh pr create \
        --title "Release $NEW_VERSION" \
        --body "Version bump to $NEW_VERSION. When merged, the auto-release workflow will create the tag and GitHub Release." \
        --base "$MAIN_BRANCH" \
        --head "$RELEASE_BRANCH")

    echo ""
    echo "Release PR created: $PR_URL"
    echo ""
    echo "Next: merge the PR. Everything else is automatic."
    echo "  - Auto-release workflow creates the tag and GitHub Release"
    echo "  - Publish workflow publishes to npm"
    echo ""
else
    # Pre-release: commit, tag, and release immediately
    git add package.json
    git commit -m "Release $NEW_VERSION"

    echo "Pushing changes..."
    git push origin "$CURRENT_BRANCH"

    echo "Creating tag $NEW_VERSION..."
    git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"
    git push origin "$NEW_VERSION"

    echo "Creating GitHub pre-release..."
    PREVIOUS_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
    if [[ -n "$PREVIOUS_TAG" ]]; then
        RELEASE_NOTES="Pre-release $NEW_VERSION from branch \`$CURRENT_BRANCH\`

Full changelog: https://github.com/waynebrantley/port-manager/compare/${PREVIOUS_TAG}...${NEW_VERSION}"
    else
        RELEASE_NOTES="Pre-release $NEW_VERSION"
    fi

    gh release create "$NEW_VERSION" \
        --title "$NEW_VERSION" \
        --notes "$RELEASE_NOTES" \
        --prerelease \
        --target "$CURRENT_BRANCH"

    echo ""
    echo "Pre-release $NEW_VERSION created!"
    echo "  Tag: $NEW_VERSION"
    echo "  Branch: $CURRENT_BRANCH"
    echo "  npm tag: next"
    echo "  Install: npm install @wbrantley/port-manager@next"
fi

echo ""
echo "Monitor:"
echo "  Actions: https://github.com/waynebrantley/port-manager/actions"
echo "  npm: https://www.npmjs.com/package/@wbrantley/port-manager"
echo ""
