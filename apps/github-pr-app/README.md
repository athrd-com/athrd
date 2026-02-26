# GitHub PR Athrd Links App

A public-installable GitHub App service that scans pull request commit messages for `https://athrd.com/...` URLs and keeps a bot-managed section in the PR body up to date.

## What it does

- Listens to `pull_request` events.
- Handles `opened`, `reopened`, `synchronize`, `edited`, and `ready_for_review` actions.
- Recomputes links from all current PR commits.
- Deduplicates links and updates this PR section:

```md
<!-- athrd-links:start -->
## Athrd links
- https://athrd.com/...
<!-- athrd-links:end -->
```

- Removes the section if no links exist.

## Required environment variables

- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY` (PEM text; `\n` escaped newlines supported)
- `GITHUB_WEBHOOK_SECRET`
- Optional: `PORT` (default `3000`), `LOG_LEVEL`

## Local development

```bash
bun install
bun run --cwd apps/github-pr-app dev
```

Server endpoints:

- `POST /webhooks/github`
- `GET /health`

## Create and configure the GitHub App

1. In GitHub, create a new GitHub App.
2. Set **Webhook URL** to `https://<your-host>/webhooks/github`.
3. Set **Webhook secret** to your `GITHUB_WEBHOOK_SECRET`.
4. Set permissions:
- Pull requests: **Read and write**
- Contents: **Read**
5. Subscribe to **Pull request** events.
6. Generate a private key and set it in `GITHUB_PRIVATE_KEY`.
7. Make the app public and enable installation for any account.

## Test

```bash
bun run --cwd apps/github-pr-app test
```
