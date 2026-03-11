"use server";

import { GistThreadSourceProvider } from "@/lib/sources/gist";
import { headers } from "next/headers";
import { S3ThreadSourceProvider } from "~/lib/sources/s3";
import type { ThreadListEntry } from "~/lib/thread-list";
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

export async function getUserThreads(
  orgId?: string,
): Promise<ThreadListEntry[]> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return [];
  }

  const result = await db.query<Account>(
    'SELECT id, "userId", "providerId", "accountId", "accessToken" FROM account WHERE "userId" = $1 AND "providerId" = \'github\' LIMIT 1',
    [session.user.id],
  );

  const account = result.rows[0];
  if (!account) {
    return [];
  }

  if (orgId) {
    if (!account.accountId) {
      return [];
    }

    return await s3ThreadSourceProvider.listThreads(orgId, account.accountId);
  }

  if (!account.accessToken) {
    return [];
  }

  return await gistThreadSourceProvider.listThreads(account.accessToken);
}
