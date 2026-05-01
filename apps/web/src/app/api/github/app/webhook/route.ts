import {
  clearOrganizationGithubAppInstallation,
  updateOrganizationGithubAppInstallation,
} from "~/server/organization-billing";
import { verifyGithubWebhookSignature } from "~/server/github-app";

interface GithubInstallationWebhookPayload {
  action?: string;
  installation?: {
    id?: number | string;
    account?: {
      id?: number | string;
      login?: string;
      type?: string;
      avatar_url?: string;
    };
  };
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyGithubWebhookSignature(body, signature)) {
    return Response.json({ error: "Invalid GitHub webhook signature." }, {
      status: 401,
    });
  }

  const event = request.headers.get("x-github-event");
  if (event !== "installation") {
    return Response.json({ ok: true, ignored: true });
  }

  let payload: GithubInstallationWebhookPayload;
  try {
    payload = JSON.parse(body) as GithubInstallationWebhookPayload;
  } catch {
    return Response.json({ error: "Invalid GitHub webhook payload." }, {
      status: 400,
    });
  }

  const installationId = payload.installation?.id
    ? String(payload.installation.id)
    : undefined;
  const account = payload.installation?.account;
  const githubOrgId = account?.id ? String(account.id) : undefined;
  const accountLogin = account?.login;
  const isOrganization = account?.type === "Organization";

  if (!installationId || !githubOrgId || !accountLogin || !isOrganization) {
    return Response.json({ ok: true, ignored: true });
  }

  if (["created", "unsuspend", "new_permissions_accepted"].includes(payload.action || "")) {
    await updateOrganizationGithubAppInstallation({
      githubOrgId,
      login: accountLogin,
      installationId,
      ...(account?.avatar_url ? { avatarUrl: account.avatar_url } : {}),
    });

    return Response.json({ ok: true, action: payload.action });
  }

  if (["deleted", "suspend"].includes(payload.action || "")) {
    await clearOrganizationGithubAppInstallation({
      githubOrgId,
      installationId,
    });

    return Response.json({ ok: true, action: payload.action });
  }

  return Response.json({ ok: true, ignored: true });
}
