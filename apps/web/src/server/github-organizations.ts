import { decryptOAuthToken } from "better-auth/oauth2";
import type { Account, GenericEndpointContext } from "better-auth";
import { db } from "~/server/db";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";

interface GithubOrganizationResponse {
  id?: number | string;
  login?: string;
  avatar_url?: string | null;
}

interface GithubOrganizationMembershipResponse {
  organization?: GithubOrganizationResponse | null;
}

export interface GithubOrganization {
  githubOrgId: string;
  login: string;
  avatarUrl?: string;
}

export class GithubOrganizationImportError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
    this.name = "GithubOrganizationImportError";
  }
}

export async function importGithubOrganizationsForAuthAccount(
  account: Pick<Account, "providerId" | "accountId" | "userId" | "accessToken">,
  context: GenericEndpointContext | null,
): Promise<number> {
  if (account.providerId !== "github" || !account.accessToken) {
    return 0;
  }

  const accessToken = context
    ? await decryptOAuthToken(account.accessToken, context.context)
    : account.accessToken;
  if (!accessToken) {
    return 0;
  }

  const organizations = await fetchGithubOrganizations(accessToken);
  await upsertGithubOrganizations(organizations);
  return organizations.length;
}

export async function fetchGithubOrganizations(
  accessToken: string,
): Promise<GithubOrganization[]> {
  const organizations: GithubOrganization[] = [];
  let page = 1;

  while (true) {
    const pageOrganizations = await fetchGithubOrganizationMembershipsPage(
      accessToken,
      page,
    );
    organizations.push(...pageOrganizations);

    if (pageOrganizations.length < 100) {
      return organizations;
    }

    page += 1;
  }
}

export async function upsertGithubOrganization(
  githubOrgId: string | undefined,
  organization:
    | {
        login?: string;
        name?: string;
        avatarUrl?: string;
      }
    | undefined,
): Promise<void> {
  if (!githubOrgId) {
    return;
  }

  const login = organization?.login?.trim() || `github-org-${githubOrgId}`;
  const hasOrganizationDetails = Boolean(organization?.login?.trim());

  await db.query(
    `INSERT INTO "organizations" (
      "githubOrgId",
      login,
      name,
      "avatarUrl",
      "createdAt",
      "updatedAt",
      "lastSeenAt"
    )
    VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
    ON CONFLICT ("githubOrgId") DO UPDATE SET
      login = CASE WHEN $5 THEN EXCLUDED.login ELSE "organizations".login END,
      name = CASE
        WHEN $5 THEN COALESCE(EXCLUDED.name, "organizations".name)
        ELSE "organizations".name
      END,
      "avatarUrl" = CASE
        WHEN $5 THEN COALESCE(EXCLUDED."avatarUrl", "organizations"."avatarUrl")
        ELSE "organizations"."avatarUrl"
      END,
      "updatedAt" = NOW(),
      "lastSeenAt" = NOW()`,
    [
      githubOrgId,
      login,
      organization?.name || null,
      organization?.avatarUrl || null,
      hasOrganizationDetails,
    ],
  );
}

export async function upsertGithubOrganizations(
  organizations: GithubOrganization[],
): Promise<void> {
  if (organizations.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders = organizations.map((organization) => {
    values.push(
      organization.githubOrgId,
      organization.login,
      organization.avatarUrl || null,
    );
    const start = values.length - 2;
    return `($${start}, $${start + 1}, $${start + 2}, NOW(), NOW(), NOW())`;
  });

  await db.query(
    `INSERT INTO "organizations" (
      "githubOrgId",
      login,
      "avatarUrl",
      "createdAt",
      "updatedAt",
      "lastSeenAt"
    )
    VALUES ${placeholders.join(", ")}
    ON CONFLICT ("githubOrgId") DO UPDATE SET
      login = EXCLUDED.login,
      "avatarUrl" = COALESCE(EXCLUDED."avatarUrl", "organizations"."avatarUrl"),
      "updatedAt" = NOW(),
      "lastSeenAt" = NOW()`,
    values,
  );
}

async function fetchGithubOrganizationMembershipsPage(
  accessToken: string,
  page: number,
): Promise<GithubOrganization[]> {
  const response = await fetch(
    `${GITHUB_API_URL}/user/memberships/orgs?state=active&per_page=100&page=${page}`,
    {
      headers: githubHeaders(accessToken),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new GithubOrganizationImportError(
      `GitHub organization import failed with HTTP ${response.status}.`,
      response.status,
    );
  }

  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new GithubOrganizationImportError(
      "GitHub organization response is incomplete.",
    );
  }

  return body.map(parseGithubOrganizationMembershipResponse);
}

function parseGithubOrganizationMembershipResponse(
  value: unknown,
): GithubOrganization {
  if (typeof value !== "object" || value === null) {
    throw new GithubOrganizationImportError(
      "GitHub organization response is incomplete.",
    );
  }

  const membership = value as GithubOrganizationMembershipResponse;
  const organization = membership.organization;
  if (!organization?.id || !organization.login) {
    throw new GithubOrganizationImportError(
      "GitHub organization response is incomplete.",
    );
  }

  return {
    githubOrgId: String(organization.id),
    login: organization.login,
    ...(organization.avatar_url ? { avatarUrl: organization.avatar_url } : {}),
  };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}
