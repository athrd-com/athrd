"use server";

import { headers } from "next/headers";
import { fetchUserGists } from "~/lib/github";
import { auth } from "~/server/better-auth/config";
import { db } from "~/server/db";

export async function getUserGists() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return [];
  }

  const account = await db.account.findFirst({
    where: {
      userId: session.user.id,
      providerId: "github",
    },
  });

  if (!account || !account.accessToken) {
    return [];
  }

  return fetchUserGists(account.accessToken);
}
