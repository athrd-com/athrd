import {
  upsertOrganizationBillingFromSubscription,
} from "~/server/organization-billing";
import {
  mapStripeSubscription,
  parseStripeWebhookEvent,
  retrieveStripeSubscription,
  StripeApiError,
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

  try {
    await handleStripeEvent(event);
    return Response.json({ ok: true });
  } catch (error) {
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

async function handleStripeEvent(event: {
  type?: string;
  data?: { object?: unknown };
}) {
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
