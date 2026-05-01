import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  headersMock,
  getSessionMock,
  dbQueryMock,
  gistListThreadsMock,
  gistDeleteThreadMock,
  gistUpdateTitleMock,
  s3ListThreadsMock,
  s3DeleteThreadMock,
  s3UpdateTitleMock,
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
  gistUpdateTitleMock: vi.fn(),
  s3ListThreadsMock: vi.fn(),
  s3DeleteThreadMock: vi.fn(),
  s3UpdateTitleMock: vi.fn(),
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
    updateTitle = gistUpdateTitleMock;
  },
}));

vi.mock("~/lib/sources/s3", () => ({
  S3ThreadSourceProvider: class S3ThreadSourceProvider {
    listThreads = s3ListThreadsMock;
    deleteThread = s3DeleteThreadMock;
    updateTitle = s3UpdateTitleMock;
  },
}));

describe("server/actions/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
  });

  it("returns DB-backed thread groups for the signed-in user", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "user-1" },
    });
    dbQueryMock.mockResolvedValueOnce({
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
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        makeThreadRow({
          publicId: "gist-today",
          title: "Today thread",
          updatedAt: new Date(),
        }),
      ],
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        makeThreadRow({
          publicId: "gist-yesterday",
          title: "Yesterday thread",
          updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        }),
      ],
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        makeThreadRow({
          publicId: "gist-older",
          title: "Older thread",
          updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        }),
      ],
    });

    const { getUserThreadGroups } = await import("./threads");

    await expect(getUserThreadGroups()).resolves.toMatchObject({
      today: [{ id: "gist-today", title: "Today thread", source: "gist" }],
      yesterday: [
        { id: "gist-yesterday", title: "Yesterday thread", source: "gist" },
      ],
      older: {
        items: [{ id: "gist-older", title: "Older thread", source: "gist" }],
      },
    });
    expect(gistListThreadsMock).not.toHaveBeenCalled();
    expect(s3ListThreadsMock).not.toHaveBeenCalled();
  });

  it("applies org and repo filters to DB-backed thread groups", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "user-1" },
    });
    dbQueryMock.mockResolvedValueOnce({
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
    dbQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { getUserThreadGroups } = await import("./threads");

    await expect(
      getUserThreadGroups({
        orgId: "456",
        repoId: "789",
        cursor: "not-a-valid-cursor",
      }),
    ).resolves.toEqual({
      today: [],
      yesterday: [],
      older: { items: [] },
    });
    expect(dbQueryMock).toHaveBeenCalledTimes(4);
    expect(dbQueryMock.mock.calls[1]?.[0]).toContain(
      't."organizationGithubOrgId" = $2',
    );
    expect(dbQueryMock.mock.calls[1]?.[0]).toContain(
      't."repositoryGithubRepoId" = $3',
    );
    expect(dbQueryMock.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(["123", "456", "789"]),
    );
  });

  it("returns organization and repository filter options from indexed threads", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "user-1" },
    });
    dbQueryMock.mockResolvedValueOnce({
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
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "456",
          login: "athrd-com",
          avatarUrl: "https://example.com/avatar.png",
        },
      ],
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "789",
          fullName: "athrd-com/athrd",
          owner: "athrd-com",
          name: "athrd",
          organizationId: "456",
        },
      ],
    });

    const { getThreadFilterOptions } = await import("./threads");

    await expect(getThreadFilterOptions("456")).resolves.toEqual({
      organizations: [
        {
          id: "456",
          login: "athrd-com",
          avatarUrl: "https://example.com/avatar.png",
        },
      ],
      repositories: [
        {
          id: "789",
          fullName: "athrd-com/athrd",
          owner: "athrd-com",
          name: "athrd",
          organizationId: "456",
        },
      ],
    });
    expect(dbQueryMock.mock.calls[2]?.[0]).toContain(
      'AND t."organizationGithubOrgId" = $2',
    );
    expect(dbQueryMock.mock.calls[2]?.[1]).toEqual(["123", "456"]);
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
    expect(dbQueryMock).toHaveBeenCalledWith(
      'DELETE FROM "threads" WHERE "publicId" = $1 AND "ownerGithubUserId" = $2',
      ["gist-1", "123"],
    );
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

  it("updates gist-backed thread titles for the owner", async () => {
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

    const { updateOwnedThreadTitle } = await import("./threads");

    await expect(updateOwnedThreadTitle("gist-1", "Renamed gist")).resolves.toEqual(
      {
        ok: true,
        title: "Renamed gist",
      },
    );
    expect(gistUpdateTitleMock).toHaveBeenCalledWith(
      "github-token",
      "gist-1",
      "Renamed gist",
    );
    expect(dbQueryMock).toHaveBeenCalledWith(
      'UPDATE "threads" SET title = $1, "lastSeenAt" = NOW() WHERE "publicId" = $2 AND "ownerGithubUserId" = $3',
      ["Renamed gist", "gist-1", "123"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/threads");
    expect(revalidatePathMock).toHaveBeenCalledWith("/threads/gist-1");
  });

  it("updates S3-backed thread titles for the owner", async () => {
    getGithubAccountMock.mockResolvedValue({
      accountId: "123",
      accessToken: "github-token",
    });
    parseThreadLocatorMock.mockReturnValue({
      publicId: "S-456-123-thread-a",
      source: "s3",
      sourceId: "456/123/thread-a.json",
    });

    const { updateOwnedThreadTitle } = await import("./threads");

    await expect(
      updateOwnedThreadTitle("S-456-123-thread-a", "Renamed s3 thread"),
    ).resolves.toEqual({
      ok: true,
      title: "Renamed s3 thread",
    });
    expect(s3UpdateTitleMock).toHaveBeenCalledWith(
      "456/123/thread-a.json",
      "Renamed s3 thread",
    );
    expect(dbQueryMock).toHaveBeenCalledWith(
      'UPDATE "threads" SET title = $1, "lastSeenAt" = NOW() WHERE "publicId" = $2 AND "ownerGithubUserId" = $3',
      ["Renamed s3 thread", "S-456-123-thread-a", "123"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/threads");
    expect(revalidatePathMock).toHaveBeenCalledWith("/threads/S-456-123-thread-a");
  });
});

function makeThreadRow(overrides: Partial<Record<string, unknown>> = {}) {
  const updatedAt = overrides.updatedAt ?? new Date("2026-04-30T12:00:00.000Z");

  return {
    rowId: overrides.rowId ?? "row-1",
    publicId: overrides.publicId ?? "gist-1",
    storageProvider: overrides.storageProvider ?? "gist",
    storageSourceId: overrides.storageSourceId ?? "gist-1",
    title: overrides.title ?? "Thread",
    startedAt: overrides.startedAt ?? updatedAt,
    updatedAt,
    uploadedAt: overrides.uploadedAt ?? updatedAt,
    ide: overrides.ide ?? "codex",
    messageCount: overrides.messageCount ?? 3,
    organizationId: overrides.organizationId ?? "456",
    organizationLogin: overrides.organizationLogin ?? "athrd-com",
    organizationAvatarUrl: overrides.organizationAvatarUrl ?? null,
    repositoryId: overrides.repositoryId ?? "789",
    repositoryFullName: overrides.repositoryFullName ?? "athrd-com/athrd",
    repositoryOwner: overrides.repositoryOwner ?? "athrd-com",
    repositoryName: overrides.repositoryName ?? "athrd",
    commitSha: overrides.commitSha ?? null,
    artifactFormat: overrides.artifactFormat ?? "json",
  };
}
