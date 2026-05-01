import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  parseStripeWebhookEventMock,
  retrieveStripeSubscriptionMock,
  mapStripeSubscriptionMock,
  upsertOrganizationBillingFromSubscriptionMock,
} = vi.hoisted(() => ({
  parseStripeWebhookEventMock: vi.fn(),
  retrieveStripeSubscriptionMock: vi.fn(),
  mapStripeSubscriptionMock: vi.fn(),
  upsertOrganizationBillingFromSubscriptionMock: vi.fn(),
}));

vi.mock("~/server/stripe", () => ({
  parseStripeWebhookEvent: parseStripeWebhookEventMock,
  retrieveStripeSubscription: retrieveStripeSubscriptionMock,
  mapStripeSubscription: mapStripeSubscriptionMock,
  StripeApiError: class StripeApiError extends Error {
    status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
      this.name = "StripeApiError";
    }
  },
}));

vi.mock("~/server/organization-billing", () => ({
  upsertOrganizationBillingFromSubscription:
    upsertOrganizationBillingFromSubscriptionMock,
}));

import { POST } from "./route";

describe("/api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid signatures", async () => {
    parseStripeWebhookEventMock.mockReturnValueOnce(null);

    const response = await POST(stripeWebhookRequest({}));

    expect(response.status).toBe(401);
  });

  it("stores billing state from completed checkout sessions", async () => {
    const subscription = {
      id: "sub_123",
      customerId: "cus_123",
      status: "active",
      cancelAtPeriodEnd: false,
    };
    parseStripeWebhookEventMock.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            githubOrgId: "456",
          },
          subscription: "sub_123",
        },
      },
    });
    retrieveStripeSubscriptionMock.mockResolvedValueOnce(subscription);

    const response = await POST(stripeWebhookRequest({}));

    expect(response.status).toBe(200);
    expect(upsertOrganizationBillingFromSubscriptionMock).toHaveBeenCalledWith(
      subscription,
      "456",
    );
  });
});

function stripeWebhookRequest(body: unknown): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": "t=1,v1=test",
    },
    body: JSON.stringify(body),
  });
}
