#!/usr/bin/env bash
set -e

# Release helper script for port-manager
# Usage: ./scripts/release.sh [patch|minor|major|beta|alpha]

RELEASE_TYPE="${1:-patch}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"

echo "🚀 Creating $RELEASE_TYPE release"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "   Install it from: https://cli.github.com/"
    echo ""
    echo "   Or create the release manually after running:"
    echo "   pnpm run release:$RELEASE_TYPE"
    exit 1
fi

# Ensure we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]]; then
    echo "❌ You must be on the $MAIN_BRANCH branch to create a release."
    echo "   Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check if there are uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo "❌ You have uncommitted changes. Please commit or stash them first."
    git status -s
    exit 1
fi

# Ensure we're up to date
echo "📥 Pulling latest changes..."
git pull

# Run tests first
echo "🧪 Running tests..."
pnpm test

# Bump version (no tag yet)
echo "📦 Bumping version..."
case "$RELEASE_TYPE" in
    patch|minor|major)
        NEW_VERSION=$(npm version $RELEASE_TYPE --no-git-tag-version)
        IS_PRERELEASE=false
        ;;
    beta|alpha)
        NEW_VERSION=$(npm version prerelease --preid=$RELEASE_TYPE --no-git-tag-version)
        IS_PRERELEASE=true
        ;;
    *)
        echo "❌ Invalid release type: $RELEASE_TYPE"
        echo "   Valid types: patch, minor, major, beta, alpha"
        exit 1
        ;;
esac

echo "📝 New version: $NEW_VERSION"

# Create release branch
RELEASE_BRANCH="release/$NEW_VERSION"
git checkout -b "$RELEASE_BRANCH"

# Commit version change
git add package.json
git commit -m "Release $NEW_VERSION"

# Push branch
echo "📤 Pushing release branch..."
git push -u origin "$RELEASE_BRANCH"

# Create PR
echo "📋 Creating pull request..."
PR_BODY="Release $NEW_VERSION

## Changes
Version bump from release script.

## Post-merge
After this PR is merged, the release will be finalized automatically."

PR_URL=$(gh pr create \
    --title "Release $NEW_VERSION" \
    --body "$PR_BODY" \
    --base "$MAIN_BRANCH" \
    --head "$RELEASE_BRANCH")

echo ""
echo "✅ Release PR created: $PR_URL"
echo ""
echo "📋 Next steps:"
echo "   1. Wait for tests to pass"
echo "   2. Merge the PR (squash merge)"
echo "   3. Run: ./scripts/finalize-release.sh $NEW_VERSION"
echo ""

# Save release info for finalize script
mkdir -p .release-temp
echo "$NEW_VERSION" > .release-temp/pending-version
echo "$IS_PRERELEASE" > .release-temp/is-prerelease
echo "$PR_URL" > .release-temp/pr-url

echo "💡 Tip: The finalize script will create the tag and GitHub release after merge."
echo ""
