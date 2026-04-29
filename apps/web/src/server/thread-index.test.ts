import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbQueryMock, fetchGistMock, s3ReadThreadMock, githubFetchMock } =
  vi.hoisted(() => ({
    dbQueryMock: vi.fn(),
    fetchGistMock: vi.fn(),
    s3ReadThreadMock: vi.fn(),
    githubFetchMock: vi.fn(),
  }));

vi.mock("~/server/db", () => ({
  db: {
    query: dbQueryMock,
  },
}));

vi.mock("~/lib/github", () => ({
  fetchGist: fetchGistMock,
  fetchUserGists: vi.fn(),
  deleteGist: vi.fn(),
  updateGistDescription: vi.fn(),
}));

vi.mock("~/lib/sources/s3", () => ({
  S3ThreadSourceProvider: class S3ThreadSourceProvider {
    readThread = s3ReadThreadMock;
  },
}));

describe("thread-index sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", githubFetchMock);
    githubFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 123,
          login: "octo",
          avatar_url: "https://example.com/avatar.png",
          html_url: "https://github.com/octo",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    dbQueryMock.mockResolvedValue({
      rows: [{ id: "gist-1" }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("verifies the GitHub token, reads the canonical gist, and stores the thread", async () => {
    const content = JSON.stringify({
      __athrd: {
        ide: "claude",
        title: "Indexed title",
        githubRepo: "athrd-com/athrd",
        commitHash: "deadbeef",
        ghRepoId: 789,
        orgId: 456,
        orgName: "athrd-com",
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
          timestamp: "2026-04-22T00:00:00.000Z",
        },
      ],
    });

    fetchGistMock.mockResolvedValue({
      gist: {
        id: "gist-1",
        description: "Gist fallback title",
        owner: {
          id: 123,
          login: "octo",
          avatar_url: "https://example.com/avatar.png",
          html_url: "https://github.com/octo",
          url: "https://api.github.com/users/octo",
          type: "User",
        },
        files: {},
        created_at: "2026-04-22T00:00:00.000Z",
        updated_at: "2026-04-23T00:00:00.000Z",
      },
      file: {
        filename: "athrd-thread.json",
        type: "application/json",
        language: "JSON",
        raw_url: "https://example.com/raw",
        size: 100,
        content,
      },
    });

    const { syncThreadIndex } = await import("./thread-index");

    await expect(
      syncThreadIndex({
        source: "gist",
        sourceId: "gist-1",
        accessToken: "github-token",
      }),
    ).resolves.toEqual({
      publicId: "gist-1",
    });

    expect(githubFetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer github-token",
        }),
      }),
    );
    expect(fetchGistMock).toHaveBeenCalledWith("gist-1", {
      accessToken: "github-token",
      noStore: true,
    });

    const contentParams = dbQueryMock.mock.calls[0]?.[1] as unknown[];
    expect(contentParams[0]).toBe("gist-1");
    expect(contentParams[1]).toBe("gist");
    expect(contentParams[2]).toBe("gist-1");
    expect(contentParams[3]).toBe("123");
    expect(contentParams[4]).toBe("octo");
    expect(contentParams[5]).toBe("athrd-thread.json");
    expect(contentParams[6]).toBe(content);
    expect(contentParams[7]).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));

    expect(dbQueryMock.mock.calls[1]?.[1]).toEqual([
      "456",
      "athrd-com",
      null,
    ]);

    const params = dbQueryMock.mock.calls[2]?.[1] as unknown[];
    expect(params[0]).toBe("gist-1");
    expect(params[1]).toBe("gist");
    expect(params[3]).toBe("123");
    expect(params[5]).toBe("Gist fallback title");
    expect(params[6]).toBe("claude");
    expect(params[7]).toBe("claude-3-5-sonnet-20241022");
    expect(params[9]).toBe("athrd-com/athrd");
    expect(params[10]).toBe("deadbeef");
    expect(params[11]).toBe("789");
    expect(params[12]).toBe("456");
  });

  it("rejects gist ownership mismatches", async () => {
    fetchGistMock.mockResolvedValue({
      gist: {
        id: "gist-1",
        description: "Other user",
        owner: {
          id: 999,
          login: "someone-else",
          avatar_url: "",
          html_url: "https://github.com/someone-else",
          url: "https://api.github.com/users/someone-else",
          type: "User",
        },
        files: {},
        created_at: "2026-04-22T00:00:00.000Z",
        updated_at: "2026-04-23T00:00:00.000Z",
      },
      file: {
        filename: "athrd-thread.json",
        type: "application/json",
        language: "JSON",
        raw_url: "https://example.com/raw",
        size: 100,
        content: "{}",
      },
    });

    const { syncThreadIndex, ThreadSyncError } = await import("./thread-index");

    await expect(
      syncThreadIndex({
        source: "gist",
        sourceId: "gist-1",
        accessToken: "github-token",
      }),
    ).rejects.toBeInstanceOf(ThreadSyncError);
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it("indexes parse failures without rejecting the sync", async () => {
    fetchGistMock.mockResolvedValue({
      gist: {
        id: "gist-1",
        description: "Broken thread",
        owner: {
          id: 123,
          login: "octo",
          avatar_url: "https://example.com/avatar.png",
          html_url: "https://github.com/octo",
          url: "https://api.github.com/users/octo",
          type: "User",
        },
        files: {},
        created_at: "2026-04-22T00:00:00.000Z",
        updated_at: "2026-04-23T00:00:00.000Z",
      },
      file: {
        filename: "athrd-broken.json",
        type: "application/json",
        language: "JSON",
        raw_url: "https://example.com/raw",
        size: 100,
        content: "{",
      },
    });

    const { syncThreadIndex } = await import("./thread-index");

    await expect(
      syncThreadIndex({
        source: "gist",
        sourceId: "gist-1",
        accessToken: "github-token",
      }),
    ).resolves.toMatchObject({ publicId: "gist-1" });

    const contentParams = dbQueryMock.mock.calls[0]?.[1] as unknown[];
    expect(contentParams[5]).toBe("athrd-broken.json");
    expect(contentParams[6]).toBe("{");

    const params = dbQueryMock.mock.calls[1]?.[1] as unknown[];
    expect(params[5]).toBe("Broken thread");
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
  });

  it("validates S3 source ownership before reading the object", async () => {
    const { syncThreadIndex, ThreadSyncError } = await import("./thread-index");

    await expect(
      syncThreadIndex({
        source: "s3",
        sourceId: "456/999/thread.json",
        accessToken: "github-token",
      }),
    ).rejects.toBeInstanceOf(ThreadSyncError);

    expect(s3ReadThreadMock).not.toHaveBeenCalled();
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});
