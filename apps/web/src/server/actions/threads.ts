"use server";

import { GistThreadSourceProvider } from "@/lib/sources/gist";
import { headers } from "next/headers";
import { S3ThreadSourceProvider } from "~/lib/sources/s3";
import type { ThreadListPage } from "~/lib/thread-list";
import { auth } from "~/server/better-auth/config";
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
