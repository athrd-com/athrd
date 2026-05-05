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

  it("extracts repository full name from normalized metadata", () => {
    const file: GistFile = {
      ...gistFile,
      content: JSON.stringify({
        __athrd: {
          thread: {
            source: "claude",
          },
          repository: {
            owner: "athrd-com",
            name: "athrd",
            fullName: "athrd-com/athrd",
          },
          commit: {
            sha: "deadbeef",
          },
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
    expect(context.repoName).toBe("athrd-com/athrd");
    expect(context.commitHash).toBe("deadbeef");
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

  it("loads raw Codex JSONL thread artifacts", () => {
    const context = parseThreadContextFromSourceRecord({
      id: "gist-codex-jsonl",
      source: "gist",
      sourceId: "gist-codex-jsonl",
      filename: "athrd-session-1.jsonl",
      content: [
        JSON.stringify({
          type: "athrd_metadata",
          __athrd: {
            schemaVersion: 1,
            thread: {
              id: "session_1",
              providerSessionId: "session_1",
              source: "codex",
              title: "Raw Codex JSONL",
              startedAt: "2026-03-03T00:00:00.000Z",
              updatedAt: "2026-03-03T00:00:02.000Z",
            },
            actor: {
              githubUsername: "athrd-bot",
              avatarUrl: "https://example.com/avatar.png",
            },
            commit: {
              sha: "deadbeef",
            },
          },
        }),
        JSON.stringify({
          type: "session_meta",
          payload: {
            id: "session_1",
            cwd: "/repo",
            originator: "codex",
            cli_version: "1.0.0",
          },
          timestamp: "2026-03-03T00:00:00.000Z",
        }),
        JSON.stringify({
          timestamp: "2026-03-03T00:00:00.500Z",
          type: "event_msg",
          payload: {
            type: "task_started",
          },
        }),
        JSON.stringify({
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
        }),
        JSON.stringify({
          timestamp: "2026-03-03T00:00:02.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello from JSONL" }],
          },
        }),
      ].join("\n"),
    });

    expect(context.ide).toBe("codex");
    expect(context.title).toBe("Raw Codex JSONL");
    expect(context.commitHash).toBe("deadbeef");
    expect(context.modelsUsed).toContain("gpt-5-high");
    expect(context.record.owner).toMatchObject({
      login: "athrd-bot",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(context.parsedThread.messages).toHaveLength(1);
  });

  it("loads raw Claude JSONL thread artifacts", () => {
    const context = parseThreadContextFromSourceRecord({
      id: "gist-claude-jsonl",
      source: "gist",
      sourceId: "gist-claude-jsonl",
      filename: "athrd-session-2.jsonl",
      content: [
        JSON.stringify({
          type: "athrd_metadata",
          __athrd: {
            schemaVersion: 1,
            thread: {
              id: "session_2",
              providerSessionId: "session_2",
              source: "claude",
              title: "Raw Claude JSONL",
              updatedAt: "2026-03-03T00:00:02.000Z",
            },
            actor: {
              githubUsername: "athrd-bot",
            },
          },
        }),
        JSON.stringify({
          type: "user",
          uuid: "req-1",
          message: {
            role: "user",
            content: "Hello from Claude JSONL",
          },
          timestamp: "2026-03-03T00:00:01.000Z",
          sessionId: "session_2",
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "req-2",
          message: {
            role: "assistant",
            model: "claude-3-5-sonnet-20241022",
            content: [{ type: "text", text: "Hi" }],
            usage: {
              input_tokens: 1,
              output_tokens: 1,
            },
          },
          timestamp: "2026-03-03T00:00:02.000Z",
          sessionId: "session_2",
        }),
      ].join("\n"),
    });

    expect(context.ide).toBe("claude");
    expect(context.title).toBe("Raw Claude JSONL");
    expect(context.modelsUsed).toContain("claude-3-5-sonnet-20241022");
    expect(context.parsedThread.messages.length).toBeGreaterThan(0);
  });

  it("loads raw Gemini JSONL thread artifacts", () => {
    const context = parseThreadContextFromSourceRecord({
      id: "gist-gemini-jsonl",
      source: "gist",
      sourceId: "gist-gemini-jsonl",
      filename: "athrd-session-3.jsonl",
      content: [
        JSON.stringify({
          type: "athrd_metadata",
          __athrd: {
            schemaVersion: 1,
            thread: {
              id: "session_3",
              providerSessionId: "session_3",
              source: "gemini",
              title: "Raw Gemini JSONL",
              updatedAt: "2026-05-05T05:48:30.007Z",
            },
            actor: {
              githubUsername: "athrd-bot",
            },
          },
        }),
        JSON.stringify({
          sessionId: "session_3",
          projectHash:
            "bc49bf60e744d7d8eb0e17d6a5e7179ef44e9f401ad8355de12752e5a9e83b64",
          startTime: "2026-05-05T05:48:00.644Z",
          lastUpdated: "2026-05-05T05:48:00.644Z",
          kind: "main",
        }),
        JSON.stringify({
          id: "user-1",
          timestamp: "2026-05-05T05:48:05.184Z",
          type: "user",
          content: [{ text: "What's this repo about?" }],
        }),
        JSON.stringify({
          $set: {
            lastUpdated: "2026-05-05T05:48:05.184Z",
          },
        }),
        JSON.stringify({
          id: "assistant-1",
          timestamp: "2026-05-05T05:48:17.847Z",
          type: "gemini",
          content: "",
          thoughts: [
            {
              subject: "Exploring Repository Purpose",
              description: "Reading the README.",
              timestamp: "2026-05-05T05:48:17.495Z",
            },
          ],
          model: "gemini-3-flash-preview",
        }),
        JSON.stringify({
          id: "assistant-1",
          timestamp: "2026-05-05T05:48:17.847Z",
          type: "gemini",
          content: "",
          thoughts: [
            {
              subject: "Exploring Repository Purpose",
              description: "Reading the README.",
              timestamp: "2026-05-05T05:48:17.495Z",
            },
          ],
          model: "gemini-3-flash-preview",
          toolCalls: [
            {
              id: "read_file_1",
              name: "read_file",
              args: {
                file_path: "README.md",
              },
              result: [
                {
                  functionResponse: {
                    id: "read_file_1",
                    name: "read_file",
                    response: {
                      output: "# ATHRD",
                    },
                  },
                },
              ],
              status: "success",
              timestamp: "2026-05-05T05:48:17.889Z",
              resultDisplay: "",
              description: "README.md",
              displayName: "ReadFile",
              renderOutputAsMarkdown: true,
            },
          ],
        }),
        JSON.stringify({
          id: "assistant-2",
          timestamp: "2026-05-05T05:48:30.007Z",
          type: "gemini",
          content: "This repo contains ATHRD.",
          model: "gemini-3-flash-preview",
        }),
        JSON.stringify({
          $set: {
            lastUpdated: "2026-05-05T05:48:30.007Z",
          },
        }),
      ].join("\n"),
    });

    expect(context.ide).toBe("gemini");
    expect(context.title).toBe("Raw Gemini JSONL");
    expect(context.modelsUsed).toContain("gemini-3-flash-preview");
    expect(context.parsedThread.messages).toHaveLength(3);
    expect(context.parsedThread.messages[0]).toMatchObject({
      id: "user-1",
      type: "user",
      content: "What's this repo about?",
    });
    expect(context.parsedThread.messages[1]).toMatchObject({
      id: "assistant-1",
      type: "assistant",
      toolCalls: [
        {
          name: "read_file",
          args: {
            file_path: "README.md",
          },
        },
      ],
    });
    expect(context.parsedThread.messages[2]).toMatchObject({
      id: "assistant-2",
      type: "assistant",
      content: "This repo contains ATHRD.",
    });
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

  it("ignores agent instructions when falling back to the first user message for title", () => {
    const context = parseThreadContextFromSourceRecord({
      id: "S-threads/codex.json",
      source: "s3",
      sourceId: "threads/codex.json",
      filename: "codex.json",
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
            timestamp: "2026-03-03T00:00:00.000Z",
            type: "event_msg",
            payload: {
              type: "task_started",
            },
          },
          {
            timestamp: "2026-03-03T00:00:01.000Z",
            type: "response_item",
            payload: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "# AGENTS.md instructions for /Users/example/project\n\n<INSTRUCTIONS>...</INSTRUCTIONS>",
                },
              ],
            },
          },
          {
            timestamp: "2026-03-03T00:00:02.000Z",
            type: "response_item",
            payload: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Real title source",
                },
              ],
            },
          },
        ],
      }),
    });

    expect(context.parsedThread.messages[0]).toMatchObject({
      type: "user",
      variant: "agent-instructions",
    });
    expect(context.title).toBe("Real title source");
  });
});
