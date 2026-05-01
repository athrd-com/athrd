import { z } from "zod";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { createS3PublicId } from "~/lib/sources/locator";
import { db } from "~/server/db";
import {
  getOrganizationStorageConfig,
  type S3StorageConfig,
} from "~/server/organization-storage";
import { getOrganizationBillingState } from "~/server/organization-billing";

const S3_SIGNED_UPLOAD_TTL_SECONDS = 300;
const S3_SIGNATURE_ALGORITHM = "AWS4-HMAC-SHA256";
const GITHUB_TOKEN_AUTH_CACHE_TTL_MS = 60_000;
const GITHUB_TOKEN_AUTH_CACHE_MAX_ENTRIES = 500;
const CLI_ACCESS_TOKEN_PREFIX = "athrd_cli_v1";
const CLI_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const CLI_ACCESS_TOKEN_AUDIENCE = "athrd-cli-ingest";
const CLI_ACCESS_TOKEN_ISSUER = "athrd";
const DEVELOPMENT_CLI_TOKEN_SECRET = "athrd-development-cli-token-secret";

interface CachedGithubActor {
  actor: AuthenticatedGithubActor;
  expiresAt: number;
}

interface CliAccessTokenPayload {
  v: 1;
  aud: typeof CLI_ACCESS_TOKEN_AUDIENCE;
  iss: typeof CLI_ACCESS_TOKEN_ISSUER;
  sub: string;
  login: string;
  avatarUrl?: string;
  iat: number;
  exp: number;
}

const githubTokenAuthCache = new Map<string, CachedGithubActor>();

export class IngestHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "IngestHttpError";
  }
}

const nonEmptyString = z.string().trim().min(1);

export const athrdMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    thread: z.object({
      id: nonEmptyString,
      providerSessionId: nonEmptyString,
      source: nonEmptyString,
      title: z.string().optional(),
      messageCount: z.number().int().nonnegative().optional(),
      startedAt: z.string().optional(),
      updatedAt: nonEmptyString,
    }),
    actor: z.object({
      githubUserId: nonEmptyString,
      githubUsername: nonEmptyString,
      avatarUrl: z.string().optional(),
    }),
    organization: z
      .object({
        githubOrgId: nonEmptyString,
      })
      .optional(),
    repository: z
      .object({
        githubRepoId: nonEmptyString.optional(),
        owner: nonEmptyString.optional(),
        name: nonEmptyString.optional(),
        fullName: nonEmptyString.optional(),
      })
      .optional(),
    commit: z
      .object({
        sha: z.string().optional(),
        branch: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const githubContextSchema = z
  .object({
    organization: z
      .object({
        githubOrgId: nonEmptyString.optional(),
        login: nonEmptyString,
        name: z.string().optional(),
        avatarUrl: z.string().optional(),
      })
      .optional(),
    repository: z
      .object({
        githubRepoId: nonEmptyString.optional(),
        owner: nonEmptyString,
        name: nonEmptyString,
        fullName: nonEmptyString,
        htmlUrl: z.string().optional(),
        defaultBranch: z.string().optional(),
        private: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

const artifactDescriptorSchema = z.object({
  fileName: nonEmptyString,
  format: z.enum(["json", "jsonl"]),
});

export const ingestPlanRequestSchema = z.object({
  metadata: athrdMetadataSchema,
  github: githubContextSchema,
});

export const completeIngestRequestSchema = z.object({
  metadata: athrdMetadataSchema,
  github: githubContextSchema,
  artifact: artifactDescriptorSchema,
  storage: z.object({
    provider: z.enum(["gist", "s3"]),
    publicId: nonEmptyString,
    sourceId: nonEmptyString,
  }),
});

export const signedUploadRequestSchema = z.object({
  metadata: athrdMetadataSchema,
  github: githubContextSchema,
  artifact: artifactDescriptorSchema,
});

export type AthrdMetadata = z.infer<typeof athrdMetadataSchema>;
export type GithubIngestContext = z.infer<typeof githubContextSchema>;
export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>;

export interface AuthenticatedGithubActor {
  githubUserId: string;
  githubUsername: string;
  avatarUrl?: string;
}

interface OrganizationLookupRow {
  githubOrgId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

interface ResolvedOrganizationContext {
  githubOrgId?: string;
  organization?: NonNullable<GithubIngestContext>["organization"];
}

interface RepositoryPersistenceContext {
  key: string;
  githubRepoId?: string;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl?: string;
  defaultBranch?: string;
  private?: boolean;
}

export interface IngestPlan {
  storageProvider: "gist" | "s3";
  uploadMode: "client" | "signed-url";
}

export interface IngestResult {
  publicId: string;
  sourceId: string;
  storageProvider: "gist" | "s3";
  url: string;
}

export interface SignedUploadResult {
  uploadUrl: string;
  expiresAt: string;
  ttlSeconds: number;
  storage: {
    provider: "s3";
    publicId: string;
    sourceId: string;
  };
}

export interface CliTokenExchangeResult {
  token: string;
  expiresAt: string;
  actor: AuthenticatedGithubActor;
}

export function createCliAccessToken(
  actor: AuthenticatedGithubActor,
  now = new Date(),
): CliTokenExchangeResult {
  const issuedAtSeconds = Math.floor(now.getTime() / 1000);
  const expiresAtSeconds = issuedAtSeconds + CLI_ACCESS_TOKEN_TTL_SECONDS;
  const payload: CliAccessTokenPayload = {
    v: 1,
    aud: CLI_ACCESS_TOKEN_AUDIENCE,
    iss: CLI_ACCESS_TOKEN_ISSUER,
    sub: actor.githubUserId,
    login: actor.githubUsername,
    ...(actor.avatarUrl ? { avatarUrl: actor.avatarUrl } : {}),
    iat: issuedAtSeconds,
    exp: expiresAtSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url",
  );
  const signedValue = `${CLI_ACCESS_TOKEN_PREFIX}.${encodedPayload}`;
  const signature = signCliAccessToken(signedValue);

  return {
    token: `${signedValue}.${signature}`,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    actor: { ...actor },
  };
}

export async function authenticateIngestRequest(
  request: Request,
): Promise<AuthenticatedGithubActor> {
  const token = getBearerToken(request, "Missing ingest bearer token.");
  const actor = verifyCliAccessToken(token);

  if (actor) {
    return actor;
  }

  return authenticateGithubRequest(request);
}

export async function authenticateGithubRequest(
  request: Request,
): Promise<AuthenticatedGithubActor> {
  const token = getBearerToken(request, "Missing GitHub bearer token.");

  const tokenHash = sha256Hex(token);
  const cachedActor = getCachedGithubActor(tokenHash);

  if (cachedActor) {
    return cachedActor;
  }

  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new IngestHttpError(401, "Invalid GitHub bearer token.");
  }

  const user = (await response.json()) as {
    id?: number | string;
    login?: string;
    avatar_url?: string;
  };

  if (!user.id || !user.login) {
    throw new IngestHttpError(401, "GitHub user response is incomplete.");
  }

  const actor = {
    githubUserId: String(user.id),
    githubUsername: user.login,
    avatarUrl: user.avatar_url,
  };

  setCachedGithubActor(tokenHash, actor);
  return { ...actor };
}

function getBearerToken(request: Request, missingMessage: string): string {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new IngestHttpError(401, missingMessage);
  }

  return token;
}

function verifyCliAccessToken(token: string): AuthenticatedGithubActor | null {
  if (!token.startsWith(`${CLI_ACCESS_TOKEN_PREFIX}.`)) {
    return null;
  }

  const [prefix, encodedPayload, signature, ...rest] = token.split(".");

  if (
    prefix !== CLI_ACCESS_TOKEN_PREFIX ||
    !encodedPayload ||
    !signature ||
    rest.length > 0
  ) {
    throw new IngestHttpError(401, "Invalid athrd CLI token.");
  }

  const signedValue = `${prefix}.${encodedPayload}`;
  const expectedSignature = signCliAccessToken(signedValue);

  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new IngestHttpError(401, "Invalid athrd CLI token.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf-8"),
    ) as unknown;
  } catch {
    throw new IngestHttpError(401, "Invalid athrd CLI token.");
  }

  if (!isCliAccessTokenPayload(payload)) {
    throw new IngestHttpError(401, "Invalid athrd CLI token.");
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new IngestHttpError(401, "Expired athrd CLI token.");
  }

  return {
    githubUserId: payload.sub,
    githubUsername: payload.login,
    ...(payload.avatarUrl ? { avatarUrl: payload.avatarUrl } : {}),
  };
}

function isCliAccessTokenPayload(
  value: unknown,
): value is CliAccessTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<CliAccessTokenPayload>;
  return (
    payload.v === 1 &&
    payload.aud === CLI_ACCESS_TOKEN_AUDIENCE &&
    payload.iss === CLI_ACCESS_TOKEN_ISSUER &&
    typeof payload.sub === "string" &&
    payload.sub.trim().length > 0 &&
    typeof payload.login === "string" &&
    payload.login.trim().length > 0 &&
    (payload.avatarUrl === undefined ||
      typeof payload.avatarUrl === "string") &&
    typeof payload.iat === "number" &&
    Number.isFinite(payload.iat) &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp) &&
    payload.exp > payload.iat
  );
}

function signCliAccessToken(value: string): string {
  return createHmac("sha256", getCliTokenSecret())
    .update(value)
    .digest("base64url");
}

function getCliTokenSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new IngestHttpError(
      500,
      "CLI token signing secret is not configured.",
    );
  }

  return DEVELOPMENT_CLI_TOKEN_SECRET;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf-8");
  const rightBuffer = Buffer.from(right, "utf-8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getCachedGithubActor(
  tokenHash: string,
): AuthenticatedGithubActor | null {
  const cached = githubTokenAuthCache.get(tokenHash);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    githubTokenAuthCache.delete(tokenHash);
    return null;
  }

  return { ...cached.actor };
}

function setCachedGithubActor(
  tokenHash: string,
  actor: AuthenticatedGithubActor,
): void {
  if (githubTokenAuthCache.size >= GITHUB_TOKEN_AUTH_CACHE_MAX_ENTRIES) {
    pruneGithubTokenAuthCache();
  }

  githubTokenAuthCache.set(tokenHash, {
    actor: { ...actor },
    expiresAt: Date.now() + GITHUB_TOKEN_AUTH_CACHE_TTL_MS,
  });
}

function pruneGithubTokenAuthCache(): void {
  const now = Date.now();

  for (const [tokenHash, cached] of githubTokenAuthCache) {
    if (cached.expiresAt <= now) {
      githubTokenAuthCache.delete(tokenHash);
    }
  }

  while (githubTokenAuthCache.size >= GITHUB_TOKEN_AUTH_CACHE_MAX_ENTRIES) {
    const oldestTokenHash = githubTokenAuthCache.keys().next().value;
    if (!oldestTokenHash) {
      return;
    }

    githubTokenAuthCache.delete(oldestTokenHash);
  }
}

export async function createIngestPlan(
  metadata: AthrdMetadata,
  actor: AuthenticatedGithubActor,
  github?: GithubIngestContext,
): Promise<IngestPlan> {
  assertMetadataActor(metadata, actor);

  const organization = await resolveOrganizationContext({
    metadata,
    github,
    actor,
  });
  const billing = await getOrganizationBillingState(organization.githubOrgId);
  assertOrganizationBillingReadyForIngest(billing);
  const storage = await getOrganizationStorageConfig(organization.githubOrgId);
  const storageProvider = billing?.orgReadyForAcl ? "s3" : storage.provider;

  return {
    storageProvider,
    uploadMode: storageProvider === "s3" ? "signed-url" : "client",
  };
}

export async function completeThreadIngest(input: {
  metadata: AthrdMetadata;
  github?: GithubIngestContext;
  artifact: ArtifactDescriptor;
  storage: {
    provider: "gist" | "s3";
    publicId: string;
    sourceId: string;
  };
  actor: AuthenticatedGithubActor;
}): Promise<IngestResult> {
  assertMetadataActor(input.metadata, input.actor);
  validateMetadataTimestamps(input.metadata);

  const organization = await resolveOrganizationContext({
    metadata: input.metadata,
    github: input.github,
    actor: input.actor,
  });
  const repository = resolveRepositoryForPersistence(
    input.metadata,
    input.github,
  );
  const billing = await getOrganizationBillingState(organization.githubOrgId);
  assertOrganizationBillingReadyForIngest(billing);

  if (billing?.orgReadyForAcl && input.storage.provider !== "s3") {
    throw new IngestHttpError(
      409,
      "Paid organization threads must use managed S3 storage.",
    );
  }

  await upsertOrganization(organization.githubOrgId, organization.organization);
  await upsertRepository(repository, organization.githubOrgId);
  await upsertThread({
    ...input,
    organizationGithubOrgId: organization.githubOrgId,
    repositoryKey: repository?.key,
  });

  return {
    publicId: input.storage.publicId,
    sourceId: input.storage.sourceId,
    storageProvider: input.storage.provider,
    url: buildThreadUrl(input.storage.publicId),
  };
}

export async function createSignedThreadUpload(input: {
  metadata: AthrdMetadata;
  github?: GithubIngestContext;
  artifact: ArtifactDescriptor;
  actor: AuthenticatedGithubActor;
}): Promise<SignedUploadResult> {
  assertMetadataActor(input.metadata, input.actor);
  validateMetadataTimestamps(input.metadata);

  const organization = await resolveOrganizationContext({
    metadata: input.metadata,
    github: input.github,
    actor: input.actor,
  });
  const githubOrgId = organization.githubOrgId;
  const billing = await getOrganizationBillingState(githubOrgId);
  assertOrganizationBillingReadyForIngest(billing);
  const storage = await getOrganizationStorageConfig(githubOrgId);
  const storageProvider = billing?.orgReadyForAcl ? "s3" : storage.provider;

  if (storageProvider !== "s3") {
    throw new IngestHttpError(
      409,
      "Organization is configured for client-side Gist uploads.",
    );
  }

  if (!githubOrgId) {
    throw new IngestHttpError(400, "S3 uploads require an organization.");
  }

  assertS3StorageConfig(storage.s3);
  const sourceId = buildManagedS3ObjectKey({
    metadata: input.metadata,
    artifact: input.artifact,
    githubOrgId,
  });
  const signedUrl = createS3PresignedPutUrl({
    config: storage.s3,
    objectKey: sourceId,
    ttlSeconds: S3_SIGNED_UPLOAD_TTL_SECONDS,
  });

  return {
    uploadUrl: signedUrl.url,
    expiresAt: signedUrl.expiresAt.toISOString(),
    ttlSeconds: S3_SIGNED_UPLOAD_TTL_SECONDS,
    storage: {
      provider: "s3",
      publicId: createS3PublicId(sourceId),
      sourceId,
    },
  };
}

function assertMetadataActor(
  metadata: AthrdMetadata,
  actor: AuthenticatedGithubActor,
): void {
  if (metadata.actor.githubUserId !== actor.githubUserId) {
    throw new IngestHttpError(
      403,
      "Metadata actor does not match authenticated GitHub user.",
    );
  }
}

function validateMetadataTimestamps(metadata: AthrdMetadata): void {
  if (Number.isNaN(Date.parse(metadata.thread.updatedAt))) {
    throw new IngestHttpError(400, "thread.updatedAt must be a valid date.");
  }

  if (
    metadata.thread.startedAt &&
    Number.isNaN(Date.parse(metadata.thread.startedAt))
  ) {
    throw new IngestHttpError(400, "thread.startedAt must be a valid date.");
  }
}

function assertOrganizationBillingReadyForIngest(
  billing: Awaited<ReturnType<typeof getOrganizationBillingState>>,
): void {
  if (billing?.setupIncomplete) {
    throw new IngestHttpError(
      409,
      "Organization billing is active but GitHub App installation is incomplete.",
    );
  }
}

async function upsertOrganization(
  githubOrgId: string | undefined,
  organization: NonNullable<GithubIngestContext>["organization"] | undefined,
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

async function upsertRepository(
  repository: RepositoryPersistenceContext | null,
  githubOrgId: string | undefined,
): Promise<void> {
  if (!repository) {
    return;
  }

  await db.query(
    `INSERT INTO "repositories" (
      "githubRepoId",
      "githubOrgId",
      owner,
      name,
      "fullName",
      "htmlUrl",
      "defaultBranch",
      private,
      "createdAt",
      "updatedAt",
      "lastSeenAt"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
    ON CONFLICT ("githubRepoId") DO UPDATE SET
      "githubOrgId" = COALESCE(EXCLUDED."githubOrgId", "repositories"."githubOrgId"),
      owner = EXCLUDED.owner,
      name = EXCLUDED.name,
      "fullName" = EXCLUDED."fullName",
      "htmlUrl" = COALESCE(EXCLUDED."htmlUrl", "repositories"."htmlUrl"),
      "defaultBranch" = COALESCE(EXCLUDED."defaultBranch", "repositories"."defaultBranch"),
      private = COALESCE(EXCLUDED.private, "repositories".private),
      "updatedAt" = NOW(),
      "lastSeenAt" = NOW()`,
    [
      repository.key,
      githubOrgId || null,
      repository.owner,
      repository.name,
      repository.fullName,
      repository?.htmlUrl || null,
      repository?.defaultBranch || null,
      repository?.private ?? null,
    ],
  );
}

async function upsertThread(input: {
  metadata: AthrdMetadata;
  artifact: ArtifactDescriptor;
  storage: {
    provider: "gist" | "s3";
    publicId: string;
    sourceId: string;
  };
  actor: AuthenticatedGithubActor;
  organizationGithubOrgId?: string;
  repositoryKey?: string;
}): Promise<void> {
  const thread = input.metadata.thread;
  const rowId = [
    input.actor.githubUserId,
    thread.source,
    Buffer.from(thread.id, "utf-8").toString("base64url"),
  ].join(":");

  await db.query(
    `INSERT INTO "threads" (
      id,
      "threadId",
      "providerSessionId",
      source,
      title,
      "messageCount",
      "ownerGithubUserId",
      "ownerGithubUsername",
      "organizationGithubOrgId",
      "repositoryGithubRepoId",
      "publicId",
      "storageProvider",
      "storageSourceId",
      "artifactFileName",
      "artifactFormat",
      "startedAt",
      "updatedAt",
      "uploadedAt",
      "commitSha",
      "createdAt",
      "lastSeenAt"
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, NOW(), $18, NOW(), NOW()
    )
    ON CONFLICT ("ownerGithubUserId", source, "threadId") DO UPDATE SET
      "providerSessionId" = EXCLUDED."providerSessionId",
      title = EXCLUDED.title,
      "messageCount" = EXCLUDED."messageCount",
      "ownerGithubUsername" = EXCLUDED."ownerGithubUsername",
      "organizationGithubOrgId" = EXCLUDED."organizationGithubOrgId",
      "repositoryGithubRepoId" = EXCLUDED."repositoryGithubRepoId",
      "publicId" = EXCLUDED."publicId",
      "storageProvider" = EXCLUDED."storageProvider",
      "storageSourceId" = EXCLUDED."storageSourceId",
      "artifactFileName" = EXCLUDED."artifactFileName",
      "artifactFormat" = EXCLUDED."artifactFormat",
      "startedAt" = EXCLUDED."startedAt",
      "updatedAt" = EXCLUDED."updatedAt",
      "uploadedAt" = NOW(),
      "commitSha" = EXCLUDED."commitSha",
      "lastSeenAt" = NOW()`,
    [
      rowId,
      thread.id,
      thread.providerSessionId,
      thread.source,
      thread.title || null,
      thread.messageCount ?? null,
      input.actor.githubUserId,
      input.actor.githubUsername,
      input.organizationGithubOrgId || null,
      input.repositoryKey || null,
      input.storage.publicId,
      input.storage.provider,
      input.storage.sourceId,
      input.artifact.fileName,
      input.artifact.format,
      thread.startedAt || null,
      thread.updatedAt,
      input.metadata.commit?.sha || null,
    ],
  );
}

async function resolveOrganizationContext(input: {
  metadata: AthrdMetadata;
  github?: GithubIngestContext;
  actor: AuthenticatedGithubActor;
}): Promise<ResolvedOrganizationContext> {
  const githubOrgId =
    input.metadata.organization?.githubOrgId?.trim() ||
    input.github?.organization?.githubOrgId?.trim();

  if (githubOrgId) {
    const organization = input.github?.organization;
    if (organization?.login) {
      return {
        githubOrgId,
        organization: {
          githubOrgId,
          login: organization.login,
          ...(organization.name ? { name: organization.name } : {}),
          ...(organization.avatarUrl
            ? { avatarUrl: organization.avatarUrl }
            : {}),
        },
      };
    }

    return { githubOrgId };
  }

  const ownerLogin = getRepositoryOwner(input.metadata, input.github);
  if (
    !ownerLogin ||
    ownerLogin.toLowerCase() === input.actor.githubUsername.toLowerCase()
  ) {
    return {};
  }

  const organization = await findKnownOrganizationByLogin(ownerLogin);
  if (!organization) {
    return {};
  }

  return {
    githubOrgId: organization.githubOrgId,
    organization: {
      githubOrgId: organization.githubOrgId,
      login: organization.login,
      ...(organization.name ? { name: organization.name } : {}),
      ...(organization.avatarUrl ? { avatarUrl: organization.avatarUrl } : {}),
    },
  };
}

async function findKnownOrganizationByLogin(
  login: string,
): Promise<OrganizationLookupRow | null> {
  const normalizedLogin = login.trim();
  if (!normalizedLogin) {
    return null;
  }

  const result = await db.query<OrganizationLookupRow>(
    `SELECT
      "githubOrgId",
      login,
      name,
      "avatarUrl"
    FROM "organizations"
    WHERE LOWER(login) = LOWER($1)
    LIMIT 1`,
    [normalizedLogin],
  );

  return result.rows[0] ?? null;
}

function resolveRepositoryForPersistence(
  metadata: AthrdMetadata,
  github: GithubIngestContext | undefined,
): RepositoryPersistenceContext | null {
  const metadataRepository = metadata.repository;
  const githubRepository = github?.repository;
  const fullName = firstNonEmptyString(
    githubRepository?.fullName,
    metadataRepository?.fullName,
  );
  const [ownerFromFullName, nameFromFullName] =
    parseRepositoryFullName(fullName);
  const owner = firstNonEmptyString(
    githubRepository?.owner,
    metadataRepository?.owner,
    ownerFromFullName,
  );
  const name = firstNonEmptyString(
    githubRepository?.name,
    metadataRepository?.name,
    nameFromFullName,
  );
  const githubRepoId = firstNonEmptyString(
    githubRepository?.githubRepoId,
    metadataRepository?.githubRepoId,
  );

  if (!githubRepoId && !owner && !name && !fullName) {
    return null;
  }

  const resolvedOwner = owner || ownerFromFullName || "unknown";
  const resolvedName = name || nameFromFullName || githubRepoId || "unknown";
  const resolvedFullName = fullName || `${resolvedOwner}/${resolvedName}`;

  return {
    key: githubRepoId || `slug:${resolvedFullName.toLowerCase()}`,
    ...(githubRepoId ? { githubRepoId } : {}),
    owner: resolvedOwner,
    name: resolvedName,
    fullName: resolvedFullName,
    ...(githubRepository?.htmlUrl ? { htmlUrl: githubRepository.htmlUrl } : {}),
    ...(githubRepository?.defaultBranch
      ? { defaultBranch: githubRepository.defaultBranch }
      : {}),
    ...(typeof githubRepository?.private === "boolean"
      ? { private: githubRepository.private }
      : {}),
  };
}

function getRepositoryOwner(
  metadata: AthrdMetadata,
  github: GithubIngestContext | undefined,
): string | undefined {
  const fullName = firstNonEmptyString(
    github?.repository?.fullName,
    metadata.repository?.fullName,
  );
  const [ownerFromFullName] = parseRepositoryFullName(fullName);
  return firstNonEmptyString(
    github?.repository?.owner,
    metadata.repository?.owner,
    ownerFromFullName,
  );
}

function firstNonEmptyString(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      return trimmedValue;
    }
  }

  return undefined;
}

function parseRepositoryFullName(
  fullName: string | undefined,
): [string | undefined, string | undefined] {
  const [owner, name, ...rest] = fullName?.split("/") ?? [];
  if (!owner || !name || rest.length > 0) {
    return [undefined, undefined];
  }

  return [owner, name];
}

function buildManagedS3ObjectKey(input: {
  metadata: AthrdMetadata;
  artifact: ArtifactDescriptor;
  githubOrgId?: string;
}): string {
  const githubOrgId = input.githubOrgId?.trim();
  if (!githubOrgId) {
    throw new IngestHttpError(400, "S3 uploads require an organization.");
  }

  const fileName = [
    "athrd",
    sanitizeObjectKeySegment(input.metadata.thread.source),
    sanitizeObjectKeySegment(input.metadata.thread.id),
  ].join("-");

  return `${githubOrgId}/${input.metadata.actor.githubUserId}/${fileName}.${input.artifact.format}`;
}

function assertS3StorageConfig(
  config: S3StorageConfig,
): asserts config is Required<
  Pick<S3StorageConfig, "bucket" | "region" | "accessKeyId" | "secretAccessKey">
> &
  S3StorageConfig {
  if (
    !config.bucket ||
    !config.region ||
    !config.accessKeyId ||
    !config.secretAccessKey
  ) {
    throw new IngestHttpError(500, "S3 storage is not fully configured.");
  }
}

function createS3PresignedPutUrl(input: {
  config: Required<
    Pick<S3StorageConfig, "bucket" | "region" | "accessKeyId" | "secretAccessKey">
  > &
    S3StorageConfig;
  objectKey: string;
  ttlSeconds: number;
}): { url: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
  const bunUrl = createBunS3PresignedPutUrl(input);
  if (bunUrl) {
    return { url: bunUrl, expiresAt };
  }

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";
  const credentialScope = `${dateStamp}/${input.config.region}/${service}/aws4_request`;
  const url = createS3ObjectUrl(input.config, input.objectKey);

  url.searchParams.set("X-Amz-Algorithm", S3_SIGNATURE_ALGORITHM);
  url.searchParams.set(
    "X-Amz-Credential",
    `${input.config.accessKeyId}/${credentialScope}`,
  );
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(input.ttlSeconds));
  url.searchParams.set("X-Amz-SignedHeaders", "host");

  const canonicalRequest = [
    "PUT",
    getCanonicalUri(url.pathname),
    getCanonicalQueryString(url.searchParams),
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    S3_SIGNATURE_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(
    input.config.secretAccessKey,
    dateStamp,
    input.config.region,
    service,
  );
  const signature = hmacHex(signingKey, stringToSign);

  url.searchParams.set("X-Amz-Signature", signature);

  return { url: url.toString(), expiresAt };
}

type BunRuntimeLike = {
  S3Client: new (options: {
    region?: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    virtualHostedStyle?: boolean;
  }) => {
    file(path: string): {
      presign(options: { expiresIn: number; method: "PUT" }): string;
    };
  };
};

function createBunS3PresignedPutUrl(input: {
  config: Required<
    Pick<S3StorageConfig, "bucket" | "region" | "accessKeyId" | "secretAccessKey">
  > &
    S3StorageConfig;
  objectKey: string;
  ttlSeconds: number;
}): string | null {
  const BunRuntime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike })
    .Bun;

  if (!BunRuntime?.S3Client) {
    return null;
  }

  const client = new BunRuntime.S3Client({
    region: input.config.region,
    bucket: input.config.bucket,
    accessKeyId: input.config.accessKeyId,
    secretAccessKey: input.config.secretAccessKey,
    endpoint: input.config.endpointUrl || undefined,
    virtualHostedStyle: input.config.virtualHostedStyle,
  });
  const file = client.file(input.objectKey);
  const presignedUrl = file.presign({
    expiresIn: input.ttlSeconds,
    method: "PUT",
  });

  return isAwsV4S3PresignedUrl(presignedUrl) ? presignedUrl : null;
}

function isAwsV4S3PresignedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const credential = url.searchParams.get("X-Amz-Credential") || "";

    return (
      url.searchParams.get("X-Amz-Algorithm") === S3_SIGNATURE_ALGORITHM &&
      credential.endsWith("/s3/aws4_request") &&
      /^[a-f0-9]{64}$/.test(url.searchParams.get("X-Amz-Signature") || "")
    );
  } catch {
    return false;
  }
}

function createS3ObjectUrl(config: S3StorageConfig, objectKey: string): URL {
  const endpoint = config.endpointUrl
    ? new URL(config.endpointUrl)
    : new URL(`https://s3.${config.region}.amazonaws.com`);
  const encodedObjectKey = objectKey
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");

  if (config.virtualHostedStyle) {
    endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
    endpoint.pathname = joinUrlPath(endpoint.pathname, encodedObjectKey);
    return endpoint;
  }

  endpoint.pathname = joinUrlPath(endpoint.pathname, config.bucket || "", encodedObjectKey);
  return endpoint;
}

function getCanonicalUri(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => encodeRfc3986(decodeURIComponent(segment)))
    .join("/");
}

function getCanonicalQueryString(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }

      return leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, service);
  return hmacBuffer(serviceKey, "aws4_request");
}

function hmacBuffer(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: string | Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function joinUrlPath(...parts: string[]): string {
  return `/${parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    .join("/")}`;
}

function sanitizeObjectKeySegment(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "thread";
}

function buildThreadUrl(publicId: string): string {
  const baseUrl = (
    process.env.NEXT_PUBLIC_ATHRD_URL ||
    process.env.BETTER_AUTH_URL ||
    "https://athrd.com"
  ).replace(/\/+$/, "");

  return `${baseUrl}/threads/${encodeURIComponent(publicId)}`;
}
