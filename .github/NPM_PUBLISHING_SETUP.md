# npm Publishing Setup with GitHub Actions

This repository uses GitHub Actions to automatically publish to npm with **Trusted Publishing (OIDC)** for enhanced security. No long-lived npm tokens required!

## Setup Steps

### 1. Configure npm Trusted Publishing

1. Go to your package page on npm: `https://www.npmjs.com/package/port-manager/access`
2. Navigate to "Publishing access" section
3. Click "Add GitHub Actions"
4. Configure:
   - **Repository**: `waynebrantley/port-manager`
   - **Workflow**: `.github/workflows/publish.yml`
   - **Environment** (optional): Leave blank or specify if you use GitHub environments

This allows GitHub Actions to publish your package using short-lived OIDC tokens instead of long-lived access tokens.

### 2. Configure package.json

Ensure your `package.json` has:
```json
{
  "name": "port-manager",
  "version": "x.y.z",
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

### 3. Publishing

The workflow triggers automatically when you:

1. **Create a GitHub Release**: The package will be published automatically
2. **Manual Trigger**: Go to Actions → Publish to npm → Run workflow

#### Publishing Flow

**Regular Release:**
1. Update version in `package.json` (e.g., `1.0.0`)
2. Commit and push: `git commit -am "Release v1.0.0" && git push`
3. Create and push tag: `git tag v1.0.0 && git push origin v1.0.0`
4. Create GitHub Release from the tag (uncheck "Set as a pre-release")
5. Workflow publishes to npm under `latest` tag

**Pre-release (beta, alpha, rc):**
1. Update version in `package.json` (e.g., `1.0.0-beta.1`)
2. Commit and push: `git commit -am "Release v1.0.0-beta.1" && git push`
3. Create and push tag: `git tag v1.0.0-beta.1 && git push origin v1.0.0-beta.1`
4. Create GitHub Release from the tag and **check "Set as a pre-release"**
5. Workflow publishes to npm under `next` tag

Users install pre-releases with: `npm install port-manager@next`

## Security Benefits

### Trusted Publishing with OIDC

Instead of using long-lived npm tokens stored as GitHub secrets, this workflow uses OIDC (OpenID Connect) to generate short-lived, workflow-specific credentials. Benefits:

- **No token management**: No need to create, rotate, or revoke npm tokens
- **Reduced attack surface**: No long-lived credentials that could be stolen
- **Automatic expiration**: OIDC tokens expire immediately after use
- **Workflow-specific**: Tokens only work for the specific repository and workflow you configure

### Provenance Attestation

The `--provenance` flag generates cryptographic attestation that proves:
- The package was built in GitHub Actions
- Which repository and workflow built it
- The exact commit that was used
- When it was built

This provides supply chain security and transparency for your package users.

### Verify Provenance

After publishing, users can verify the provenance by:
```bash
npm view port-manager --json | jq .dist
```

Or on the npm website at: `https://www.npmjs.com/package/port-manager`

## References

- [setup-npm-trusted-publish](https://github.com/azu/setup-npm-trusted-publish) - GitHub Action for npm OIDC publishing
- [npm Provenance Documentation](https://docs.npmjs.com/generating-provenance-statements)

## Before Publishing Checklist

- [ ] Configure npm Trusted Publishing (one-time setup, see above)
- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md` (if applicable)
- [ ] Commit and push all changes
- [ ] Create a GitHub Release with a tag (e.g., `v1.0.0`)
- [ ] GitHub Actions will automatically publish to npm

## Troubleshooting

**Publishing fails with authentication error:**
- Ensure you've configured npm Trusted Publishing for your package
- Verify the repository and workflow names match exactly
- Check that the workflow has `id-token: write` permission

**First publish fails:**
- For the first publish, you may need to manually publish once with `npm publish` to create the package
- Then configure Trusted Publishing in the npm package settings
- Subsequent releases will work automatically
