import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQueryMock } = vi.hoisted(() => ({
  dbQueryMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: dbQueryMock,
  },
}));

describe("stripe-events", () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
  });

  it("claims new Stripe webhook events", async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ stripeEventId: "evt_123" }],
    });

    const { claimStripeWebhookEvent } = await import("./stripe-events");

    await expect(
      claimStripeWebhookEvent({
        id: "evt_123",
        type: "checkout.session.completed",
        api_version: "2026-04-30.preview",
        created: 1777608000,
        livemode: false,
        data: {
          object: {
            id: "cs_123",
          },
        },
      }),
    ).resolves.toEqual({
      shouldProcess: true,
      alreadyProcessed: false,
    });

    expect(dbQueryMock).toHaveBeenCalledWith(expect.stringContaining("INSERT"), [
      "evt_123",
      "checkout.session.completed",
      "2026-04-30.preview",
      false,
      expect.stringContaining('"evt_123"'),
      new Date(1777608000 * 1000),
    ]);
  });

  it("skips already processed events", async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ status: "processed", updatedAt: new Date() }],
      });

    const { claimStripeWebhookEvent } = await import("./stripe-events");

    await expect(
      claimStripeWebhookEvent({
        id: "evt_123",
        type: "customer.subscription.updated",
      }),
    ).resolves.toEqual({
      shouldProcess: false,
      alreadyProcessed: true,
    });
    expect(dbQueryMock).toHaveBeenCalledTimes(2);
  });

  it("reclaims previously failed events", async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ status: "failed", updatedAt: new Date() }],
      })
      .mockResolvedValueOnce({
        rows: [{ stripeEventId: "evt_123" }],
      });

    const { claimStripeWebhookEvent } = await import("./stripe-events");

    await expect(
      claimStripeWebhookEvent({
        id: "evt_123",
        type: "customer.subscription.deleted",
      }),
    ).resolves.toEqual({
      shouldProcess: true,
      alreadyProcessed: false,
    });
    expect(dbQueryMock.mock.calls[2]?.[0]).toContain("UPDATE");
  });

  it("marks events processed or failed", async () => {
    dbQueryMock.mockResolvedValue({ rows: [] });

    const {
      markStripeWebhookEventProcessed,
      markStripeWebhookEventFailed,
    } = await import("./stripe-events");

    await markStripeWebhookEventProcessed("evt_123");
    await markStripeWebhookEventFailed("evt_456", new Error("boom"));

    expect(dbQueryMock.mock.calls[0]?.[0]).toContain("status = 'processed'");
    expect(dbQueryMock.mock.calls[0]?.[1]).toEqual(["evt_123"]);
    expect(dbQueryMock.mock.calls[1]?.[0]).toContain("status = 'failed'");
    expect(dbQueryMock.mock.calls[1]?.[1]).toEqual([
      "evt_456",
      "Error: boom",
    ]);
  });
});
