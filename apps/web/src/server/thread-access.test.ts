import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbQueryMock,
  getGithubAccountMock,
  getGithubUserForTokenMock,
  isUserOrganizationMemberWithInstallationMock,
} = vi.hoisted(() => ({
  dbQueryMock: vi.fn(),
  getGithubAccountMock: vi.fn(),
  getGithubUserForTokenMock: vi.fn(),
  isUserOrganizationMemberWithInstallationMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: dbQueryMock,
  },
}));

vi.mock("~/server/github-account", () => ({
  getGithubAccount: getGithubAccountMock,
}));

vi.mock("~/server/github-app", () => ({
  getGithubUserForToken: getGithubUserForTokenMock,
  isUserOrganizationMemberWithInstallation:
    isUserOrganizationMemberWithInstallationMock,
}));

vi.mock("~/server/organization-billing", () => ({
  isPaidSubscriptionStatus: (status?: string | null) =>
    status === "active" || status === "trialing",
}));

describe("thread-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGithubAccountMock.mockResolvedValue({
      accountId: "123",
      accessToken: "gho_test",
    });
    getGithubUserForTokenMock.mockResolvedValue({
      githubUserId: "123",
      githubUsername: "octocat",
    });
    isUserOrganizationMemberWithInstallationMock.mockResolvedValue(true);
  });

  it("allows unindexed or unpaid threads", async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });

    const { canReadThread } = await import("./thread-access");

    await expect(canReadThread("gist-1")).resolves.toEqual({ ok: true });
    expect(getGithubAccountMock).not.toHaveBeenCalled();
  });

  it("allows active organization members", async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [threadRow()],
    });

    const { canReadThread } = await import("./thread-access");

    await expect(canReadThread("thread-1")).resolves.toEqual({ ok: true });
    expect(isUserOrganizationMemberWithInstallationMock).toHaveBeenCalledWith({
      installationId: "987",
      orgLogin: "athrd-com",
      githubUsername: "octocat",
    });
  });

  it("denies signed-out viewers for paid organization threads", async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [threadRow()],
    });
    getGithubAccountMock.mockResolvedValueOnce(null);

    const { canReadThread } = await import("./thread-access");

    await expect(canReadThread("thread-1")).resolves.toMatchObject({
      ok: false,
      code: "AUTH_REQUIRED",
      status: 401,
    });
  });

  it("denies paid organization threads before app setup is complete", async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          ...threadRow(),
          githubAppInstallationId: null,
        },
      ],
    });

    const { canReadThread } = await import("./thread-access");

    await expect(canReadThread("thread-1")).resolves.toMatchObject({
      ok: false,
      code: "SETUP_INCOMPLETE",
    });
  });

  it("denies non-members", async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [threadRow()],
    });
    isUserOrganizationMemberWithInstallationMock.mockResolvedValueOnce(false);

    const { canReadThread } = await import("./thread-access");

    await expect(canReadThread("thread-1")).resolves.toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      status: 403,
    });
  });
});

function threadRow() {
  return {
    publicId: "thread-1",
    ownerGithubUserId: "123",
    organizationGithubOrgId: "456",
    organizationLogin: "athrd-com",
    githubAppInstallationId: "987",
    subscriptionStatus: "active",
  };
}
