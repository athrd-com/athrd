import { createHmac, timingSafeEqual } from "crypto";
import { env } from "~/env";

const STRIPE_API_URL = "https://api.stripe.com/v1";
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface StripeCheckoutSessionResult {
  id: string;
  url: string;
}

export interface StripeSubscriptionSummary {
  id: string;
  customerId: string;
  subscriptionItemId?: string;
  priceId?: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Date;
  githubOrgId?: string;
}

interface StripeCustomerResponse {
  id?: string;
}

interface StripeCheckoutSessionResponse {
  id?: string;
  url?: string;
}

interface StripeSubscriptionResponse {
  id?: string;
  customer?: string | { id?: string };
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string | undefined>;
  items?: {
    data?: Array<{
      id?: string;
      price?: {
        id?: string;
      };
    }>;
  };
}

export interface StripeWebhookEvent {
  id?: string;
  type?: string;
  data?: {
    object?: unknown;
  };
}

export class StripeApiError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

export async function createStripeCustomer(input: {
  githubOrgId: string;
  orgLogin: string;
  orgName?: string | null;
}): Promise<string> {
  const customer = await stripeRequest<StripeCustomerResponse>(
    "/customers",
    "POST",
    {
      name: input.orgName?.trim() || input.orgLogin,
      "metadata[githubOrgId]": input.githubOrgId,
      "metadata[githubOrgLogin]": input.orgLogin,
    },
  );

  if (!customer.id) {
    throw new StripeApiError("Stripe customer response is missing an id.");
  }

  return customer.id;
}

export async function createStripeCheckoutSession(input: {
  customerId: string;
  githubOrgId: string;
  orgLogin: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSessionResult> {
  const priceId = env.STRIPE_ORG_PRICE_ID?.trim();
  if (!priceId) {
    throw new StripeApiError("Stripe organization price is not configured.");
  }

  const session = await stripeRequest<StripeCheckoutSessionResponse>(
    "/checkout/sessions",
    "POST",
    {
      mode: "subscription",
      customer: input.customerId,
      client_reference_id: input.githubOrgId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": String(Math.max(1, input.quantity)),
      "metadata[githubOrgId]": input.githubOrgId,
      "metadata[githubOrgLogin]": input.orgLogin,
      "subscription_data[metadata][githubOrgId]": input.githubOrgId,
      "subscription_data[metadata][githubOrgLogin]": input.orgLogin,
    },
  );

  if (!session.id || !session.url) {
    throw new StripeApiError("Stripe checkout session response is incomplete.");
  }

  return {
    id: session.id,
    url: session.url,
  };
}

export async function retrieveStripeSubscription(
  subscriptionId: string,
): Promise<StripeSubscriptionSummary> {
  const subscription = await stripeRequest<StripeSubscriptionResponse>(
    `/subscriptions/${encodeURIComponent(
      subscriptionId,
    )}?expand[]=items.data.price`,
    "GET",
  );

  return mapStripeSubscription(subscription);
}

export async function updateStripeSubscriptionItemQuantity(input: {
  subscriptionItemId: string;
  quantity: number;
}): Promise<void> {
  await stripeRequest(
    `/subscription_items/${encodeURIComponent(input.subscriptionItemId)}`,
    "POST",
    {
      quantity: String(Math.max(1, input.quantity)),
      proration_behavior: "none",
    },
  );
}

export function parseStripeWebhookEvent(
  body: string,
  signatureHeader: string | null,
  now = new Date(),
): StripeWebhookEvent | null {
  if (!verifyStripeWebhookSignature(body, signatureHeader, now)) {
    return null;
  }

  try {
    return JSON.parse(body) as StripeWebhookEvent;
  } catch {
    return null;
  }
}

export function verifyStripeWebhookSignature(
  body: string,
  signatureHeader: string | null,
  now = new Date(),
): boolean {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) {
    return false;
  }

  const values = parseStripeSignatureHeader(signatureHeader);
  const timestamp = Number.parseInt(values.t || "", 10);
  const receivedSignature = values.v1;

  if (
    !Number.isFinite(timestamp) ||
    !receivedSignature ||
    Math.abs(Math.floor(now.getTime() / 1000) - timestamp) >
      STRIPE_WEBHOOK_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return constantTimeEqual(receivedSignature, expectedSignature);
}

export function mapStripeSubscription(
  subscription: StripeSubscriptionResponse,
): StripeSubscriptionSummary {
  const subscriptionItem = subscription.items?.data?.[0];
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!subscription.id || !customerId || !subscription.status) {
    throw new StripeApiError("Stripe subscription response is incomplete.");
  }

  const currentPeriodEnd =
    typeof subscription.current_period_end === "number"
      ? new Date(subscription.current_period_end * 1000)
      : undefined;

  return {
    id: subscription.id,
    customerId,
    ...(subscriptionItem?.id
      ? { subscriptionItemId: subscriptionItem.id }
      : {}),
    ...(subscriptionItem?.price?.id ? { priceId: subscriptionItem.price.id } : {}),
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
    ...(subscription.metadata?.githubOrgId
      ? { githubOrgId: subscription.metadata.githubOrgId }
      : {}),
  };
}

async function stripeRequest<T>(
  path: string,
  method: "GET" | "POST",
  params?: Record<string, string>,
): Promise<T> {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new StripeApiError("Stripe secret key is not configured.");
  }

  const response = await fetch(`${STRIPE_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(params
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new StripeApiError(
      `Stripe API request failed with HTTP ${response.status}.`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

function parseStripeSignatureHeader(value: string): Record<string, string> {
  return value.split(",").reduce<Record<string, string>>((accumulator, part) => {
    const [key, ...rest] = part.split("=");
    if (key && rest.length > 0) {
      accumulator[key] = rest.join("=");
    }
    return accumulator;
  }, {});
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf-8");
  const rightBuffer = Buffer.from(right, "utf-8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
