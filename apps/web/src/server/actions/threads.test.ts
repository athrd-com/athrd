import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  headersMock,
  getSessionMock,
  dbQueryMock,
  gistListThreadsMock,
  gistDeleteThreadMock,
  s3ListThreadsMock,
  s3DeleteThreadMock,
  fetchGistMock,
  getGithubAccountMock,
  parseThreadLocatorMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  getSessionMock: vi.fn(),
  dbQueryMock: vi.fn(),
  gistListThreadsMock: vi.fn(),
  gistDeleteThreadMock: vi.fn(),
  s3ListThreadsMock: vi.fn(),
  s3DeleteThreadMock: vi.fn(),
  fetchGistMock: vi.fn(),
  getGithubAccountMock: vi.fn(),
  parseThreadLocatorMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("~/server/better-auth/config", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: {
    query: dbQueryMock,
  },
}));

vi.mock("~/lib/github", () => ({
  fetchGist: fetchGistMock,
}));

vi.mock("~/server/github-account", () => ({
  getGithubAccount: getGithubAccountMock,
}));

vi.mock("~/lib/thread-source", () => ({
  parseThreadLocator: parseThreadLocatorMock,
}));

vi.mock("@/lib/sources/gist", () => ({
  GistThreadSourceProvider: class GistThreadSourceProvider {
    listThreads = gistListThreadsMock;
    deleteThread = gistDeleteThreadMock;
  },
}));

vi.mock("~/lib/sources/s3", () => ({
  S3ThreadSourceProvider: class S3ThreadSourceProvider {
    listThreads = s3ListThreadsMock;
    deleteThread = s3DeleteThreadMock;
  },
}));

describe("server/actions/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
  });

  it("returns gist-backed threads for the signed-in user", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "user-1" },
    });
    dbQueryMock.mockResolvedValue({
      rows: [
        {
          id: "account-1",
          userId: "user-1",
          providerId: "github",
          accountId: "123",
          accessToken: "github-token",
        },
      ],
    });
    gistListThreadsMock.mockResolvedValue({
      items: [{ id: "gist-1", source: "gist" }],
      nextCursor: "2",
    });

    const { getUserThreads } = await import("./threads");

    await expect(getUserThreads()).resolves.toEqual({
      items: [{ id: "gist-1", source: "gist" }],
      nextCursor: "2",
    });
    expect(gistListThreadsMock).toHaveBeenCalledWith("github-token", {
      cursor: undefined,
      limit: 20,
    });
  });

  it("returns S3-backed threads for the requested org", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "user-1" },
    });
    dbQueryMock.mockResolvedValue({
      rows: [
        {
          id: "account-1",
          userId: "user-1",
          providerId: "github",
          accountId: "123",
          accessToken: "github-token",
        },
      ],
    });
    s3ListThreadsMock.mockResolvedValue({
      items: [{ id: "S-456-123-thread-a", source: "s3" }],
    });

    const { getUserThreads } = await import("./threads");

    await expect(getUserThreads("456", "cursor-1")).resolves.toEqual({
      items: [{ id: "S-456-123-thread-a", source: "s3" }],
    });
    expect(s3ListThreadsMock).toHaveBeenCalledWith("456", "123", {
      cursor: "cursor-1",
      limit: 20,
    });
  });

  it("deletes gist-backed threads owned by the signed-in user", async () => {
    getGithubAccountMock.mockResolvedValue({
      accountId: "123",
      accessToken: "github-token",
    });
    parseThreadLocatorMock.mockReturnValue({
      publicId: "gist-1",
      source: "gist",
      sourceId: "gist-1",
    });
    fetchGistMock.mockResolvedValue({
      gist: {
        id: "gist-1",
        owner: { id: 123 },
      },
    });

    const { deleteOwnedThread } = await import("./threads");

    await expect(deleteOwnedThread("gist-1")).resolves.toEqual({
      ok: true,
      redirectTo: "/threads",
    });
    expect(gistDeleteThreadMock).toHaveBeenCalledWith("github-token", "gist-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/threads");
    expect(revalidatePathMock).toHaveBeenCalledWith("/threads/gist-1");
  });

  it("rejects S3 deletion when the signed-in user is not the owner", async () => {
    getGithubAccountMock.mockResolvedValue({
      accountId: "999",
      accessToken: "github-token",
    });
    parseThreadLocatorMock.mockReturnValue({
      publicId: "S-456-123-thread-a",
      source: "s3",
      sourceId: "456/123/thread-a.json",
    });

    const { deleteOwnedThread } = await import("./threads");

    await expect(deleteOwnedThread("S-456-123-thread-a")).resolves.toEqual({
      ok: false,
      error: "Only the thread owner can delete this S3 thread.",
    });
    expect(s3DeleteThreadMock).not.toHaveBeenCalled();
  });
});
