<h3 align="center">
  <a name="readme-top"></a>
</h3>
<div align="center">
    <a href="https://github.com/athrd-com/athrd/blob/main/LICENSE">
  <img src="https://img.shields.io/github/license/athrd-com/athrd" alt="License">
</a>
<a href="https://athrd.com">
  <img src="https://img.shields.io/badge/Visit-athrd.dev-orange" alt="Visit athrd.com">
</a>
</div>

# ATHRD

**AI traceability for commits and pull requests.**

## What is athrd?

**athrd** connects AI coding sessions to your software delivery workflow.
It captures sessions from assistants like Claude, Codex, Gemini, Cursor, and
VS Code, then gives your team durable context for code review and knowledge
transfer.

Use athrd to make AI-assisted changes easier to understand:

- What changed
- Why the change was made
- How the solution evolved across prompts and tool calls

## Features

- **Commit and PR Traceability**: Attach AI sessions to commits and surface them in pull requests.
- **Universal Support**: Works with VS Code, Claude, Cursor, Codex, and Gemini.
- **Reviewable Thread Views**: Renders code blocks, tool calls, and assistant reasoning clearly.
- **CLI + Hooks Automation**: Sync sessions from supported CLIs with one install command.
- **Open Source**

## Quickstart

### CLI Installation

Install the CLI tool:

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

Authenticate, then install hooks for automatic session syncing:

```bash
athrd auth
athrd hooks install
```

To share sessions manually:

```bash
athrd share
```

### GitHub Action: sync athrd links into PR body

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

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
