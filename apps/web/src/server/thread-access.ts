import { db } from "~/server/db";
import {
  getGithubUserForToken,
  isUserOrganizationMemberWithInstallation,
} from "~/server/github-app";
import { getGithubAccount } from "~/server/github-account";
import { isPaidSubscriptionStatus } from "~/server/organization-billing";

interface ThreadAccessRow {
  publicId: string;
  ownerGithubUserId: string;
  organizationGithubOrgId: string | null;
  organizationLogin: string | null;
  githubAppInstallationId: string | null;
  subscriptionStatus: string | null;
}

export type ThreadAccessErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "SETUP_INCOMPLETE";

export class ThreadAccessError extends Error {
  constructor(
    public code: ThreadAccessErrorCode,
    message: string,
    public status = 403,
  ) {
    super(message);
    this.name = "ThreadAccessError";
  }
}

export async function assertCanReadThread(publicId: string): Promise<void> {
  const access = await canReadThread(publicId);
  if (!access.ok) {
    throw new ThreadAccessError(access.code, access.message, access.status);
  }
}

export async function canReadThread(publicId: string): Promise<
  | { ok: true }
  | {
      ok: false;
      code: ThreadAccessErrorCode;
      message: string;
      status: number;
    }
> {
  const thread = await getThreadAccessRow(publicId);

  if (!thread || !isPaidSubscriptionStatus(thread.subscriptionStatus)) {
    return { ok: true };
  }

  if (!thread.organizationLogin || !thread.githubAppInstallationId) {
    return {
      ok: false,
      code: "SETUP_INCOMPLETE",
      message: "Organization access control is not fully configured.",
      status: 403,
    };
  }

  const account = await getGithubAccount();
  if (!account) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      message: "Sign in with GitHub to view this organization thread.",
      status: 401,
    };
  }

  try {
    const viewer = await getGithubUserForToken(account.accessToken);
    const isMember = await isUserOrganizationMemberWithInstallation({
      installationId: thread.githubAppInstallationId,
      orgLogin: thread.organizationLogin,
      githubUsername: viewer.githubUsername,
    });

    if (isMember) {
      return { ok: true };
    }
  } catch (error) {
    console.warn("thread-access-github-membership-check-failed", {
      publicId,
      organizationGithubOrgId: thread.organizationGithubOrgId,
      error,
    });
  }

  return {
    ok: false,
    code: "FORBIDDEN",
    message: "This thread is only visible to GitHub organization members.",
    status: 403,
  };
}

async function getThreadAccessRow(
  publicId: string,
): Promise<ThreadAccessRow | null> {
  const result = await db.query<ThreadAccessRow>(
    `SELECT
      t."publicId" AS "publicId",
      t."ownerGithubUserId" AS "ownerGithubUserId",
      t."organizationGithubOrgId" AS "organizationGithubOrgId",
      o.login AS "organizationLogin",
      o."githubAppInstallationId" AS "githubAppInstallationId",
      b."subscriptionStatus" AS "subscriptionStatus"
    FROM "threads" t
    LEFT JOIN "organizations" o
      ON o."githubOrgId" = t."organizationGithubOrgId"
    LEFT JOIN "organization_billing" b
      ON b."githubOrgId" = t."organizationGithubOrgId"
    WHERE t."publicId" = $1
    LIMIT 1`,
    [publicId],
  );

  return result.rows[0] ?? null;
}
