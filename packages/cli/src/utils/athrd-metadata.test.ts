import { describe, expect, test } from "bun:test";
import { injectAthrdMetadata, type AthrdMetadata } from "./athrd-metadata.js";

const metadata: AthrdMetadata = {
  schemaVersion: 1,
  thread: {
    id: "session-1",
    providerSessionId: "session-1",
    source: "codex",
    title: "Add S3 upload support",
    messageCount: 2,
    startedAt: "2026-04-22T14:55:26.053Z",
    updatedAt: "2026-04-22T15:18:42.331Z",
  },
  actor: {
    githubUserId: "123",
    githubUsername: "octocat",
    avatarUrl: "https://avatars.githubusercontent.com/u/123?v=4",
  },
  organization: {
    githubOrgId: "456",
  },
  repository: {
    githubRepoId: "789",
  },
  commit: {
    sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  },
  upload: {
    cliVersion: "1.1.10",
  },
};

describe("injectAthrdMetadata", () => {
  test("rewrites top-level JSON metadata", () => {
    const output = injectAthrdMetadata(
      {
        kind: "raw",
        format: "json",
        fileName: "athrd-session-1.json",
        content: '{"messages":[],"__athrd":{"ide":"codex"}}',
      },
      metadata,
    );

    const parsed = JSON.parse(output);
    expect(parsed.__athrd.thread.source).toBe("codex");
    expect(parsed.__athrd.thread.ide).toBeUndefined();
    expect(parsed.__athrd.upload).toEqual({ cliVersion: "1.1.10" });
    expect(parsed.__athrd.organization).toEqual({ githubOrgId: "456" });
    expect(parsed.__athrd.repository).toEqual({ githubRepoId: "789" });
  });

  test("supports repository metadata without a numeric GitHub repo ID", () => {
    const output = injectAthrdMetadata(
      {
        kind: "raw",
        format: "json",
        fileName: "athrd-session-1.json",
        content: '{"messages":[]}',
      },
      {
        ...metadata,
        repository: {
          owner: "athrd-com",
          name: "athrd",
          fullName: "athrd-com/athrd",
        },
      },
    );

    const parsed = JSON.parse(output);
    expect(parsed.__athrd.repository).toEqual({
      owner: "athrd-com",
      name: "athrd",
      fullName: "athrd-com/athrd",
    });
  });

  test("prepends one JSONL metadata row and removes existing metadata rows", () => {
    const output = injectAthrdMetadata(
      {
        kind: "raw",
        format: "jsonl",
        fileName: "athrd-session-1.jsonl",
        content:
          '{"type":"athrd_metadata","__athrd":{"schemaVersion":1}}\n{"type":"session"}\n{"type":"message"}',
      },
      metadata,
    );

    const rows = output.trim().split("\n").map((line) => JSON.parse(line));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      type: "athrd_metadata",
      __athrd: {
        thread: {
          source: "codex",
        },
      },
    });
    expect(rows[1]).toEqual({ type: "session" });
    expect(rows[2]).toEqual({ type: "message" });
  });
});
