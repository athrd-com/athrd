import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbQueryMock,
  getGithubAccountMock,
  countOrganizationMembersWithTokenMock,
  createGithubAppSetupStateMock,
  getGithubAppInstallUrlMock,
  getOrCreateStripeCustomerForOrganizationMock,
  createStripeCheckoutSessionMock,
} = vi.hoisted(() => ({
  dbQueryMock: vi.fn(),
  getGithubAccountMock: vi.fn(),
  countOrganizationMembersWithTokenMock: vi.fn(),
  createGithubAppSetupStateMock: vi.fn(),
  getGithubAppInstallUrlMock: vi.fn(),
  getOrCreateStripeCustomerForOrganizationMock: vi.fn(),
  createStripeCheckoutSessionMock: vi.fn(),
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
  countOrganizationMembersWithToken: countOrganizationMembersWithTokenMock,
  createGithubAppSetupState: createGithubAppSetupStateMock,
  getGithubAppInstallUrl: getGithubAppInstallUrlMock,
}));

vi.mock("~/server/organization-billing", () => ({
  getOrCreateStripeCustomerForOrganization:
    getOrCreateStripeCustomerForOrganizationMock,
}));

vi.mock("~/server/stripe", () => ({
  createStripeCheckoutSession: createStripeCheckoutSessionMock,
  StripeApiError: class StripeApiError extends Error {
    status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
      this.name = "StripeApiError";
    }
  },
}));

vi.mock("~/server/url", () => ({
  getAppBaseUrl: () => "https://www.athrd.com",
}));

import { POST } from "./route";

describe("/api/enterprise/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGithubAccountMock.mockResolvedValue({
      accountId: "123",
      accessToken: "gho_test",
    });
    dbQueryMock.mockResolvedValue({
      rows: [
        {
          githubOrgId: "456",
          login: "athrd-com",
          name: "ATHRD",
        },
      ],
    });
    countOrganizationMembersWithTokenMock.mockResolvedValue(7);
    createGithubAppSetupStateMock.mockReturnValue("signed-state");
    getGithubAppInstallUrlMock.mockReturnValue(
      "https://github.com/apps/athrd/installations/new?state=signed-state",
    );
    getOrCreateStripeCustomerForOrganizationMock.mockResolvedValue("cus_123");
    createStripeCheckoutSessionMock.mockResolvedValue({
      id: "cs_123",
      url: "https://checkout.stripe.com/cs_123",
    });
  });

  it("creates checkout with the OAuth-derived member count", async () => {
    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://checkout.stripe.com/cs_123",
      quantity: 7,
    });
    expect(countOrganizationMembersWithTokenMock).toHaveBeenCalledWith({
      accessToken: "gho_test",
      orgLogin: "athrd-com",
    });
    expect(createStripeCheckoutSessionMock).toHaveBeenCalledWith({
      customerId: "cus_123",
      githubOrgId: "456",
      orgLogin: "athrd-com",
      quantity: 7,
      successUrl:
        "https://github.com/apps/athrd/installations/new?state=signed-state",
      cancelUrl: "https://www.athrd.com/enterprise?checkout=cancelled&orgId=456",
    });
  });

  it("falls back to five seats when OAuth member count fails", async () => {
    countOrganizationMembersWithTokenMock.mockRejectedValueOnce(
      new Error("missing read:org"),
    );

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      quantity: 5,
    });
    expect(createStripeCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 5,
      }),
    );
  });
});

function checkoutRequest(): Request {
  return new Request("http://localhost/api/enterprise/checkout", {
    method: "POST",
    body: JSON.stringify({ githubOrgId: "456" }),
  });
}
