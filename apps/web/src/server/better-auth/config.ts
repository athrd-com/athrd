import { betterAuth } from "better-auth";

import { env } from "~/env";
import { GITHUB_OAUTH_SCOPES } from "~/lib/github-oauth";
import { pool } from "~/server/db";
import { importGithubOrganizationsForAuthAccount } from "~/server/github-organizations";

function normalizeBaseUrl(url: string) {
  const trimmedUrl = url.trim().replace(/\/+$/, "");

  if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
    return trimmedUrl;
  }

  return `https://${trimmedUrl}`;
}

function resolveBaseUrl() {
  if (env.BETTER_AUTH_URL) {
    return normalizeBaseUrl(env.BETTER_AUTH_URL);
  }

  if (env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return undefined;
}

export const auth = betterAuth({
  baseURL: resolveBaseUrl(),
  database: pool,
  databaseHooks: {
    account: {
      create: {
        after: async (account, context) => {
          await importGithubOrganizationsAfterAuth(account, context);
        },
      },
      update: {
        after: async (account, context) => {
          await importGithubOrganizationsAfterAuth(account, context);
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
      disableDefaultScope: true,
      scope: [...GITHUB_OAUTH_SCOPES],
    },
  },
});

export type Session = typeof auth.$Infer.Session;

async function importGithubOrganizationsAfterAuth(
  account: Parameters<typeof importGithubOrganizationsForAuthAccount>[0],
  context: Parameters<typeof importGithubOrganizationsForAuthAccount>[1],
): Promise<void> {
  try {
    await importGithubOrganizationsForAuthAccount(account, context);
  } catch (error) {
    console.warn("github-organization-import-failed", {
      accountId: account.accountId,
      userId: account.userId,
      error,
    });
  }
}
