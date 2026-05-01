import {
  countOrganizationMembersWithInstallation,
  getGithubInstallationAccount,
  parseGithubAppSetupState,
} from "~/server/github-app";
import {
  getOrganizationBillingState,
  updateOrganizationGithubAppInstallation,
  updateOrganizationMemberCount,
} from "~/server/organization-billing";
import { updateStripeSubscriptionItemQuantity } from "~/server/stripe";
import { getAppBaseUrl } from "~/server/url";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const installationId = url.searchParams.get("installation_id") || "";
  const parsedState = parseGithubAppSetupState(state);

  if (!parsedState || !installationId.trim()) {
    return redirectToEnterprise("github_app=invalid");
  }

  try {
    const installation = await getGithubInstallationAccount(installationId);
    if (installation.githubOrgId !== parsedState.githubOrgId) {
      return redirectToEnterprise("github_app=mismatch");
    }

    await updateOrganizationGithubAppInstallation({
      githubOrgId: installation.githubOrgId,
      login: installation.login,
      installationId: installation.installationId,
      ...(installation.avatarUrl ? { avatarUrl: installation.avatarUrl } : {}),
    });

    const memberCount = await countOrganizationMembersWithInstallation({
      installationId: installation.installationId,
      orgLogin: installation.login,
    });

    await updateOrganizationMemberCount({
      githubOrgId: installation.githubOrgId,
      memberCount,
    });

    const billing = await getOrganizationBillingState(installation.githubOrgId);
    if (billing?.stripeSubscriptionItemId) {
      await updateStripeSubscriptionItemQuantity({
        subscriptionItemId: billing.stripeSubscriptionItemId,
        quantity: memberCount,
      });
    }

    return redirectToEnterprise(
      `github_app=installed&orgId=${encodeURIComponent(installation.githubOrgId)}`,
    );
  } catch (error) {
    console.error("github-app-setup-failed", error);
    return redirectToEnterprise("github_app=failed");
  }
}

function redirectToEnterprise(query: string): Response {
  return Response.redirect(`${getAppBaseUrl()}/enterprise?${query}`, 302);
}
