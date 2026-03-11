import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GistData, GistFile } from "~/lib/github";
import {
  loadThreadContext,
  parseThreadContextFromGistFile,
  parseThreadContextFromSourceRecord,
  ThreadLoadError,
} from "./thread-loader";

vi.mock("./thread-source", async () => {
  return {
    createThreadSourceRecordFromGist: (gist: GistData, file: GistFile) => ({
      id: gist.id,
      source: "gist" as const,
      sourceId: gist.id,
      title: gist.description || undefined,
      createdAt: gist.created_at,
      updatedAt: gist.updated_at,
      owner: {
        login: gist.owner.login,
        avatarUrl: gist.owner.avatar_url,
        profileUrl: gist.owner.html_url,
        type: gist.owner.type,
      },
      filename: file.filename,
      content: file.content || "",
    }),
    readThreadSourceRecord: vi.fn(),
    ThreadSourceLookupError: class ThreadSourceLookupError extends Error {},
  };
});

const gistFile: GistFile = {
  filename: "athrd-thread.json",
  type: "application/json",
  language: "JSON",
  raw_url: "https://example.com/raw",
  size: 100,
  content: "",
};

const gistData: GistData = {
  id: "gist-1",
  description: "Test thread",
  owner: {
    login: "user",
    id: 1,
    avatar_url: "https://example.com/avatar.png",
    url: "https://api.github.com/users/user",
    html_url: "https://github.com/user",
    type: "User",
  },
  files: {
    "athrd-thread.json": gistFile,
  },
  created_at: "2026-03-03T00:00:00.000Z",
  updated_at: "2026-03-03T00:00:00.000Z",
};

describe("thread-loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a valid thread and extracts metadata", () => {
    const file: GistFile = {
      ...gistFile,
      content: JSON.stringify({
        __athrd: {
          ide: "claude",
          githubRepo: "athrd-com/athrd",
          commitHash: "deadbeef",
        },
        requests: [
          {
            id: "req-1",
            type: "user",
            message: {
              role: "user",
              content: "Hello",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2026-03-03T00:00:00.000Z",
          },
        ],
      }),
    };

    const context = parseThreadContextFromGistFile(gistData, file);
    expect(context.ide).toBe("claude");
    expect(context.repoName).toBe("athrd-com/athrd");
    expect(context.commitHash).toBe("deadbeef");
    expect(context.modelsUsed).toContain("claude-3-5-sonnet-20241022");
    expect(context.parsedThread.messages).toHaveLength(1);
  });

  it("extracts Codex models with effort from turn_context payloads", () => {
    const file: GistFile = {
      ...gistFile,
      content: JSON.stringify({
        __athrd: {
          ide: "codex",
        },
        sessionId: "session_1",
        timestamp: "2026-03-03T00:00:00.000Z",
        type: "message",
        payload: {
          id: "session_1",
          timestamp: "2026-03-03T00:00:00.000Z",
          cwd: "/repo",
          originator: "codex",
          cli_version: "1.0.0",
          instructions: null,
          source: "cli",
          model_provider: "openai",
          git: {
            commit_hash: "deadbeef",
            branch: "main",
            repository_url: "https://github.com/athrd-com/athrd",
          },
        },
        messages: [
          {
            timestamp: "2026-03-03T00:00:01.000Z",
            type: "turn_context",
            payload: {
              cwd: "/repo",
              approval_policy: "auto",
              sandbox_policy: {
                type: "strict",
                network_access: false,
                exclude_tmpdir_env_var: false,
                exclude_slash_tmp: false,
              },
              model: "gpt-5",
              effort: "high",
              summary: null,
            },
          },
          {
            timestamp: "2026-03-03T00:00:02.000Z",
            type: "turn_context",
            payload: {
              cwd: "/repo",
              approval_policy: "auto",
              sandbox_policy: {
                type: "strict",
                network_access: false,
                exclude_tmpdir_env_var: false,
                exclude_slash_tmp: false,
              },
              model: "gpt-4.1",
              summary: null,
            },
          },
        ],
      }),
    };

    const context = parseThreadContextFromGistFile(gistData, file);
    expect(context.modelsUsed).toContain("gpt-5-high");
    expect(context.modelsUsed).toContain("gpt-4.1");
  });

  it("throws INVALID_JSON for malformed content", () => {
    const file: GistFile = {
      ...gistFile,
      content: "{",
    };

    expect(() => parseThreadContextFromGistFile(gistData, file)).toThrowError(
      ThreadLoadError,
    );

    try {
      parseThreadContextFromGistFile(gistData, file);
    } catch (error) {
      expect(error).toBeInstanceOf(ThreadLoadError);
      expect((error as ThreadLoadError).code).toBe("INVALID_JSON");
    }
  });

  it("throws NOT_FOUND when gist or file is missing", async () => {
    const { readThreadSourceRecord } = await import("./thread-source");
    const readThreadSourceRecordMock = readThreadSourceRecord as unknown as {
      mockResolvedValueOnce: (value: unknown) => unknown;
    };
    readThreadSourceRecordMock.mockResolvedValueOnce(null);

    await expect(loadThreadContext("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("fills missing display metadata from the raw thread body", () => {
    const context = parseThreadContextFromSourceRecord({
      id: "S-threads/demo.json",
      source: "s3",
      sourceId: "threads/demo.json",
      filename: "demo.json",
      content: JSON.stringify({
        __athrd: {
          ide: "claude",
          githubUsername: "athrd-bot",
        },
        title: "Body title",
        timestamp: "2026-03-03T00:00:00.000Z",
        requests: [
          {
            id: "req-1",
            type: "user",
            message: {
              role: "user",
              content: "Hello from S3",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2026-03-03T00:00:00.000Z",
          },
        ],
      }),
    });

    expect(context.title).toBe("Body title");
    expect(context.record.owner).toMatchObject({
      login: "athrd-bot",
      profileUrl: "https://github.com/athrd-bot",
    });
    expect(context.record.createdAt).toBe("2026-03-03T00:00:00.000Z");
  });
});
