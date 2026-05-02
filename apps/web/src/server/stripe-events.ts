import { db } from "~/server/db";
import type { StripeWebhookEvent } from "~/server/stripe";

const PROCESSING_STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_ERROR_LENGTH = 2000;

type StripeEventStatus = "processing" | "processed" | "failed";

interface StripeEventRow {
  status: StripeEventStatus;
  updatedAt: Date | string | null;
}

export interface StripeEventClaim {
  shouldProcess: boolean;
  alreadyProcessed: boolean;
}

export async function claimStripeWebhookEvent(
  event: StripeWebhookEvent,
): Promise<StripeEventClaim> {
  if (!event.id || !event.type) {
    throw new Error("Stripe webhook event is missing an id or type.");
  }

  const inserted = await db.query<{ stripeEventId: string }>(
    `INSERT INTO "stripe_events" (
      "stripeEventId",
      type,
      "apiVersion",
      livemode,
      status,
      attempts,
      payload,
      "stripeCreatedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES ($1, $2, $3, $4, 'processing', 1, $5::jsonb, $6, NOW(), NOW())
    ON CONFLICT ("stripeEventId") DO NOTHING
    RETURNING "stripeEventId"`,
    [
      event.id,
      event.type,
      event.api_version || null,
      typeof event.livemode === "boolean" ? event.livemode : null,
      JSON.stringify(event),
      typeof event.created === "number" ? new Date(event.created * 1000) : null,
    ],
  );

  if (inserted.rows.length > 0) {
    return { shouldProcess: true, alreadyProcessed: false };
  }

  const existing = await db.query<StripeEventRow>(
    `SELECT status, "updatedAt" AS "updatedAt"
    FROM "stripe_events"
    WHERE "stripeEventId" = $1
    LIMIT 1`,
    [event.id],
  );
  const row = existing.rows[0];

  if (!row) {
    throw new Error("Stripe webhook event could not be claimed.");
  }

  if (row.status === "processed") {
    return { shouldProcess: false, alreadyProcessed: true };
  }

  if (row.status === "processing" && !isStaleProcessingEvent(row.updatedAt)) {
    return { shouldProcess: false, alreadyProcessed: false };
  }

  const reclaimed = await db.query<{ stripeEventId: string }>(
    `UPDATE "stripe_events"
    SET status = 'processing',
      attempts = attempts + 1,
      type = $2,
      "apiVersion" = $3,
      livemode = $4,
      payload = $5::jsonb,
      "stripeCreatedAt" = $6,
      "processingError" = NULL,
      "updatedAt" = NOW()
    WHERE "stripeEventId" = $1
      AND status <> 'processed'
    RETURNING "stripeEventId"`,
    [
      event.id,
      event.type,
      event.api_version || null,
      typeof event.livemode === "boolean" ? event.livemode : null,
      JSON.stringify(event),
      typeof event.created === "number" ? new Date(event.created * 1000) : null,
    ],
  );

  return {
    shouldProcess: reclaimed.rows.length > 0,
    alreadyProcessed: false,
  };
}

export async function markStripeWebhookEventProcessed(
  stripeEventId: string,
): Promise<void> {
  await db.query(
    `UPDATE "stripe_events"
    SET status = 'processed',
      "processedAt" = NOW(),
      "processingError" = NULL,
      "updatedAt" = NOW()
    WHERE "stripeEventId" = $1`,
    [stripeEventId],
  );
}

export async function markStripeWebhookEventFailed(
  stripeEventId: string,
  error: unknown,
): Promise<void> {
  await db.query(
    `UPDATE "stripe_events"
    SET status = 'failed',
      "processingError" = $2,
      "updatedAt" = NOW()
    WHERE "stripeEventId" = $1`,
    [stripeEventId, formatStripeEventProcessingError(error)],
  );
}

function isStaleProcessingEvent(updatedAt: Date | string | null): boolean {
  if (!updatedAt) {
    return true;
  }

  const updatedTime = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedTime)) {
    return true;
  }

  return Date.now() - updatedTime > PROCESSING_STALE_AFTER_MS;
}

function formatStripeEventProcessingError(error: unknown): string {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);

  return message.slice(0, MAX_ERROR_LENGTH);
}
