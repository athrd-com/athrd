"use server";

import { headers } from "next/headers";
import { fetchUserGists } from "~/lib/github";
import { auth } from "~/server/better-auth/config";
import { db } from "~/server/db";

interface Account {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  accessToken: string | null;
}

export async function getUserGists() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return [];
  }

  const result = await db.query<Account>(
    'SELECT * FROM account WHERE "userId" = $1 AND "providerId" = \'github\' LIMIT 1',
    [session.user.id],
  );

  const account = result.rows[0];

  if (!account || !account.accessToken) {
    return [];
  }

  return fetchUserGists(account.accessToken);
}
