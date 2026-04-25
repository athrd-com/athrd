import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { parseClientThreadIndexMetadataMock, syncThreadIndexMock } = vi.hoisted(() => ({
  parseClientThreadIndexMetadataMock: vi.fn((value) => value),
  syncThreadIndexMock: vi.fn(),
}));

vi.mock("~/server/thread-index", () => {
  class ThreadSyncError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = "ThreadSyncError";
      this.status = status;
      this.code = code;
    }
  }

  return {
    isThreadSyncSource: (value: unknown) => value === "gist" || value === "s3",
    parseClientThreadIndexMetadata: parseClientThreadIndexMetadataMock,
    syncThreadIndex: syncThreadIndexMock,
    ThreadSyncError,
  };
});

describe("POST /api/threads/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseClientThreadIndexMetadataMock.mockImplementation((value) => value);
  });

  it("rejects requests without a bearer token", async () => {
    const response = await POST(
      new Request("http://localhost/api/threads/sync", {
        method: "POST",
        body: JSON.stringify({ source: "gist", sourceId: "gist-1" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(syncThreadIndexMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported source payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/threads/sync", {
        method: "POST",
        headers: { Authorization: "Bearer github-token" },
        body: JSON.stringify({ source: "dropbox", sourceId: "thread-1" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(syncThreadIndexMock).not.toHaveBeenCalled();
  });

  it("syncs valid requests", async () => {
    syncThreadIndexMock.mockResolvedValueOnce({
      publicId: "gist-1",
    });

    const response = await POST(
      new Request("http://localhost/api/threads/sync", {
        method: "POST",
        headers: { Authorization: "Bearer github-token" },
        body: JSON.stringify({
          source: "gist",
          sourceId: "gist-1",
          metadata: {
            ownerGithubId: "123",
            contentSha256:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      publicId: "gist-1",
    });
    expect(syncThreadIndexMock).toHaveBeenCalledWith({
      source: "gist",
      sourceId: "gist-1",
      accessToken: "github-token",
      metadata: {
        ownerGithubId: "123",
        contentSha256:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    });
  });

  it("returns sync-layer errors", async () => {
    const { ThreadSyncError } = await import("~/server/thread-index");
    syncThreadIndexMock.mockRejectedValueOnce(
      new ThreadSyncError(403, "owner_mismatch", "Not yours"),
    );

    const response = await POST(
      new Request("http://localhost/api/threads/sync", {
        method: "POST",
        headers: { Authorization: "Bearer github-token" },
        body: JSON.stringify({ source: "gist", sourceId: "gist-1" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "owner_mismatch",
        message: "Not yours",
      },
    });
  });
});
