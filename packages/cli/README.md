# ATHRD CLI

Command-line tools for sharing AI coding sessions with athrd.

## Installation

```bash
npm install -g @athrd/cli
```

## Usage

Log in with GitHub, then install hooks for automatic session syncing:

```bash
athrd login
athrd hooks install
```

Share sessions manually:

```bash
athrd share
```

Session uploads replace detected secrets with `********` before they are written
to Gists or signed upload storage.

Log out and clear stored credentials:

```bash
athrd logout
```
