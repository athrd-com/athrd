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

3. Publish the package
```bash
npm publish --access public
```

4. Create a GitHub release
```bash
VERSION=$(node -p "require('./packages/cli/package.json').version")
gh release create v$VERSION --generate-notes
```
