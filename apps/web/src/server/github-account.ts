import "server-only";

import { headers } from "next/headers";
import { auth } from "~/server/better-auth/config";
import { db } from "~/server/db";

interface Account {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  accessToken: string | null;
}

export interface GithubAccount extends Account {
  accessToken: string;
}

export async function getGithubAccount(): Promise<GithubAccount | null> {
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

  if (!account || !account.accessToken) {
    return null;
  }

  return account as GithubAccount;
}
