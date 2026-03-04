import type { GistData, GistFile } from "~/lib/github";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadThreadContext,
  parseThreadContextFromGistFile,
  ThreadLoadError,
} from "./thread-loader";

vi.mock("~/lib/github", () => ({
  fetchGist: vi.fn(),
}));

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
    const { fetchGist } = await import("~/lib/github");
    const fetchGistMock = fetchGist as unknown as {
      mockResolvedValueOnce: (value: unknown) => unknown;
    };
    fetchGistMock.mockResolvedValueOnce({});

    await expect(loadThreadContext("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
