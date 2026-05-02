import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  parseStripeWebhookEventMock,
  retrieveStripeSubscriptionMock,
  mapStripeSubscriptionMock,
  upsertOrganizationBillingFromSubscriptionMock,
  claimStripeWebhookEventMock,
  markStripeWebhookEventProcessedMock,
  markStripeWebhookEventFailedMock,
} = vi.hoisted(() => ({
  parseStripeWebhookEventMock: vi.fn(),
  retrieveStripeSubscriptionMock: vi.fn(),
  mapStripeSubscriptionMock: vi.fn(),
  upsertOrganizationBillingFromSubscriptionMock: vi.fn(),
  claimStripeWebhookEventMock: vi.fn(),
  markStripeWebhookEventProcessedMock: vi.fn(),
  markStripeWebhookEventFailedMock: vi.fn(),
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

vi.mock("~/server/stripe-events", () => ({
  claimStripeWebhookEvent: claimStripeWebhookEventMock,
  markStripeWebhookEventProcessed: markStripeWebhookEventProcessedMock,
  markStripeWebhookEventFailed: markStripeWebhookEventFailedMock,
}));

import { POST } from "./route";

describe("/api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimStripeWebhookEventMock.mockResolvedValue({
      shouldProcess: true,
      alreadyProcessed: false,
    });
    markStripeWebhookEventProcessedMock.mockResolvedValue(undefined);
    markStripeWebhookEventFailedMock.mockResolvedValue(undefined);
  });

  it("rejects invalid signatures", async () => {
    parseStripeWebhookEventMock.mockReturnValueOnce(null);

    const response = await POST(stripeWebhookRequest({}));

    expect(response.status).toBe(401);
  });

  it("rejects events missing an id or type", async () => {
    parseStripeWebhookEventMock.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {},
      },
    });

    const response = await POST(stripeWebhookRequest({}));

    expect(response.status).toBe(400);
    expect(claimStripeWebhookEventMock).not.toHaveBeenCalled();
  });

  it("stores billing state from completed checkout sessions", async () => {
    const subscription = {
      id: "sub_123",
      customerId: "cus_123",
      status: "active",
      cancelAtPeriodEnd: false,
    };
    parseStripeWebhookEventMock.mockReturnValueOnce({
      id: "evt_checkout",
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
    expect(claimStripeWebhookEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_checkout" }),
    );
    expect(upsertOrganizationBillingFromSubscriptionMock).toHaveBeenCalledWith(
      subscription,
      "456",
    );
    expect(markStripeWebhookEventProcessedMock).toHaveBeenCalledWith(
      "evt_checkout",
    );
    expect(markStripeWebhookEventFailedMock).not.toHaveBeenCalled();
  });

  it("skips already-claimed Stripe events", async () => {
    claimStripeWebhookEventMock.mockResolvedValueOnce({
      shouldProcess: false,
      alreadyProcessed: true,
    });
    parseStripeWebhookEventMock.mockReturnValueOnce({
      id: "evt_duplicate",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
        },
      },
    });

    const response = await POST(stripeWebhookRequest({}));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      duplicate: true,
    });
    expect(upsertOrganizationBillingFromSubscriptionMock).not.toHaveBeenCalled();
    expect(markStripeWebhookEventProcessedMock).not.toHaveBeenCalled();
  });

  it("marks claimed events as failed when processing fails", async () => {
    const error = new Error("boom");
    parseStripeWebhookEventMock.mockReturnValueOnce({
      id: "evt_failed",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
        },
      },
    });
    mapStripeSubscriptionMock.mockImplementationOnce(() => {
      throw error;
    });

    const response = await POST(stripeWebhookRequest({}));

    expect(response.status).toBe(500);
    expect(markStripeWebhookEventFailedMock).toHaveBeenCalledWith(
      "evt_failed",
      error,
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
