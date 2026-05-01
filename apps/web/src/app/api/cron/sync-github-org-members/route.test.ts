import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  envMock,
  getBillableOrganizationsForMemberSyncMock,
  updateOrganizationMemberCountMock,
  countOrganizationMembersWithInstallationMock,
  updateStripeSubscriptionItemQuantityMock,
} = vi.hoisted(() => ({
  envMock: {
    CRON_SECRET: "cron-secret",
  },
  getBillableOrganizationsForMemberSyncMock: vi.fn(),
  updateOrganizationMemberCountMock: vi.fn(),
  countOrganizationMembersWithInstallationMock: vi.fn(),
  updateStripeSubscriptionItemQuantityMock: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: envMock,
}));

vi.mock("~/server/organization-billing", () => ({
  getBillableOrganizationsForMemberSync: getBillableOrganizationsForMemberSyncMock,
  updateOrganizationMemberCount: updateOrganizationMemberCountMock,
}));

vi.mock("~/server/github-app", () => ({
  countOrganizationMembersWithInstallation:
    countOrganizationMembersWithInstallationMock,
}));

vi.mock("~/server/stripe", () => ({
  updateStripeSubscriptionItemQuantity: updateStripeSubscriptionItemQuantityMock,
}));

import { GET } from "./route";

describe("/api/cron/sync-github-org-members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
  });

  it("rejects requests without the cron secret", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/sync-github-org-members"),
    );

    expect(response.status).toBe(401);
  });

  it("skips Stripe updates when the member count has not changed", async () => {
    getBillableOrganizationsForMemberSyncMock.mockResolvedValueOnce([
      {
        githubOrgId: "456",
        login: "athrd-com",
        githubMemberCount: 5,
        githubAppInstallationId: "987",
        stripeSubscriptionItemId: "si_123",
      },
    ]);
    countOrganizationMembersWithInstallationMock.mockResolvedValueOnce(5);

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      synced: 1,
      updated: 0,
      errors: [],
    });
    expect(updateOrganizationMemberCountMock).not.toHaveBeenCalled();
    expect(updateStripeSubscriptionItemQuantityMock).not.toHaveBeenCalled();
  });

  it("updates member count and Stripe quantity when the count changes", async () => {
    getBillableOrganizationsForMemberSyncMock.mockResolvedValueOnce([
      {
        githubOrgId: "456",
        login: "athrd-com",
        githubMemberCount: 5,
        githubAppInstallationId: "987",
        stripeSubscriptionItemId: "si_123",
      },
    ]);
    countOrganizationMembersWithInstallationMock.mockResolvedValueOnce(7);

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      synced: 1,
      updated: 1,
      errors: [],
    });
    expect(updateOrganizationMemberCountMock).toHaveBeenCalledWith({
      githubOrgId: "456",
      memberCount: 7,
    });
    expect(updateStripeSubscriptionItemQuantityMock).toHaveBeenCalledWith({
      subscriptionItemId: "si_123",
      quantity: 7,
    });
  });
});

function cronRequest(): Request {
  return new Request("http://localhost/api/cron/sync-github-org-members", {
    headers: {
      authorization: "Bearer cron-secret",
    },
  });
}
