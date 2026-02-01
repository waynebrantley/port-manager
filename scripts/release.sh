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

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

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

# Determine release type and validate branch
echo "📦 Preparing $RELEASE_TYPE release from branch: $CURRENT_BRANCH"
case "$RELEASE_TYPE" in
    patch|minor|major)
        # Stable releases must be from main branch
        if [[ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]]; then
            echo "❌ Stable releases must be from the $MAIN_BRANCH branch."
            echo "   Current branch: $CURRENT_BRANCH"
            echo "   For pre-releases from feature branches, use: beta or alpha"
            exit 1
        fi
        NEW_VERSION=$(npm version $RELEASE_TYPE --no-git-tag-version)
        IS_PRERELEASE=false
        BASE_BRANCH="$MAIN_BRANCH"
        ;;
    beta|alpha)
        # Pre-releases can be from any branch
        echo "💡 Creating pre-release from branch: $CURRENT_BRANCH"
        NEW_VERSION=$(npm version prerelease --preid=$RELEASE_TYPE --no-git-tag-version)
        IS_PRERELEASE=true
        BASE_BRANCH="$CURRENT_BRANCH"
        ;;
    *)
        echo "❌ Invalid release type: $RELEASE_TYPE"
        echo "   Valid types: patch, minor, major, beta, alpha"
        exit 1
        ;;
esac

echo "📝 New version: $NEW_VERSION"

# Commit version change on current branch
git add package.json
git commit -m "Release $NEW_VERSION"

# For stable releases from main, use PR workflow
if [[ "$IS_PRERELEASE" == "false" ]]; then
    # Create release branch
    RELEASE_BRANCH="release/$NEW_VERSION"
    git checkout -b "$RELEASE_BRANCH"

    # Push branch
    echo "📤 Pushing release branch..."
    git push -u origin "$RELEASE_BRANCH"

    # Create PR
    echo "📋 Creating pull request..."
    PR_BODY="Release $NEW_VERSION

## Changes
Version bump from release script.

## Post-merge
After this PR is merged, run \`./scripts/finalize-release.sh\` to create the tag and GitHub release."

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
else
    # For pre-releases, create tag and release immediately
    echo "📤 Pushing changes and creating release..."
    git push origin "$CURRENT_BRANCH"

    # Create and push tag
    echo "🏷️  Creating tag $NEW_VERSION..."
    git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"
    git push origin "$NEW_VERSION"

    # Create GitHub Release
    echo "🎉 Creating GitHub pre-release..."

    RELEASE_NOTES="Pre-release $NEW_VERSION from branch \`$CURRENT_BRANCH\`

## Installation
\`\`\`bash
npm install @wbrantley/port-manager@next
\`\`\`"

    gh release create "$NEW_VERSION" \
        --title "$NEW_VERSION" \
        --notes "$RELEASE_NOTES" \
        --prerelease \
        --target "$CURRENT_BRANCH"

    echo ""
    echo "✅ Pre-release $NEW_VERSION created successfully!"
    echo "   🏷️  Tag: $NEW_VERSION"
    echo "   🌿 Branch: $CURRENT_BRANCH"
    echo "   📦 npm package will be published automatically via GitHub Actions"
    echo "   🔗 View release: https://github.com/waynebrantley/port-manager/releases/tag/$NEW_VERSION"
    echo ""
    echo "🔍 Monitor publish workflow:"
    echo "   https://github.com/waynebrantley/port-manager/actions"
    echo ""
fi
