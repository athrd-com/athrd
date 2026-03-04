---
description: Deploy the CLI package to npm
---

1. Navigate to the CLI package directory
```bash
cd packages/cli
```

2. Login to npm (if not already logged in)
```bash
npm login
```

3. Compare npm and local versions, and bump if they are identical
```bash
PACKAGE_NAME=$(node -p "require('./package.json').name")
LOCAL_VERSION=$(node -p "require('./package.json').version")
NPM_VERSION=$(npm view "$PACKAGE_NAME" version 2>/dev/null || echo "")

if [ "$LOCAL_VERSION" = "$NPM_VERSION" ]; then
  npm version patch -m "chore(cli): bump version to %s"
  # npm version creates both a commit and a git tag (vX.Y.Z)
fi
```

4. Publish the package
```bash
npm publish --access public
```

5. Create a GitHub release
```bash
VERSION=$(node -p "require('./package.json').version")
gh release create "v$VERSION" --generate-notes
```
