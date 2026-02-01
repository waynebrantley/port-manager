#!/usr/bin/env bash
set -e

# Release helper script for port-manager
# Usage: ./scripts/release.sh [patch|minor|major|beta|alpha]

RELEASE_TYPE="${1:-patch}"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "🚀 Creating $RELEASE_TYPE release from branch: $CURRENT_BRANCH"
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

# Check if there are uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo "❌ You have uncommitted changes. Please commit or stash them first."
    git status -s
    exit 1
fi

# Ensure we're up to date
echo "📥 Pulling latest changes..."
git pull --rebase

# Run tests first
echo "🧪 Running tests..."
pnpm test

# Bump version and create tag
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

# Remove 'v' prefix from version for commit message
VERSION=${NEW_VERSION#v}

echo "📝 New version: $NEW_VERSION"

# Commit version change
git add package.json
git commit -m "Release $NEW_VERSION"

# Create and push tag
git tag "$NEW_VERSION"
git push origin "$CURRENT_BRANCH"
git push origin "$NEW_VERSION"

# Generate release notes
echo ""
echo "📋 Enter release notes (press Ctrl+D when done):"
echo "   (or leave empty for auto-generated notes)"
echo ""

NOTES=$(cat)

if [[ -z "$NOTES" ]]; then
    NOTES="Release $NEW_VERSION"
fi

# Create GitHub Release
echo ""
echo "🎉 Creating GitHub Release..."

if [[ "$IS_PRERELEASE" == "true" ]]; then
    gh release create "$NEW_VERSION" \
        --title "$NEW_VERSION" \
        --notes "$NOTES" \
        --prerelease \
        --target "$CURRENT_BRANCH"
else
    gh release create "$NEW_VERSION" \
        --title "$NEW_VERSION" \
        --notes "$NOTES" \
        --target "$CURRENT_BRANCH"
fi

echo ""
echo "✅ Release $NEW_VERSION created successfully!"
echo "   📦 npm package will be published automatically via GitHub Actions"
echo "   🔗 View release: https://github.com/waynebrantley/port-manager/releases/tag/$NEW_VERSION"
echo ""
