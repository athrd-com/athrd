# athrd Metadata Contract

This contract defines the normalized metadata athrd writes into uploaded session
artifacts and indexes in Postgres. Gist and S3 are storage backends only. Raw
metadata must not depend on the selected storage backend.

## Goals

- Raw session content stays as close as possible to the source tool output.
- Every uploaded session has one normalized athrd metadata object.
- JSON and JSONL sessions expose the same normalized metadata.
- The threads page, summaries, and weekly digests read indexed database rows,
  not provider-specific storage listings.
- New fields are additive. Breaking changes require a new `schemaVersion`.

## Current Version

`schemaVersion: 1`

## Canonical JSON Object

For JSON session files, write metadata at the top-level `__athrd` key.

```json
{
  "__athrd": {
    "schemaVersion": 1,
    "thread": {
      "id": "019db5b0-5765-740b-9c85-535e5009fd9b",
      "providerSessionId": "019db5b0-5765-740b-9c85-535e5009fd9b",
      "source": "codex",
      "title": "Add S3 upload support",
      "messageCount": 14,
      "startedAt": "2026-04-22T14:55:26.053Z",
      "updatedAt": "2026-04-22T15:18:42.331Z"
    },
    "actor": {
      "githubUserId": "123",
      "githubUsername": "octocat",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123?v=4"
    },
    "organization": {
      "githubOrgId": "456"
    },
    "repository": {
      "githubRepoId": "789",
      "owner": "athrd-com",
      "name": "athrd",
      "fullName": "athrd-com/athrd"
    },
    "commit": {
      "sha": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "branch": "main"
    },
    "upload": {
      "cliVersion": "1.1.7"
    }
  }
}
```

## Canonical JSONL Row

For JSONL session files, add one dedicated metadata row. Prefer placing it as
the first row when athrd writes a new exported artifact. When athrd enriches an
existing provider file in-place, appending the row is acceptable if prepending
would be risky.

Parsers must ignore rows with `type: "athrd_metadata"`.

```jsonl
{"type":"athrd_metadata","__athrd":{"schemaVersion":1,"thread":{"id":"019db5b0-5765-740b-9c85-535e5009fd9b","providerSessionId":"019db5b0-5765-740b-9c85-535e5009fd9b","source":"codex","title":"Add S3 upload support","messageCount":14,"startedAt":"2026-04-22T14:55:26.053Z","updatedAt":"2026-04-22T15:18:42.331Z"},"actor":{"githubUserId":"123","githubUsername":"octocat","avatarUrl":"https://avatars.githubusercontent.com/u/123?v=4"},"organization":{"githubOrgId":"456"},"repository":{"githubRepoId":"789"},"commit":{"sha":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef","branch":"main"},"upload":{"cliVersion":"1.1.7"}}}
```

## Field Rules

### `thread`

Required.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | athrd stable session id. Usually the provider session id. |
| `providerSessionId` | string | yes | Original tool session id before athrd normalization. |
| `source` | string | yes | Session source, for example `vscode`, `claude`, `codex`, `gemini`, `cursor`, `pi`, or `opencode`. |
| `title` | string | no | User-visible title. Prefer provider title, then first user prompt fallback. |
| `messageCount` | number | no | Count of user requests or user-visible turns. |
| `startedAt` | ISO string | no | Earliest provider timestamp. |
| `updatedAt` | ISO string | yes | Latest provider timestamp or upload time fallback. |

### `actor`

Required for authenticated uploads.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `githubUserId` | string | yes | Store GitHub IDs as strings everywhere. |
| `githubUsername` | string | yes | Login at upload time. |
| `avatarUrl` | string | no | Display only. Do not use as identity. |

### `organization`

Optional. Omit for personal-account uploads with no GitHub org.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `githubOrgId` | string | yes | Store GitHub IDs as strings everywhere. |

For personal uploads, the owner is represented by `actor`. Do not create a fake
organization object for the user account in raw metadata.

### `repository`

Optional, but should be present when the session workspace is inside a GitHub
repository.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `githubRepoId` | string | no | GitHub repository ID when available. Store GitHub IDs as strings everywhere. |
| `owner` | string | no | Repository owner login from the local Git remote. |
| `name` | string | no | Repository name from the local Git remote. |
| `fullName` | string | no | `owner/name` from the local Git remote. Prefer this when GitHub API metadata is not fetched. |

When the CLI avoids GitHub repository metadata lookups, write `owner`, `name`,
and `fullName` without `githubRepoId`. Servers should index those uploads with a
stable slug-derived repository key.

### `commit`

Optional.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `sha` | string | no | Full 40-character SHA when available. |
| `branch` | string | no | Best-effort local branch name at upload time. |

### `upload`

Optional.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `cliVersion` | string | no | CLI version that created the artifact. |

## Normalization Rules

- All timestamps must be ISO 8601 UTC strings.
- All GitHub IDs must be strings, not numbers.
- `organization.githubOrgId` and `repository.githubRepoId` are GitHub IDs, not
  database primary keys.
- `thread.id` must not include storage prefixes like `S-`.
- `thread.source` describes the assistant/session source, not the storage
  backend.
- Missing optional objects must be omitted, not filled with empty strings.
- Unknown fields under `__athrd` are allowed and must be ignored by older
  readers.

## Database Mapping

The database should index the normalized fields plus upload result fields. It
should never require reading raw Gist/S3 objects to render the threads list.

| DB field | Source |
| --- | --- |
| `organizations.github_org_id` | `organization.githubOrgId` |
| `organizations.login` | GitHub API lookup or legacy metadata fallback |
| `organizations.storage_provider` | Organization setting |
| `repositories.github_repo_id` | `repository.githubRepoId`, or an internal `slug:owner/name` key when no GitHub repo ID is available |
| `repositories.full_name` | `repository.fullName`, GitHub API lookup, or legacy metadata fallback |
| `threads.thread_id` | `thread.id` |
| `threads.provider_session_id` | `thread.providerSessionId` |
| `threads.owner_github_user_id` | `actor.githubUserId` |
| `threads.organization_github_org_id` | `organization.githubOrgId` |
| `threads.repository_github_repo_id` | `repository.githubRepoId` |
| `threads.public_id` | Upload result |
| `threads.storage_provider` | Upload result |
| `threads.storage_source_id` | Upload result |
| `threads.title` | `thread.title` |
| `threads.source` | `thread.source` |
| `threads.started_at` | `thread.startedAt` |
| `threads.updated_at` | `thread.updatedAt` |
| `threads.uploaded_at` | Ingest timestamp |
| `threads.commit_sha` | `commit.sha` |

Per-session AI summaries and weekly digests are database products. Do not write
generated summary text back into raw session metadata by default.

## Backward Compatibility

Current ad hoc fields should be read as fallbacks and written only through the
new contract.

| Legacy field | Read as |
| --- | --- |
| `__athrd.githubUsername` | `__athrd.actor.githubUsername` |
| `__athrd.githubRepo` | `repositories.full_name` fallback |
| `__athrd.ide` | `__athrd.thread.source` |
| `__athrd.title` | `__athrd.thread.title` |
| `__athrd.commitHash` | `__athrd.commit.sha` |
| `__athrd.ghRepoId` | `__athrd.repository.githubRepoId` |
| `__athrd.orgId` | `__athrd.organization.githubOrgId` |
| `__athrd.orgName` | `organizations.login` fallback |
| `__athrd.orgIcon` | Display fallback only |

Readers should support legacy fields until all existing uploads are migrated or
re-indexed.

## Validation Checklist

Before persisting a thread row:

- `schemaVersion` is `1`.
- `thread.id`, `thread.source`, `thread.updatedAt`, `actor.githubUserId`, and
  `actor.githubUsername` are present.
- `organization.githubOrgId` and `repository.githubRepoId`, when present, are
  strings.
- `repository` includes at least `githubRepoId`, `fullName`, or both `owner` and
  `name` when present.
- All timestamps parse as valid dates.
- All GitHub IDs are strings.
