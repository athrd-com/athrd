import { createHmac, createSign, timingSafeEqual } from "crypto";
import { env } from "~/env";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const INSTALLATION_TOKEN_REFRESH_WINDOW_MS = 60_000;
const SETUP_STATE_TTL_SECONDS = 60 * 60;
const DEVELOPMENT_SETUP_STATE_SECRET = "athrd-development-github-app-state";

interface CachedInstallationToken {
  token: string;
  expiresAt: number;
}

interface GithubInstallationTokenResponse {
  token?: string;
  expires_at?: string;
}

interface GithubUserResponse {
  id?: number | string;
  login?: string;
  avatar_url?: string;
}

interface GithubInstallationResponse {
  id?: number | string;
  account?: {
    id?: number | string;
    login?: string;
    type?: string;
    avatar_url?: string;
  };
}

interface GithubMembershipResponse {
  state?: string;
}

export interface GithubInstallationAccount {
  installationId: string;
  githubOrgId: string;
  login: string;
  avatarUrl?: string;
}

interface GithubAppSetupStatePayload {
  githubOrgId: string;
  exp: number;
}

const installationTokenCache = new Map<string, CachedInstallationToken>();

export class GithubAppError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
    this.name = "GithubAppError";
  }
}

export function getGithubAppInstallUrl(state: string): string {
  const slug = env.GITHUB_APP_SLUG?.trim();
  if (!slug) {
    throw new GithubAppError("GitHub App slug is not configured.");
  }

  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function createGithubAppSetupState(
  githubOrgId: string,
  now = new Date(),
): string {
  const normalizedGithubOrgId = githubOrgId.trim();
  if (!normalizedGithubOrgId) {
    throw new GithubAppError("GitHub organization id is required.");
  }

  const payload: GithubAppSetupStatePayload = {
    githubOrgId: normalizedGithubOrgId,
    exp: Math.floor(now.getTime() / 1000) + SETUP_STATE_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url",
  );
  const signature = signSetupState(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function parseGithubAppSetupState(
  state: string,
  now = new Date(),
): { githubOrgId: string } | null {
  const [encodedPayload, signature, ...rest] = state.trim().split(".");
  if (!encodedPayload || !signature || rest.length > 0) {
    return null;
  }

  if (!constantTimeEqual(signature, signSetupState(encodedPayload))) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf-8"),
    ) as unknown;
  } catch {
    return null;
  }

  if (!isGithubAppSetupStatePayload(payload)) {
    return null;
  }

  if (payload.exp <= Math.floor(now.getTime() / 1000)) {
    return null;
  }

  return { githubOrgId: payload.githubOrgId };
}

export function verifyGithubWebhookSignature(
  body: string,
  signatureHeader: string | null,
): boolean {
  const secret = env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`;

  return constantTimeEqual(signatureHeader, expectedSignature);
}

export async function getGithubInstallationAccount(
  installationId: string,
): Promise<GithubInstallationAccount> {
  const installation = await githubAppRequest<GithubInstallationResponse>(
    `/app/installations/${encodeURIComponent(installationId.trim())}`,
  );
  const account = installation.account;

  if (
    !installation.id ||
    !account?.id ||
    !account.login ||
    account.type !== "Organization"
  ) {
    throw new GithubAppError("GitHub App installation is not for an organization.");
  }

  return {
    installationId: String(installation.id),
    githubOrgId: String(account.id),
    login: account.login,
    ...(account.avatar_url ? { avatarUrl: account.avatar_url } : {}),
  };
}

export async function countOrganizationMembersWithInstallation(input: {
  installationId: string;
  orgLogin: string;
}): Promise<number> {
  const token = await getInstallationAccessToken(input.installationId);
  return countOrganizationMembers({
    token,
    orgLogin: input.orgLogin,
  });
}

export async function countOrganizationMembersWithToken(input: {
  accessToken: string;
  orgLogin: string;
}): Promise<number> {
  return countOrganizationMembers({
    token: input.accessToken,
    orgLogin: input.orgLogin,
  });
}

export async function isUserOrganizationMemberWithInstallation(input: {
  installationId: string;
  orgLogin: string;
  githubUsername: string;
}): Promise<boolean> {
  const token = await getInstallationAccessToken(input.installationId);
  const response = await fetch(
    `${GITHUB_API_URL}/orgs/${encodeURIComponent(
      input.orgLogin,
    )}/members/${encodeURIComponent(input.githubUsername)}`,
    {
      headers: githubHeaders(token),
      cache: "no-store",
    },
  );

  if (response.status === 204) {
    return true;
  }

  if (response.status === 404 || response.status === 302) {
    return false;
  }

  throw new GithubAppError(
    `Unable to verify GitHub organization membership (${response.status}).`,
    response.status,
  );
}

export async function getGithubUserForToken(accessToken: string): Promise<{
  githubUserId: string;
  githubUsername: string;
  avatarUrl?: string;
}> {
  const user = await githubTokenRequest<GithubUserResponse>("/user", accessToken);

  if (!user.id || !user.login) {
    throw new GithubAppError("GitHub user response is incomplete.", 401);
  }

  return {
    githubUserId: String(user.id),
    githubUsername: user.login,
    ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
  };
}

async function countOrganizationMembers(input: {
  token: string;
  orgLogin: string;
}): Promise<number> {
  const orgLogin = input.orgLogin.trim();
  if (!orgLogin) {
    throw new GithubAppError("GitHub organization login is required.");
  }

  let count = 0;
  let page = 1;

  while (true) {
    const members = await githubTokenRequest<unknown[]>(
      `/orgs/${encodeURIComponent(orgLogin)}/members?per_page=100&page=${page}`,
      input.token,
    );

    count += members.length;

    if (members.length < 100) {
      return count;
    }

    page += 1;
  }
}

async function getInstallationAccessToken(
  installationId: string,
): Promise<string> {
  const normalizedInstallationId = installationId.trim();
  if (!normalizedInstallationId) {
    throw new GithubAppError("GitHub App installation id is required.");
  }

  const cached = installationTokenCache.get(normalizedInstallationId);
  if (
    cached &&
    cached.expiresAt - Date.now() > INSTALLATION_TOKEN_REFRESH_WINDOW_MS
  ) {
    return cached.token;
  }

  const response = await githubAppRequest<GithubInstallationTokenResponse>(
    `/app/installations/${encodeURIComponent(
      normalizedInstallationId,
    )}/access_tokens`,
    {
      method: "POST",
    },
  );

  if (!response.token || !response.expires_at) {
    throw new GithubAppError("GitHub installation token response is incomplete.");
  }

  const expiresAt = Date.parse(response.expires_at);
  if (!Number.isFinite(expiresAt)) {
    throw new GithubAppError("GitHub installation token expiry is invalid.");
  }

  installationTokenCache.set(normalizedInstallationId, {
    token: response.token,
    expiresAt,
  });

  return response.token;
}

async function githubAppRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return githubRequest<T>(path, getGithubAppJwt(), init);
}

async function githubTokenRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  return githubRequest<T>(path, token, init);
}

async function githubRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    ...init,
    headers: {
      ...githubHeaders(token),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GithubAppError(
      `GitHub API request failed with HTTP ${response.status}.`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

function getGithubAppJwt(now = new Date()): string {
  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY);

  if (!appId || !privateKey) {
    throw new GithubAppError("GitHub App credentials are not configured.");
  }

  const issuedAtSeconds = Math.floor(now.getTime() / 1000) - 60;
  const expiresAtSeconds = issuedAtSeconds + 9 * 60;
  const encodedHeader = encodeJson({ alg: "RS256", typ: "JWT" });
  const encodedPayload = encodeJson({
    iat: issuedAtSeconds,
    exp: expiresAtSeconds,
    iss: appId,
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKey)
    .toString("base64url");

  return `${signingInput}.${signature}`;
}

function signSetupState(value: string): string {
  return createHmac("sha256", getSetupStateSecret())
    .update(value)
    .digest("base64url");
}

function getSetupStateSecret(): string {
  const secret =
    env.BETTER_AUTH_SECRET?.trim() || env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (env.NODE_ENV === "production") {
    throw new GithubAppError("GitHub App setup state secret is not configured.");
  }

  return DEVELOPMENT_SETUP_STATE_SECRET;
}

function normalizePrivateKey(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  return trimmedValue.replace(/\\n/g, "\n");
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
}

function isGithubAppSetupStatePayload(
  value: unknown,
): value is GithubAppSetupStatePayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<GithubAppSetupStatePayload>;
  return (
    typeof payload.githubOrgId === "string" &&
    payload.githubOrgId.trim().length > 0 &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp)
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf-8");
  const rightBuffer = Buffer.from(right, "utf-8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
