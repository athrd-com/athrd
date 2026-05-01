import { db } from "~/server/db";
import {
  createStripeCustomer,
  type StripeSubscriptionSummary,
} from "~/server/stripe";

const PAID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const BILLING_SYNC_STATUSES = new Set(["active", "trialing", "past_due"]);

interface OrganizationBillingStateRow {
  githubOrgId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  githubMemberCount: number | null;
  githubAppInstallationId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionItemId: string | null;
  stripePriceId: string | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodEnd: Date | string | null;
}

export interface OrganizationBillingState {
  githubOrgId: string;
  login: string;
  name?: string;
  avatarUrl?: string;
  githubMemberCount?: number;
  githubAppInstallationId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionItemId?: string;
  stripePriceId?: string;
  subscriptionStatus?: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Date | string;
  subscriptionActive: boolean;
  syncEligible: boolean;
  orgReadyForAcl: boolean;
  setupIncomplete: boolean;
}

export interface BillableOrganizationForSync {
  githubOrgId: string;
  login: string;
  githubMemberCount?: number;
  githubAppInstallationId: string;
  stripeSubscriptionItemId?: string;
}

export function isPaidSubscriptionStatus(status: string | null | undefined) {
  return PAID_SUBSCRIPTION_STATUSES.has(status || "");
}

export function isBillingSyncStatus(status: string | null | undefined) {
  return BILLING_SYNC_STATUSES.has(status || "");
}

export async function getOrganizationBillingState(
  githubOrgId: string | null | undefined,
): Promise<OrganizationBillingState | null> {
  const normalizedGithubOrgId = githubOrgId?.trim();
  if (!normalizedGithubOrgId) {
    return null;
  }

  const result = await db.query<OrganizationBillingStateRow>(
    `SELECT
      o."githubOrgId" AS "githubOrgId",
      o.login,
      o.name,
      o."avatarUrl" AS "avatarUrl",
      o."githubMemberCount" AS "githubMemberCount",
      o."githubAppInstallationId" AS "githubAppInstallationId",
      b."stripeCustomerId" AS "stripeCustomerId",
      b."stripeSubscriptionId" AS "stripeSubscriptionId",
      b."stripeSubscriptionItemId" AS "stripeSubscriptionItemId",
      b."stripePriceId" AS "stripePriceId",
      b."subscriptionStatus" AS "subscriptionStatus",
      b."cancelAtPeriodEnd" AS "cancelAtPeriodEnd",
      b."currentPeriodEnd" AS "currentPeriodEnd"
    FROM "organizations" o
    LEFT JOIN "organization_billing" b
      ON b."githubOrgId" = o."githubOrgId"
    WHERE o."githubOrgId" = $1
    LIMIT 1`,
    [normalizedGithubOrgId],
  );

  return mapOrganizationBillingState(result.rows[0]);
}

export async function getOrCreateStripeCustomerForOrganization(input: {
  githubOrgId: string;
  login: string;
  name?: string | null;
}): Promise<string> {
  const existing = await db.query<{ stripeCustomerId: string }>(
    `SELECT "stripeCustomerId"
    FROM "organization_billing"
    WHERE "githubOrgId" = $1
    LIMIT 1`,
    [input.githubOrgId],
  );
  const existingCustomerId = existing.rows[0]?.stripeCustomerId;
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customerId = await createStripeCustomer({
    githubOrgId: input.githubOrgId,
    orgLogin: input.login,
    orgName: input.name,
  });

  await db.query(
    `INSERT INTO "organization_billing" (
      "githubOrgId",
      "stripeCustomerId",
      "subscriptionStatus",
      "createdAt",
      "updatedAt"
    )
    VALUES ($1, $2, 'incomplete', NOW(), NOW())
    ON CONFLICT ("githubOrgId") DO UPDATE SET
      "stripeCustomerId" = "organization_billing"."stripeCustomerId",
      "updatedAt" = NOW()`,
    [input.githubOrgId, customerId],
  );

  const resolved = await db.query<{ stripeCustomerId: string }>(
    `SELECT "stripeCustomerId"
    FROM "organization_billing"
    WHERE "githubOrgId" = $1
    LIMIT 1`,
    [input.githubOrgId],
  );

  return resolved.rows[0]?.stripeCustomerId || customerId;
}

export async function upsertOrganizationBillingFromSubscription(
  subscription: StripeSubscriptionSummary,
  githubOrgId?: string,
): Promise<void> {
  const resolvedGithubOrgId =
    githubOrgId ||
    subscription.githubOrgId ||
    (await getGithubOrgIdForStripeSubscription(subscription.id));

  if (!resolvedGithubOrgId) {
    return;
  }

  await db.query(
    `INSERT INTO "organization_billing" (
      "githubOrgId",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "stripeSubscriptionItemId",
      "stripePriceId",
      "subscriptionStatus",
      "cancelAtPeriodEnd",
      "currentPeriodEnd",
      "createdAt",
      "updatedAt"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    ON CONFLICT ("githubOrgId") DO UPDATE SET
      "stripeCustomerId" = EXCLUDED."stripeCustomerId",
      "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId",
      "stripeSubscriptionItemId" = COALESCE(
        EXCLUDED."stripeSubscriptionItemId",
        "organization_billing"."stripeSubscriptionItemId"
      ),
      "stripePriceId" = COALESCE(
        EXCLUDED."stripePriceId",
        "organization_billing"."stripePriceId"
      ),
      "subscriptionStatus" = EXCLUDED."subscriptionStatus",
      "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
      "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
      "updatedAt" = NOW()`,
    [
      resolvedGithubOrgId,
      subscription.customerId,
      subscription.id,
      subscription.subscriptionItemId || null,
      subscription.priceId || null,
      subscription.status,
      subscription.cancelAtPeriodEnd,
      subscription.currentPeriodEnd || null,
    ],
  );
}

export async function updateOrganizationGithubAppInstallation(input: {
  githubOrgId: string;
  login: string;
  installationId: string;
  avatarUrl?: string;
}): Promise<void> {
  await db.query(
    `INSERT INTO "organizations" (
      "githubOrgId",
      login,
      "avatarUrl",
      "githubAppInstallationId",
      "createdAt",
      "updatedAt",
      "lastSeenAt"
    )
    VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
    ON CONFLICT ("githubOrgId") DO UPDATE SET
      login = EXCLUDED.login,
      "avatarUrl" = COALESCE(EXCLUDED."avatarUrl", "organizations"."avatarUrl"),
      "githubAppInstallationId" = EXCLUDED."githubAppInstallationId",
      "updatedAt" = NOW(),
      "lastSeenAt" = NOW()`,
    [input.githubOrgId, input.login, input.avatarUrl || null, input.installationId],
  );
}

export async function clearOrganizationGithubAppInstallation(input: {
  githubOrgId?: string;
  installationId?: string;
}): Promise<void> {
  if (!input.githubOrgId && !input.installationId) {
    return;
  }

  const clauses: string[] = [];
  const values: string[] = [];

  if (input.githubOrgId) {
    values.push(input.githubOrgId);
    clauses.push(`"githubOrgId" = $${values.length}`);
  }

  if (input.installationId) {
    values.push(input.installationId);
    clauses.push(`"githubAppInstallationId" = $${values.length}`);
  }

  await db.query(
    `UPDATE "organizations"
    SET "githubAppInstallationId" = NULL,
      "updatedAt" = NOW()
    WHERE ${clauses.join(" OR ")}`,
    values,
  );
}

export async function updateOrganizationMemberCount(input: {
  githubOrgId: string;
  memberCount: number;
}): Promise<void> {
  await db.query(
    `UPDATE "organizations"
    SET "githubMemberCount" = $1,
      "updatedAt" = NOW(),
      "lastSeenAt" = NOW()
    WHERE "githubOrgId" = $2`,
    [input.memberCount, input.githubOrgId],
  );
}

export async function getBillableOrganizationsForMemberSync(): Promise<
  BillableOrganizationForSync[]
> {
  const result = await db.query<{
    githubOrgId: string;
    login: string;
    githubMemberCount: number | null;
    githubAppInstallationId: string;
    stripeSubscriptionItemId: string | null;
  }>(
    `SELECT
      o."githubOrgId" AS "githubOrgId",
      o.login,
      o."githubMemberCount" AS "githubMemberCount",
      o."githubAppInstallationId" AS "githubAppInstallationId",
      b."stripeSubscriptionItemId" AS "stripeSubscriptionItemId"
    FROM "organizations" o
    INNER JOIN "organization_billing" b
      ON b."githubOrgId" = o."githubOrgId"
    WHERE b."subscriptionStatus" IN ('active', 'trialing', 'past_due')
      AND o."githubAppInstallationId" IS NOT NULL`,
  );

  return result.rows.map((row) => ({
    githubOrgId: row.githubOrgId,
    login: row.login,
    ...(typeof row.githubMemberCount === "number"
      ? { githubMemberCount: row.githubMemberCount }
      : {}),
    githubAppInstallationId: row.githubAppInstallationId,
    ...(row.stripeSubscriptionItemId
      ? { stripeSubscriptionItemId: row.stripeSubscriptionItemId }
      : {}),
  }));
}

async function getGithubOrgIdForStripeSubscription(
  subscriptionId: string,
): Promise<string | undefined> {
  const result = await db.query<{ githubOrgId: string }>(
    `SELECT "githubOrgId"
    FROM "organization_billing"
    WHERE "stripeSubscriptionId" = $1
    LIMIT 1`,
    [subscriptionId],
  );

  return result.rows[0]?.githubOrgId;
}

function mapOrganizationBillingState(
  row: OrganizationBillingStateRow | undefined,
): OrganizationBillingState | null {
  if (!row) {
    return null;
  }

  const subscriptionActive = isPaidSubscriptionStatus(row.subscriptionStatus);
  const githubAppInstallationId = row.githubAppInstallationId || undefined;

  return {
    githubOrgId: row.githubOrgId,
    login: row.login,
    ...(row.name ? { name: row.name } : {}),
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    ...(typeof row.githubMemberCount === "number"
      ? { githubMemberCount: row.githubMemberCount }
      : {}),
    ...(githubAppInstallationId ? { githubAppInstallationId } : {}),
    ...(row.stripeCustomerId ? { stripeCustomerId: row.stripeCustomerId } : {}),
    ...(row.stripeSubscriptionId
      ? { stripeSubscriptionId: row.stripeSubscriptionId }
      : {}),
    ...(row.stripeSubscriptionItemId
      ? { stripeSubscriptionItemId: row.stripeSubscriptionItemId }
      : {}),
    ...(row.stripePriceId ? { stripePriceId: row.stripePriceId } : {}),
    ...(row.subscriptionStatus
      ? { subscriptionStatus: row.subscriptionStatus }
      : {}),
    cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
    ...(row.currentPeriodEnd
      ? { currentPeriodEnd: row.currentPeriodEnd }
      : {}),
    subscriptionActive,
    syncEligible: isBillingSyncStatus(row.subscriptionStatus),
    orgReadyForAcl: subscriptionActive && Boolean(githubAppInstallationId),
    setupIncomplete: subscriptionActive && !githubAppInstallationId,
  };
}
