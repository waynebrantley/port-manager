#!/usr/bin/env bash
set -e

# Finalize release after PR merge
# Usage: ./scripts/finalize-release.sh [version]
# Example: ./scripts/finalize-release.sh v1.0.2

VERSION="${1}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"

if [[ -z "$VERSION" ]]; then
    # Try to read from saved state
    if [[ -f .release-temp/pending-version ]]; then
        VERSION=$(cat .release-temp/pending-version)
        IS_PRERELEASE=$(cat .release-temp/is-prerelease)
        echo "📦 Finalizing release: $VERSION"
    else
        echo "❌ Usage: ./scripts/finalize-release.sh [version]"
        echo "   Example: ./scripts/finalize-release.sh v1.0.2"
        exit 1
    fi
else
    # Add 'v' prefix if not present
    if [[ ! "$VERSION" =~ ^v ]]; then
        VERSION="v$VERSION"
    fi
    IS_PRERELEASE=false
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    exit 1
fi

# Ensure we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]]; then
    echo "⚠️  Not on $MAIN_BRANCH branch. Switching..."
    git checkout "$MAIN_BRANCH"
fi

# Pull latest changes
echo "📥 Pulling latest merged changes..."
git pull

# Verify the version in package.json matches
PACKAGE_VERSION="v$(node -p "require('./package.json').version")"
if [[ "$PACKAGE_VERSION" != "$VERSION" ]]; then
    echo "❌ Version mismatch!"
    echo "   Expected: $VERSION"
    echo "   package.json: $PACKAGE_VERSION"
    echo ""
    echo "   Make sure the release PR has been merged."
    exit 1
fi

# Get current commit
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "📌 Tagging commit: $CURRENT_COMMIT"

# Create and push tag
echo "🏷️  Creating tag $VERSION..."
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"

# Generate release notes
echo ""
echo "📝 Generating release notes..."

# Try to get previous tag
PREVIOUS_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

if [[ -n "$PREVIOUS_TAG" ]]; then
    COMPARE_LINK="https://github.com/waynebrantley/port-manager/compare/${PREVIOUS_TAG}...${VERSION}"
    AUTO_NOTES="## What's Changed

Full changelog: $COMPARE_LINK"
else
    AUTO_NOTES="Release $VERSION"
fi

# Create GitHub Release
echo "🎉 Creating GitHub Release..."

if [[ "$IS_PRERELEASE" == "true" ]]; then
    gh release create "$VERSION" \
        --title "$VERSION" \
        --notes "$AUTO_NOTES" \
        --prerelease
else
    gh release create "$VERSION" \
        --title "$VERSION" \
        --notes "$AUTO_NOTES"
fi

# Clean up temp files
rm -rf .release-temp

echo ""
echo "✅ Release $VERSION finalized successfully!"
echo "   🏷️  Tag: $VERSION"
echo "   📦 npm package will be published automatically via GitHub Actions"
echo "   🔗 View release: https://github.com/waynebrantley/port-manager/releases/tag/$VERSION"
echo ""
echo "🔍 Monitor publish workflow:"
echo "   https://github.com/waynebrantley/port-manager/actions"
echo ""
