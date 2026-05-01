import { env } from "~/env";
import { countOrganizationMembersWithInstallation } from "~/server/github-app";
import {
  getBillableOrganizationsForMemberSync,
  updateOrganizationMemberCount,
} from "~/server/organization-billing";
import { updateStripeSubscriptionItemQuantity } from "~/server/stripe";

interface SyncError {
  githubOrgId: string;
  message: string;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizations = await getBillableOrganizationsForMemberSync();
  let updated = 0;
  const errors: SyncError[] = [];

  for (const organization of organizations) {
    try {
      const memberCount = await countOrganizationMembersWithInstallation({
        installationId: organization.githubAppInstallationId,
        orgLogin: organization.login,
      });

      if (memberCount === organization.githubMemberCount) {
        continue;
      }

      await updateOrganizationMemberCount({
        githubOrgId: organization.githubOrgId,
        memberCount,
      });

      if (organization.stripeSubscriptionItemId) {
        await updateStripeSubscriptionItemQuantity({
          subscriptionItemId: organization.stripeSubscriptionItemId,
          quantity: memberCount,
        });
      }

      updated += 1;
    } catch (error) {
      errors.push({
        githubOrgId: organization.githubOrgId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({
    synced: organizations.length,
    updated,
    errors,
  });
}

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = env.CRON_SECRET?.trim();
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}
