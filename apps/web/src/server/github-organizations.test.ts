import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQueryMock } = vi.hoisted(() => ({
  dbQueryMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: dbQueryMock,
  },
}));

describe("github-organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("fetches GitHub organizations across pages", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      login: `org-${index + 1}`,
      avatar_url: `https://avatars.example.com/${index + 1}.png`,
    }));
    const secondPage = [
      {
        id: 101,
        login: "final-org",
        avatar_url: null,
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => firstPage,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => secondPage,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchGithubOrganizations } = await import("./github-organizations");

    await expect(fetchGithubOrganizations("gho_test")).resolves.toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/user/orgs?per_page=100&page=1",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.github.com/user/orgs?per_page=100&page=2",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer gho_test",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      cache: "no-store",
    });
  });

  it("upserts GitHub organizations in bulk", async () => {
    dbQueryMock.mockResolvedValue({ rows: [] });

    const { upsertGithubOrganizations } = await import("./github-organizations");

    await upsertGithubOrganizations([
      {
        githubOrgId: "456",
        login: "athrd-com",
        avatarUrl: "https://avatars.example.com/456.png",
      },
      {
        githubOrgId: "789",
        login: "another-org",
      },
    ]);

    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    expect(dbQueryMock.mock.calls[0]?.[0]).toContain(
      'ON CONFLICT ("githubOrgId") DO UPDATE SET',
    );
    expect(dbQueryMock.mock.calls[0]?.[1]).toEqual([
      "456",
      "athrd-com",
      "https://avatars.example.com/456.png",
      "789",
      "another-org",
      null,
    ]);
  });

  it("does not query the database when there are no organizations", async () => {
    const { upsertGithubOrganizations } = await import("./github-organizations");

    await upsertGithubOrganizations([]);

    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it("imports organizations for GitHub auth accounts", async () => {
    dbQueryMock.mockResolvedValue({ rows: [] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 456,
          login: "athrd-com",
          avatar_url: "https://avatars.example.com/456.png",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const { importGithubOrganizationsForAuthAccount } = await import(
      "./github-organizations"
    );

    await expect(
      importGithubOrganizationsForAuthAccount(
        {
          providerId: "github",
          accountId: "123",
          userId: "user-1",
          accessToken: "gho_test",
        },
        null,
      ),
    ).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });

  it("ignores non-GitHub auth accounts", async () => {
    const { importGithubOrganizationsForAuthAccount } = await import(
      "./github-organizations"
    );

    await expect(
      importGithubOrganizationsForAuthAccount(
        {
          providerId: "credential",
          accountId: "123",
          userId: "user-1",
          accessToken: "password",
        },
        null,
      ),
    ).resolves.toBe(0);
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});
