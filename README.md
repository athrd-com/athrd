<h3 align="center">
  <a name="readme-top"></a>
</h3>
<div align="center">
    <a href="https://github.com/athrd-com/athrd/blob/main/LICENSE">
  <img src="https://img.shields.io/github/license/athrd-com/athrd" alt="License">
</a>
    <a href="https://pepy.tech/project/athrd-py">
  <img src="https://static.pepy.tech/badge/athrd-py" alt="Downloads">
</a>
<a href="https://athrd.com">
  <img src="https://img.shields.io/badge/Visit-athrd.dev-orange" alt="Visit athrd.com">
</a>
</div>

# 🧵 athrd

**Share your AI coding threads with the world.**

[License](LICENSE) <!-- | [Website](https://athrd.com) -->

## What is athrd?

**athrd** is a platform that allows you to share your coding conversations from your favorite AI assistants. Whether you're debugging with Claude, generating code with Copilot in VS Code, or building with Cursor, athrd provides a beautiful, shareable link for your threads.

Turn your private debugging sessions into public knowledge bases.

## Features

- **Universal Support**: Works with VS Code, Claude, Cursor, and Codex.
- **Beautiful Visualization**: Renders code blocks, tool use, and thinking processes elegantly.
- **CLI Tool**: Share threads directly from your terminal.
- **Open Source**: Self-hostable and community-driven.

## How to use it?

### CLI Installation

To start sharing threads, install the CLI tool:

```bash
npm install -g @athrd/cli
```

Or using other package managers:

```bash
pnpm add -g @athrd/cli
# or
yarn global add @athrd/cli
```

### Usage

Authenticate once:

```bash
athrd auth
```

During `athrd auth`, you'll be asked whether to install hooks for automatic syncing (recommended).

Share threads manually anytime:

```bash
athrd share
```

Optional hook management:

```bash
# disable automatic syncing
athrd hooks uninstall

# re-enable automatic syncing
athrd hooks install
```

When hooks are installed:

- `athrd share --mark` writes thread URLs to `.agent-session-marker` in the repo root.
- a global Git `commit-msg` hook appends `Agent-Session: <url>` trailers from `.agent-session-marker`.
- used entries in `.agent-session-marker` are cleared after successful commit message updates.

### GitHub Action: auto-append athrd links to PRs

If you want repo-owned automation (no GitHub App install), add this workflow to the target repository:

```yaml
name: Sync Athrd Links In PR Body

on:
  pull_request_target:
    types: [opened, reopened, synchronize, edited, ready_for_review]

permissions:
  pull-requests: write
  contents: read

jobs:
  sync-athrd-links:
    if: github.event.pull_request.state != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v8
        with:
          script: |
            // See .github/workflows/athrd-pr-links.yml in this repo for full script.
```

This keeps a bot-managed section in the PR description between:

- `<!-- athrd-links:start -->`
- `<!-- athrd-links:end -->`

and recomputes links from all commit messages in the PR on each sync/open/edit event.
It reads `Agent-Session: <url>` trailers (and still supports direct athrd URLs for backward compatibility).
## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
