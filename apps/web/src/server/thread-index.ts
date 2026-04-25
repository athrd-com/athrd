import { createHash } from "node:crypto";
import { createThreadSourceRecordFromGist } from "~/lib/sources/gist";
import { createS3PublicId, parseThreadLocator } from "~/lib/sources/locator";
import { S3ThreadSourceProvider } from "~/lib/sources/s3";
import type { ThreadSource, ThreadSourceRecord } from "~/lib/sources/types";
import { fetchGist } from "~/lib/github";
import {
  parseThreadContextFromSourceRecord,
  type ThreadContext,
} from "~/lib/thread-loader";
import { db } from "~/server/db";

export type ThreadSyncSource = Extract<ThreadSource, "gist" | "s3">;

export interface SyncThreadIndexInput {
  source: ThreadSyncSource;
  sourceId: string;
  accessToken: string;
}

export interface SyncThreadIndexResult {
  publicId: string;
}

interface GithubTokenUser {
  id: string;
  login: string;
}

interface GithubOrganizationMetadata {
  id: string;
  login: string;
  avatarUrl?: string;
}

interface ThreadIndexRecord {
  publicId: string;
  source: ThreadSyncSource;
  sourceId: string;
  ownerGithubId: string;
  ownerGithubLogin?: string;
  title?: string;
  ide?: string;
  model?: string;
  modelProvider?: string;
  repoName?: string;
  commitHash?: string;
  ghRepoId?: string;
  organization?: GithubOrganizationMetadata;
  createdAt: Date | null;
  updatedAt: Date | null;
  contentSha256: string;
}

interface ThreadIndexUpsertRow {
  id: string;
}

export class ThreadSyncError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ThreadSyncError";
    this.status = status;
    this.code = code;
  }
}

export function isThreadSyncSource(value: unknown): value is ThreadSyncSource {
  return value === "gist" || value === "s3";
}

export async function syncThreadIndex(
  input: SyncThreadIndexInput,
): Promise<SyncThreadIndexResult> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new ThreadSyncError(401, "missing_token", "Missing GitHub token.");
  }

  const githubUser = await fetchGithubTokenUser(accessToken);
  const sourceRecord = await readCanonicalSourceRecord(input, githubUser);
  const indexRecord = buildThreadIndexRecord(sourceRecord, githubUser);
  await upsertThreadIndex(indexRecord);

  return {
    publicId: indexRecord.publicId,
  };
}

export function buildThreadIndexRecord(
  sourceRecord: ThreadSourceRecord,
  owner: GithubTokenUser,
): ThreadIndexRecord {
  const content = sourceRecord.content || "";
  const contentSha256 = createHash("sha256").update(content).digest("hex");
  const fallbackRawContent = parseJsonRecord(content);
  let context: ThreadContext | null = null;

  try {
    context = parseThreadContextFromSourceRecord(sourceRecord);
  } catch {
    // Keep the index useful even if the full thread cannot be parsed.
  }

  const rawContent = context?.rawContent ?? fallbackRawContent;
  const athrdMeta = getRecord(rawContent, "__athrd");
  const normalizedRecord = context?.record ?? sourceRecord;
  const organization = extractOrganizationMetadata(athrdMeta);

  return {
    publicId: normalizedRecord.id,
    source: normalizedRecord.source,
    sourceId: normalizedRecord.sourceId,
    ownerGithubId: owner.id,
    ownerGithubLogin: owner.login,
    title:
      context?.title ||
      normalizedRecord.title ||
      extractTitle(rawContent) ||
      getFilenameTitle(normalizedRecord.filename),
    ide: context?.ide ?? getString(athrdMeta, "ide"),
    model: context?.modelsUsed[0],
    modelProvider: extractModelProvider(rawContent),
    repoName: context?.repoName ?? getString(athrdMeta, "githubRepo"),
    commitHash: context?.commitHash ?? getString(athrdMeta, "commitHash"),
    ghRepoId: stringifyMetadataValue(athrdMeta?.ghRepoId),
    organization,
    createdAt: toDate(
      normalizedRecord.createdAt ??
        firstDefinedValue(
          getString(rawContent, "timestamp"),
          getString(rawContent, "createdAt"),
          getString(rawContent, "created_at"),
          getNestedValue(rawContent, ["metadata", "createdAt"]),
          getString(rawContent, "startTime"),
        ),
    ),
    updatedAt: toDate(
      normalizedRecord.updatedAt ??
        firstDefinedValue(
          getString(rawContent, "updatedAt"),
          getString(rawContent, "updated_at"),
          getString(rawContent, "lastUpdated"),
          getNestedValue(rawContent, ["metadata", "lastUpdatedAt"]),
        ),
    ),
    contentSha256,
  };
}

async function readCanonicalSourceRecord(
  input: SyncThreadIndexInput,
  owner: GithubTokenUser,
): Promise<ThreadSourceRecord> {
  if (input.source === "gist") {
    return readGistSourceRecord(input.sourceId, input.accessToken, owner);
  }

  return readS3SourceRecord(input.sourceId, owner);
}

async function readGistSourceRecord(
  sourceId: string,
  accessToken: string,
  owner: GithubTokenUser,
): Promise<ThreadSourceRecord> {
  const gistId = sourceId.trim();
  if (!gistId) {
    throw new ThreadSyncError(400, "invalid_source_id", "Gist id is required.");
  }

  const { gist, file } = await fetchGist(gistId, {
    accessToken,
    noStore: true,
  });

  if (!gist || !file) {
    throw new ThreadSyncError(404, "thread_not_found", "Gist thread not found.");
  }

  if (String(gist.owner.id) !== owner.id) {
    throw new ThreadSyncError(
      403,
      "owner_mismatch",
      "The authenticated GitHub user does not own this gist.",
    );
  }

  return createThreadSourceRecordFromGist(gist, file);
}

async function readS3SourceRecord(
  rawSourceId: string,
  owner: GithubTokenUser,
): Promise<ThreadSourceRecord> {
  const sourceId = normalizeS3SourceId(rawSourceId);
  const s3OwnerId = getS3OwnerId(sourceId);

  if (!s3OwnerId) {
    throw new ThreadSyncError(
      400,
      "invalid_source_id",
      "S3 source id must include org id, owner GitHub id, and file name.",
    );
  }

  if (s3OwnerId !== owner.id) {
    throw new ThreadSyncError(
      403,
      "owner_mismatch",
      "The authenticated GitHub user does not own this S3 thread.",
    );
  }

  const publicId = createS3PublicId(sourceId);
  const provider = new S3ThreadSourceProvider();
  const record = await provider.readThread({
    publicId,
    source: "s3",
    sourceId,
  });

  if (!record) {
    throw new ThreadSyncError(404, "thread_not_found", "S3 thread not found.");
  }

  return {
    ...record,
    id: publicId,
    sourceId,
  };
}

function normalizeS3SourceId(rawSourceId: string): string {
  const sourceId = rawSourceId.trim();
  if (!sourceId) {
    throw new ThreadSyncError(400, "invalid_source_id", "S3 source id is required.");
  }

  if (!sourceId.startsWith("S-")) {
    return sourceId;
  }

  try {
    const locator = parseThreadLocator(sourceId);
    if (locator.source !== "s3") {
      throw new Error("Invalid S3 locator.");
    }
    return locator.sourceId;
  } catch (error) {
    throw new ThreadSyncError(
      400,
      "invalid_source_id",
      error instanceof Error ? error.message : "Invalid S3 source id.",
    );
  }
}

function getS3OwnerId(sourceId: string): string | null {
  const [, ownerId] = sourceId.split("/").filter(Boolean);
  return ownerId || null;
}

async function fetchGithubTokenUser(accessToken: string): Promise<GithubTokenUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ThreadSyncError(
      response.status === 401 || response.status === 403 ? 401 : 502,
      "invalid_token",
      "Unable to verify the GitHub token.",
    );
  }

  let user: {
    id?: unknown;
    login?: unknown;
    avatar_url?: unknown;
    html_url?: unknown;
  };

  try {
    user = (await response.json()) as typeof user;
  } catch {
    throw new ThreadSyncError(
      502,
      "invalid_github_response",
      "GitHub did not return a valid user.",
    );
  }

  if (
    (typeof user.id !== "number" && typeof user.id !== "string") ||
    typeof user.login !== "string" ||
    !user.login.trim()
  ) {
    throw new ThreadSyncError(
      502,
      "invalid_github_response",
      "GitHub did not return a valid user.",
    );
  }

  return {
    id: String(user.id),
    login: user.login,
  };
}

async function upsertThreadIndex(record: ThreadIndexRecord): Promise<void> {
  if (record.organization) {
    await upsertGithubOrganization(record.organization);
  }

  await db.query<ThreadIndexUpsertRow>(
    `
      INSERT INTO thread_index (
        id,
        source,
        source_id,
        owner_github_id,
        owner_github_login,
        title,
        ide,
        model,
        model_provider,
        repo_name,
        commit_hash,
        gh_repo_id,
        org_id,
        created_at,
        updated_at,
        content_sha256,
        deleted_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        NULL
      )
      ON CONFLICT (source, source_id) DO UPDATE SET
        id = EXCLUDED.id,
        owner_github_id = EXCLUDED.owner_github_id,
        owner_github_login = EXCLUDED.owner_github_login,
        title = EXCLUDED.title,
        ide = EXCLUDED.ide,
        model = EXCLUDED.model,
        model_provider = EXCLUDED.model_provider,
        repo_name = EXCLUDED.repo_name,
        commit_hash = EXCLUDED.commit_hash,
        gh_repo_id = EXCLUDED.gh_repo_id,
        org_id = EXCLUDED.org_id,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        content_sha256 = EXCLUDED.content_sha256,
        deleted_at = NULL
      RETURNING id
    `,
    [
      record.publicId,
      record.source,
      record.sourceId,
      record.ownerGithubId,
      record.ownerGithubLogin ?? null,
      record.title ?? null,
      record.ide ?? null,
      record.model ?? null,
      record.modelProvider ?? null,
      record.repoName ?? null,
      record.commitHash ?? null,
      record.ghRepoId ?? null,
      record.organization?.id ?? null,
      record.createdAt,
      record.updatedAt,
      record.contentSha256,
    ],
  );
}

async function upsertGithubOrganization(
  organization: GithubOrganizationMetadata,
): Promise<void> {
  await db.query(
    `
      INSERT INTO github_organizations (id, login, avatar_url, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id) DO UPDATE SET
        login = EXCLUDED.login,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
    `,
    [organization.id, organization.login, organization.avatarUrl ?? null],
  );
}

function parseJsonRecord(content: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(content) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function extractTitle(rawContent: Record<string, unknown> | undefined): string | undefined {
  if (!rawContent) {
    return undefined;
  }

  return firstNonEmptyString(
    getNestedString(rawContent, ["__athrd", "title"]),
    getNestedString(rawContent, ["metadata", "name"]),
    getString(rawContent, "title"),
    getString(rawContent, "customTitle"),
    getString(rawContent, "summary"),
  );
}

function extractModelProvider(rawContent: Record<string, unknown> | undefined): string | undefined {
  if (!rawContent) {
    return undefined;
  }

  const athrdMeta = getRecord(rawContent, "__athrd");
  const payload = getRecord(rawContent, "payload");

  const directValue = firstNonEmptyString(
    getString(athrdMeta, "modelProvider"),
    getString(athrdMeta, "model_provider"),
    getString(payload, "model_provider"),
  );
  if (directValue) {
    return directValue;
  }

  const messages = rawContent.messages;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (!isRecord(message)) {
        continue;
      }
      const messagePayload = getRecord(message, "payload");
      const provider = getString(messagePayload, "model_provider");
      if (provider) {
        return provider;
      }
    }
  }

  return undefined;
}

function extractOrganizationMetadata(
  athrdMeta: Record<string, unknown> | undefined,
): GithubOrganizationMetadata | undefined {
  const id = stringifyMetadataValue(athrdMeta?.orgId);
  if (!id) {
    return undefined;
  }

  return {
    id,
    login: getString(athrdMeta, "orgName") || id,
    avatarUrl: getString(athrdMeta, "orgIcon"),
  };
}

function getFilenameTitle(filename: string): string | undefined {
  const title = filename.replace(/^athrd-/i, "").replace(/\.json$/i, "").trim();
  return title || undefined;
}

function getRecord(
  input: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = input?.[key];
  return isRecord(value) ? value : undefined;
}

function getString(
  input: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNestedString(
  input: Record<string, unknown>,
  path: string[],
): string | undefined {
  const value = getNestedValue(input, path);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNestedValue(
  input: Record<string, unknown> | undefined,
  path: string[],
): string | number | undefined {
  let current: unknown = input;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === "string" || typeof current === "number"
    ? current
    : undefined;
}

function stringifyMetadataValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function firstNonEmptyString(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim());
}

function firstDefinedValue(
  ...values: Array<string | number | undefined>
): string | number | undefined {
  return values.find((value) => value !== undefined);
}

function toDate(value: string | number | Date | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
