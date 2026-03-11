"use server";

import { GistThreadSourceProvider } from "@/lib/sources/gist";
import { parseS3SourceId } from "@/lib/sources/locator";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { S3ThreadSourceProvider } from "~/lib/sources/s3";
import { parseThreadLocator } from "~/lib/thread-source";
import type { ThreadListPage } from "~/lib/thread-list";
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

export async function getUserThreads(
  orgId?: string,
  cursor?: string,
): Promise<ThreadListPage> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { items: [] };
  }

  const result = await db.query<Account>(
    'SELECT id, "userId", "providerId", "accountId", "accessToken" FROM account WHERE "userId" = $1 AND "providerId" = \'github\' LIMIT 1',
    [session.user.id],
  );

  const account = result.rows[0];
  if (!account) {
    return { items: [] };
  }

  if (orgId) {
    if (!account.accountId) {
      return { items: [] };
    }

    return await s3ThreadSourceProvider.listThreads(orgId, account.accountId, {
      cursor,
      limit: THREADS_PAGE_SIZE,
    });
  }

  if (!account.accessToken) {
    return { items: [] };
  }

  return await gistThreadSourceProvider.listThreads(account.accessToken, {
    cursor,
    limit: THREADS_PAGE_SIZE,
  });
}

export type DeleteThreadResult =
  | { ok: true; redirectTo: string }
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

      revalidatePath("/threads");
      revalidatePath(`/threads/${publicId}`);

      return { ok: true, redirectTo: "/threads" };
    }

    const s3Source = parseS3SourceId(locator.sourceId);
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
