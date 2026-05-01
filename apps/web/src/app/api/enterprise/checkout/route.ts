import { z, ZodError } from "zod";
import { db } from "~/server/db";
import {
  countOrganizationMembersWithToken,
  createGithubAppSetupState,
  getGithubAppInstallUrl,
} from "~/server/github-app";
import { getGithubAccount } from "~/server/github-account";
import { getOrCreateStripeCustomerForOrganization } from "~/server/organization-billing";
import { createStripeCheckoutSession, StripeApiError } from "~/server/stripe";
import { getAppBaseUrl } from "~/server/url";

const INCLUDED_SEAT_FALLBACK_QUANTITY = 5;

const checkoutRequestSchema = z.object({
  githubOrgId: z.string().trim().min(1),
});

interface OrganizationCheckoutRow {
  githubOrgId: string;
  login: string;
  name: string | null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const account = await getGithubAccount();
    if (!account) {
      return Response.json({ error: "Sign in with GitHub to start checkout." }, {
        status: 401,
      });
    }

    const body = checkoutRequestSchema.parse(await request.json());
    const organization = await getOrganizationForCheckout(body.githubOrgId);
    if (!organization) {
      return Response.json({ error: "GitHub organization not found." }, {
        status: 404,
      });
    }

    const quantity = await getInitialSeatQuantity({
      accessToken: account.accessToken,
      orgLogin: organization.login,
    });
    const customerId = await getOrCreateStripeCustomerForOrganization({
      githubOrgId: organization.githubOrgId,
      login: organization.login,
      name: organization.name,
    });
    const state = createGithubAppSetupState(organization.githubOrgId);
    const appInstallUrl = getGithubAppInstallUrl(state);
    const appBaseUrl = getAppBaseUrl();
    const checkout = await createStripeCheckoutSession({
      customerId,
      githubOrgId: organization.githubOrgId,
      orgLogin: organization.login,
      quantity,
      successUrl: appInstallUrl,
      cancelUrl: `${appBaseUrl}/enterprise?checkout=cancelled&orgId=${encodeURIComponent(
        organization.githubOrgId,
      )}`,
    });

    return Response.json({
      url: checkout.url,
      quantity,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Invalid checkout request." }, {
        status: 400,
      });
    }

    if (error instanceof StripeApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("enterprise-checkout-failed", error);
    return Response.json({ error: "Unable to start checkout." }, { status: 500 });
  }
}

async function getOrganizationForCheckout(
  githubOrgId: string,
): Promise<OrganizationCheckoutRow | null> {
  const result = await db.query<OrganizationCheckoutRow>(
    `SELECT
      "githubOrgId" AS "githubOrgId",
      login,
      name
    FROM "organizations"
    WHERE "githubOrgId" = $1
    LIMIT 1`,
    [githubOrgId],
  );

  return result.rows[0] ?? null;
}

async function getInitialSeatQuantity(input: {
  accessToken: string;
  orgLogin: string;
}): Promise<number> {
  try {
    return await countOrganizationMembersWithToken(input);
  } catch (error) {
    console.warn("enterprise-checkout-member-count-fallback", {
      orgLogin: input.orgLogin,
      error,
    });
    return INCLUDED_SEAT_FALLBACK_QUANTITY;
  }
}
