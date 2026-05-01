"use server";

import { GistThreadSourceProvider } from "@/lib/sources/gist";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { S3ThreadSourceProvider } from "~/lib/sources/s3";
import { parseThreadLocator } from "~/lib/thread-source";
import type {
  ThreadFilterOptions,
  ThreadListEntry,
  ThreadListGroups,
  ThreadListPage,
} from "~/lib/thread-list";
import { fetchGist } from "~/lib/github";
import { auth } from "~/server/better-auth/config";
import { getGithubAccount } from "~/server/github-account";
import { db } from "~/server/db";

interface Account {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  accessToken: string | null;
}

const s3ThreadSourceProvider = new S3ThreadSourceProvider();
const gistThreadSourceProvider = new GistThreadSourceProvider();
const THREADS_PAGE_SIZE = 20;

interface ThreadGroupFilters {
  orgId?: string;
  repoId?: string;
  cursor?: string;
}

type NormalizedThreadGroupFilters = ThreadGroupFilters;

interface ThreadDbRow {
  rowId: string;
  publicId: string;
  storageProvider: "gist" | "s3";
  storageSourceId: string;
  title: string | null;
  startedAt: Date | string | null;
  updatedAt: Date | string;
  uploadedAt: Date | string | null;
  ide: string;
  messageCount: number | null;
  organizationId: string | null;
  organizationLogin: string | null;
  organizationAvatarUrl: string | null;
  repositoryId: string | null;
  repositoryFullName: string | null;
  repositoryOwner: string | null;
  repositoryName: string | null;
  commitSha: string | null;
  artifactFormat: string | null;
}

interface OrganizationFilterRow {
  id: string;
  login: string;
  avatarUrl: string | null;
}

interface RepositoryFilterRow {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  organizationId: string | null;
}

const EMPTY_THREAD_GROUPS: ThreadListGroups = {
  today: [],
  yesterday: [],
  older: { items: [] },
};

export async function getUserThreadGroups(
  filters: ThreadGroupFilters = {},
): Promise<ThreadListGroups> {
  const account = await getCurrentGithubAccount();

  if (!account) {
    return EMPTY_THREAD_GROUPS;
  }

  const normalizedFilters = normalizeThreadFilters(filters);
  const { todayStart, tomorrowStart, yesterdayStart } = getDayBoundaries();

  const [today, yesterday, older] = await Promise.all([
    queryThreadEntries({
      ownerGithubUserId: account.accountId,
      filters: normalizedFilters,
      dateRange: { from: todayStart, to: tomorrowStart },
    }),
    queryThreadEntries({
      ownerGithubUserId: account.accountId,
      filters: normalizedFilters,
      dateRange: { from: yesterdayStart, to: todayStart },
    }),
    queryOlderThreadEntries({
      ownerGithubUserId: account.accountId,
      filters: normalizedFilters,
      before: yesterdayStart,
      cursor: normalizedFilters.cursor,
    }),
  ]);

  return {
    today,
    yesterday,
    older,
  };
}

export async function getUserThreads(
  orgId?: string,
  cursor?: string,
  repoId?: string,
): Promise<ThreadListPage> {
  const groups = await getUserThreadGroups({ orgId, repoId, cursor });

  return {
    items: [...groups.today, ...groups.yesterday, ...groups.older.items],
    nextCursor: groups.older.nextCursor,
  };
}

export async function getThreadFilterOptions(
  orgId?: string,
): Promise<ThreadFilterOptions> {
  const account = await getCurrentGithubAccount();

  if (!account) {
    return { organizations: [], repositories: [] };
  }

  const normalizedOrgId = normalizeOptionalParam(orgId);

  const [organizationsResult, repositoriesResult] = await Promise.all([
    db.query<OrganizationFilterRow>(
      `SELECT DISTINCT
        COALESCE(o."githubOrgId", t."organizationGithubOrgId") AS id,
        COALESCE(o.login, t."organizationGithubOrgId") AS login,
        o."avatarUrl" AS "avatarUrl",
        LOWER(COALESCE(o.login, t."organizationGithubOrgId")) AS "sortKey"
      FROM "threads" t
      LEFT JOIN "organizations" o
        ON o."githubOrgId" = t."organizationGithubOrgId"
      WHERE t."ownerGithubUserId" = $1
        AND t."organizationGithubOrgId" IS NOT NULL
      ORDER BY "sortKey" ASC`,
      [account.accountId],
    ),
    db.query<RepositoryFilterRow>(
      `SELECT DISTINCT
        COALESCE(r."githubRepoId", t."repositoryGithubRepoId") AS id,
        COALESCE(r."fullName", t."repositoryGithubRepoId") AS "fullName",
        COALESCE(r.owner, SPLIT_PART(r."fullName", '/', 1), '') AS owner,
        COALESCE(r.name, SPLIT_PART(r."fullName", '/', 2), t."repositoryGithubRepoId") AS name,
        r."githubOrgId" AS "organizationId",
        LOWER(COALESCE(r."fullName", t."repositoryGithubRepoId")) AS "sortKey"
      FROM "threads" t
      LEFT JOIN "repositories" r
        ON r."githubRepoId" = t."repositoryGithubRepoId"
      WHERE t."ownerGithubUserId" = $1
        AND t."repositoryGithubRepoId" IS NOT NULL
        ${normalizedOrgId ? 'AND t."organizationGithubOrgId" = $2' : ""}
      ORDER BY "sortKey" ASC`,
      normalizedOrgId ? [account.accountId, normalizedOrgId] : [account.accountId],
    ),
  ]);

  return {
    organizations: organizationsResult.rows
      .filter((row) => Boolean(row.id && row.login))
      .map((row) => ({
        id: row.id,
        login: row.login,
        avatarUrl: row.avatarUrl || undefined,
      })),
    repositories: repositoriesResult.rows
      .filter((row) => Boolean(row.id && row.fullName))
      .map((row) => ({
        id: row.id,
        fullName: row.fullName,
        owner: row.owner,
        name: row.name,
        organizationId: row.organizationId || undefined,
      })),
  };
}

async function getCurrentGithubAccount(): Promise<Account | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const result = await db.query<Account>(
    'SELECT id, "userId", "providerId", "accountId", "accessToken" FROM account WHERE "userId" = $1 AND "providerId" = \'github\' LIMIT 1',
    [session.user.id],
  );

  const account = result.rows[0];
  if (!account?.accountId) {
    return null;
  }

  return account;
}

async function queryThreadEntries(input: {
  ownerGithubUserId: string;
  filters: NormalizedThreadGroupFilters;
  dateRange: { from: Date; to: Date };
}): Promise<ThreadListEntry[]> {
  const { clauses, values } = buildThreadWhereClauses({
    ownerGithubUserId: input.ownerGithubUserId,
    filters: input.filters,
  });

  values.push(input.dateRange.from, input.dateRange.to);
  clauses.push(
    `t."updatedAt" >= $${values.length - 1} AND t."updatedAt" < $${values.length}`,
  );

  const result = await db.query<ThreadDbRow>(
    `${THREAD_LIST_SELECT}
    WHERE ${clauses.join(" AND ")}
    ORDER BY t."updatedAt" DESC, t.id DESC`,
    values,
  );

  return result.rows.map(mapThreadDbRow);
}

async function queryOlderThreadEntries(input: {
  ownerGithubUserId: string;
  filters: NormalizedThreadGroupFilters;
  before: Date;
  cursor?: string;
}): Promise<ThreadListPage> {
  const { clauses, values } = buildThreadWhereClauses({
    ownerGithubUserId: input.ownerGithubUserId,
    filters: input.filters,
  });

  values.push(input.before);
  clauses.push(`t."updatedAt" < $${values.length}`);

  const cursor = decodeThreadCursor(input.cursor);
  if (cursor) {
    values.push(cursor.updatedAt, cursor.updatedAt, cursor.rowId);
    clauses.push(
      `(t."updatedAt" < $${values.length - 2} OR (t."updatedAt" = $${values.length - 1} AND t.id < $${values.length}))`,
    );
  }

  values.push(THREADS_PAGE_SIZE + 1);

  const result = await db.query<ThreadDbRow>(
    `${THREAD_LIST_SELECT}
    WHERE ${clauses.join(" AND ")}
    ORDER BY t."updatedAt" DESC, t.id DESC
    LIMIT $${values.length}`,
    values,
  );

  const hasMore = result.rows.length > THREADS_PAGE_SIZE;
  const rows = hasMore ? result.rows.slice(0, THREADS_PAGE_SIZE) : result.rows;
  const lastRow = rows[rows.length - 1];

  return {
    items: rows.map(mapThreadDbRow),
    nextCursor: hasMore && lastRow ? encodeThreadCursor(lastRow) : undefined,
  };
}

const THREAD_LIST_SELECT = `SELECT
  t.id AS "rowId",
  t."publicId" AS "publicId",
  t."storageProvider" AS "storageProvider",
  t."storageSourceId" AS "storageSourceId",
  t.title,
  t."startedAt" AS "startedAt",
  t."updatedAt" AS "updatedAt",
  t."uploadedAt" AS "uploadedAt",
  t.source AS ide,
  t."messageCount" AS "messageCount",
  o."githubOrgId" AS "organizationId",
  o.login AS "organizationLogin",
  o."avatarUrl" AS "organizationAvatarUrl",
  r."githubRepoId" AS "repositoryId",
  r."fullName" AS "repositoryFullName",
  r.owner AS "repositoryOwner",
  r.name AS "repositoryName",
  t."commitSha" AS "commitSha",
  t."artifactFormat" AS "artifactFormat"
FROM "threads" t
LEFT JOIN "organizations" o
  ON o."githubOrgId" = t."organizationGithubOrgId"
LEFT JOIN "repositories" r
  ON r."githubRepoId" = t."repositoryGithubRepoId"`;

function buildThreadWhereClauses(input: {
  ownerGithubUserId: string;
  filters: NormalizedThreadGroupFilters;
}): { clauses: string[]; values: unknown[] } {
  const clauses = ['t."ownerGithubUserId" = $1'];
  const values: unknown[] = [input.ownerGithubUserId];

  if (input.filters.orgId) {
    values.push(input.filters.orgId);
    clauses.push(`t."organizationGithubOrgId" = $${values.length}`);
  }

  if (input.filters.repoId) {
    values.push(input.filters.repoId);
    clauses.push(`t."repositoryGithubRepoId" = $${values.length}`);
  }

  return { clauses, values };
}

function mapThreadDbRow(row: ThreadDbRow): ThreadListEntry {
  return {
    id: row.publicId,
    source: row.storageProvider,
    sourceId: row.storageSourceId,
    title: row.title || undefined,
    createdAt: row.startedAt || row.updatedAt,
    updatedAt: row.updatedAt,
    uploadedAt: row.uploadedAt || undefined,
    ide: row.ide,
    messageCount: row.messageCount ?? undefined,
    organizationId: row.organizationId || undefined,
    organizationLogin: row.organizationLogin || undefined,
    organizationAvatarUrl: row.organizationAvatarUrl || undefined,
    repositoryId: row.repositoryId || undefined,
    repositoryFullName: row.repositoryFullName || undefined,
    repositoryOwner: row.repositoryOwner || undefined,
    repositoryName: row.repositoryName || undefined,
    commitSha: row.commitSha || undefined,
    artifactFormat: row.artifactFormat || undefined,
  };
}

function normalizeThreadFilters(
  filters: ThreadGroupFilters,
): NormalizedThreadGroupFilters {
  return {
    orgId: normalizeOptionalParam(filters.orgId),
    repoId: normalizeOptionalParam(filters.repoId),
    cursor: normalizeOptionalParam(filters.cursor),
  };
}

function normalizeOptionalParam(value?: string): string | undefined {
  return value?.trim() || undefined;
}

function getDayBoundaries(now = new Date()): {
  todayStart: Date;
  tomorrowStart: Date;
  yesterdayStart: Date;
} {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  return { todayStart, tomorrowStart, yesterdayStart };
}

function encodeThreadCursor(row: ThreadDbRow): string {
  return Buffer.from(
    JSON.stringify({
      rowId: row.rowId,
      updatedAt: new Date(row.updatedAt).toISOString(),
    }),
    "utf-8",
  ).toString("base64url");
}

function decodeThreadCursor(
  value?: string,
): { rowId: string; updatedAt: string } | null {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(
      Buffer.from(value, "base64url").toString("utf-8"),
    ) as unknown;

    if (
      typeof parsedValue === "object" &&
      parsedValue !== null &&
      "rowId" in parsedValue &&
      "updatedAt" in parsedValue &&
      typeof parsedValue.rowId === "string" &&
      typeof parsedValue.updatedAt === "string"
    ) {
      return {
        rowId: parsedValue.rowId,
        updatedAt: parsedValue.updatedAt,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function deleteThreadIndexRow(input: {
  publicId: string;
  ownerGithubUserId: string;
}): Promise<void> {
  await db.query(
    'DELETE FROM "threads" WHERE "publicId" = $1 AND "ownerGithubUserId" = $2',
    [input.publicId, input.ownerGithubUserId],
  );
}

async function updateThreadIndexTitle(input: {
  publicId: string;
  ownerGithubUserId: string;
  title: string;
}): Promise<void> {
  await db.query(
    'UPDATE "threads" SET title = $1, "lastSeenAt" = NOW() WHERE "publicId" = $2 AND "ownerGithubUserId" = $3',
    [input.title, input.publicId, input.ownerGithubUserId],
  );
}

export type DeleteThreadResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export type UpdateThreadTitleResult =
  | { ok: true; title: string }
  | { ok: false; error: string };

export async function deleteOwnedThread(
  publicId: string,
): Promise<DeleteThreadResult> {
  const account = await getGithubAccount();
  if (!account) {
    return { ok: false, error: "Sign in with GitHub to delete this thread." };
  }

  let locator;
  try {
    locator = parseThreadLocator(publicId);
  } catch {
    return { ok: false, error: "Invalid thread id." };
  }

  try {
    if (locator.source === "gist") {
      const { gist } = await fetchGist(locator.sourceId);
      if (!gist) {
        return { ok: false, error: "Thread not found." };
      }

      if (String(gist.owner.id) !== account.accountId) {
        return {
          ok: false,
          error: "Only the thread owner can delete this gist.",
        };
      }

      await gistThreadSourceProvider.deleteThread(
        account.accessToken,
        locator.sourceId,
      );
      await deleteThreadIndexRow({
        publicId,
        ownerGithubUserId: account.accountId,
      });

      revalidatePath("/threads");
      revalidatePath(`/threads/${publicId}`);

      return { ok: true, redirectTo: "/threads" };
    }

    const s3Source = getStructuredS3ThreadMetadata(locator.sourceId);
    if (!s3Source) {
      return { ok: false, error: "Invalid S3 thread id." };
    }

    if (s3Source.ownerId !== account.accountId) {
      return {
        ok: false,
        error: "Only the thread owner can delete this S3 thread.",
      };
    }

    await s3ThreadSourceProvider.deleteThread(locator.sourceId);
    await deleteThreadIndexRow({
      publicId,
      ownerGithubUserId: account.accountId,
    });

    revalidatePath("/threads");
    revalidatePath(`/threads/${publicId}`);

    return {
      ok: true,
      redirectTo: `/threads?orgId=${encodeURIComponent(s3Source.orgId)}`,
    };
  } catch (error) {
    console.error("Failed to delete thread", {
      publicId,
      source: locator.source,
      error,
    });
    return {
      ok: false,
      error: "Unable to delete this thread right now.",
    };
  }
}

export async function updateOwnedThreadTitle(
  publicId: string,
  nextTitle: string,
): Promise<UpdateThreadTitleResult> {
  const account = await getGithubAccount();
  if (!account) {
    return {
      ok: false,
      error: "Sign in with GitHub to update this thread title.",
    };
  }

  const title = nextTitle.trim();
  if (!title) {
    return { ok: false, error: "Thread title cannot be empty." };
  }

  let locator;
  try {
    locator = parseThreadLocator(publicId);
  } catch {
    return { ok: false, error: "Invalid thread id." };
  }

  try {
    if (locator.source === "gist") {
      const { gist } = await fetchGist(locator.sourceId);
      if (!gist) {
        return { ok: false, error: "Thread not found." };
      }

      if (String(gist.owner.id) !== account.accountId) {
        return {
          ok: false,
          error: "Only the thread owner can update this gist title.",
        };
      }

      await gistThreadSourceProvider.updateTitle(
        account.accessToken,
        locator.sourceId,
        title,
      );
    } else {
      const s3Source = getStructuredS3ThreadMetadata(locator.sourceId);
      if (!s3Source) {
        return { ok: false, error: "Invalid S3 thread id." };
      }

      if (s3Source.ownerId !== account.accountId) {
        return {
          ok: false,
          error: "Only the thread owner can update this S3 title.",
        };
      }

      await s3ThreadSourceProvider.updateTitle(locator.sourceId, title);
    }

    await updateThreadIndexTitle({
      publicId,
      ownerGithubUserId: account.accountId,
      title,
    });

    revalidatePath("/threads");
    revalidatePath(`/threads/${publicId}`);

    return { ok: true, title };
  } catch (error) {
    console.error("Failed to update thread title", {
      publicId,
      source: locator.source,
      error,
    });
    return {
      ok: false,
      error: "Unable to update this thread title right now.",
    };
  }
}

function getStructuredS3ThreadMetadata(sourceId: string): {
  orgId: string;
  ownerId: string;
} | null {
  const [orgId, ownerId] = sourceId.trim().split("/").filter(Boolean);

  if (!orgId || !ownerId) {
    return null;
  }

  return { orgId, ownerId };
}
