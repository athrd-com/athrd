import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  },
}));

vi.mock("~/env", () => ({
  env: envMock,
}));

describe("stripe", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    envMock.STRIPE_SECRET_KEY = "sk_test";
    envMock.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("verifies Stripe webhook signatures", async () => {
    const { parseStripeWebhookEvent } = await import("./stripe");
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const timestamp = Math.floor(
      new Date("2026-05-01T12:00:00.000Z").getTime() / 1000,
    );
    const signature = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${body}`)
      .digest("hex");

    expect(
      parseStripeWebhookEvent(
        body,
        `t=${timestamp},v1=${signature}`,
        new Date("2026-05-01T12:00:00.000Z"),
      ),
    ).toMatchObject({
      id: "evt_1",
      type: "checkout.session.completed",
    });
    expect(
      parseStripeWebhookEvent(
        body,
        `t=${timestamp},v1=bad`,
        new Date("2026-05-01T12:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("updates subscription item quantity without prorations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "si_123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { updateStripeSubscriptionItemQuantity } = await import("./stripe");

    await updateStripeSubscriptionItemQuantity({
      subscriptionItemId: "si_123",
      quantity: 7,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/subscription_items/si_123",
      expect.objectContaining({
        method: "POST",
        body: "quantity=7&proration_behavior=none",
      }),
    );
  });
});
