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

  const accounts = (await db`
    SELECT * FROM account 
    WHERE "userId" = ${session.user.id} 
    AND "providerId" = 'github' 
    LIMIT 1
  `) as Account[];

  const account = accounts[0];

  if (!account || !account.accessToken) {
    return [];
  }

  return fetchUserGists(account.accessToken);
}
