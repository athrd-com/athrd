import { z } from "zod";
import { createHash, createHmac } from "crypto";
import { createS3PublicId } from "~/lib/sources/locator";
import { db } from "~/server/db";
import {
  getOrganizationStorageConfig,
  type S3StorageConfig,
} from "~/server/organization-storage";

const S3_SIGNED_UPLOAD_TTL_SECONDS = 300;
const S3_SIGNATURE_ALGORITHM = "AWS4-HMAC-SHA256";

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
        githubRepoId: nonEmptyString,
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
        githubOrgId: nonEmptyString,
        login: nonEmptyString,
        name: z.string().optional(),
        avatarUrl: z.string().optional(),
      })
      .optional(),
    repository: z
      .object({
        githubRepoId: nonEmptyString,
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

export async function authenticateGithubRequest(
  request: Request,
): Promise<AuthenticatedGithubActor> {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new IngestHttpError(401, "Missing GitHub bearer token.");
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

  return {
    githubUserId: String(user.id),
    githubUsername: user.login,
    avatarUrl: user.avatar_url,
  };
}

export async function createIngestPlan(
  metadata: AthrdMetadata,
  actor: AuthenticatedGithubActor,
): Promise<IngestPlan> {
  assertMetadataActor(metadata, actor);

  const storage = await getOrganizationStorageConfig(
    metadata.organization?.githubOrgId,
  );

  return {
    storageProvider: storage.provider,
    uploadMode: storage.provider === "s3" ? "signed-url" : "client",
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

  await upsertOrganization(
    input.metadata.organization?.githubOrgId,
    input.github?.organization,
  );
  await upsertRepository(
    input.metadata.repository?.githubRepoId,
    input.metadata.organization?.githubOrgId,
    input.github,
  );
  await upsertThread(input);

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

  const githubOrgId = input.metadata.organization?.githubOrgId;
  const storage = await getOrganizationStorageConfig(githubOrgId);

  if (storage.provider !== "s3") {
    throw new IngestHttpError(
      409,
      "Organization is configured for client-side Gist uploads.",
    );
  }

  if (!githubOrgId) {
    throw new IngestHttpError(400, "S3 uploads require an organization.");
  }

  assertS3StorageConfig(storage.s3);
  const sourceId = buildManagedS3ObjectKey(input.metadata, input.artifact);
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

async function upsertOrganization(
  githubOrgId: string | undefined,
  organization: NonNullable<GithubIngestContext>["organization"] | undefined,
): Promise<void> {
  if (!githubOrgId) {
    return;
  }

  const login = organization?.login?.trim() || `github-org-${githubOrgId}`;

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
      login = EXCLUDED.login,
      name = COALESCE(EXCLUDED.name, "organizations".name),
      "avatarUrl" = COALESCE(EXCLUDED."avatarUrl", "organizations"."avatarUrl"),
      "updatedAt" = NOW(),
      "lastSeenAt" = NOW()`,
    [githubOrgId, login, organization?.name || null, organization?.avatarUrl || null],
  );
}

async function upsertRepository(
  githubRepoId: string | undefined,
  githubOrgId: string | undefined,
  github: GithubIngestContext | undefined,
): Promise<void> {
  if (!githubRepoId) {
    return;
  }

  const repository = github?.repository;
  const fullName = repository?.fullName?.trim();
  const [fallbackOwner, fallbackName] = fullName?.split("/") ?? [];
  const owner =
    repository?.owner?.trim() ||
    fallbackOwner ||
    github?.organization?.login ||
    "unknown";
  const name = repository?.name?.trim() || fallbackName || githubRepoId;

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
      githubRepoId,
      githubOrgId || null,
      owner,
      name,
      fullName || `${owner}/${name}`,
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
      input.metadata.organization?.githubOrgId || null,
      input.metadata.repository?.githubRepoId || null,
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

function buildManagedS3ObjectKey(
  metadata: AthrdMetadata,
  artifact: ArtifactDescriptor,
): string {
  const githubOrgId = metadata.organization?.githubOrgId;
  if (!githubOrgId) {
    throw new IngestHttpError(400, "S3 uploads require an organization.");
  }

  const fileName = [
    "athrd",
    sanitizeObjectKeySegment(metadata.thread.source),
    sanitizeObjectKeySegment(metadata.thread.id),
  ].join("-");

  return `${githubOrgId}/${metadata.actor.githubUserId}/${fileName}.${artifact.format}`;
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
