import {
  upsertOrganizationBillingFromSubscription,
} from "~/server/organization-billing";
import {
  claimStripeWebhookEvent,
  markStripeWebhookEventFailed,
  markStripeWebhookEventProcessed,
} from "~/server/stripe-events";
import {
  mapStripeSubscription,
  parseStripeWebhookEvent,
  retrieveStripeSubscription,
  StripeApiError,
  type StripeWebhookEvent,
} from "~/server/stripe";

interface StripeCheckoutSessionObject {
  metadata?: Record<string, string | undefined>;
  subscription?: string | Record<string, unknown>;
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const event = parseStripeWebhookEvent(
    body,
    request.headers.get("stripe-signature"),
  );

  if (!event) {
    return Response.json({ error: "Invalid Stripe webhook signature." }, {
      status: 401,
    });
  }

  if (!event.id || !event.type) {
    return Response.json({ error: "Invalid Stripe webhook payload." }, {
      status: 400,
    });
  }

  try {
    const claim = await claimStripeWebhookEvent(event);
    if (!claim.shouldProcess) {
      return Response.json({
        ok: true,
        duplicate: claim.alreadyProcessed,
      });
    }

    await handleStripeEvent(event);
    await markStripeWebhookEventProcessed(event.id);
    return Response.json({ ok: true });
  } catch (error) {
    await markStripeWebhookEventFailedSafely(event.id, error);

    if (error instanceof StripeApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("stripe-webhook-failed", {
      eventId: event.id,
      eventType: event.type,
      error,
    });
    return Response.json({ error: "Unable to process Stripe webhook." }, {
      status: 500,
    });
  }
}

async function handleStripeEvent(event: StripeWebhookEvent) {
  if (event.type === "checkout.session.completed") {
    const session = event.data?.object as StripeCheckoutSessionObject | undefined;
    const githubOrgId = session?.metadata?.githubOrgId;
    const subscription = session?.subscription;

    if (typeof subscription === "string") {
      await upsertOrganizationBillingFromSubscription(
        await retrieveStripeSubscription(subscription),
        githubOrgId,
      );
      return;
    }

    if (subscription && typeof subscription === "object") {
      await upsertOrganizationBillingFromSubscription(
        mapStripeSubscription(subscription),
        githubOrgId,
      );
    }

    return;
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data?.object;
    if (subscription && typeof subscription === "object") {
      await upsertOrganizationBillingFromSubscription(
        mapStripeSubscription(subscription),
      );
    }
  }
}

async function markStripeWebhookEventFailedSafely(
  stripeEventId: string,
  error: unknown,
): Promise<void> {
  try {
    await markStripeWebhookEventFailed(stripeEventId, error);
  } catch (markError) {
    console.error("stripe-webhook-mark-failed-failed", {
      eventId: stripeEventId,
      error: markError,
    });
  }
}
