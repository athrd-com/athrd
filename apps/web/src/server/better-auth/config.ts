import { betterAuth } from "better-auth";

import { env } from "~/env";
import { pool } from "~/server/db";

function normalizeBaseUrl(url: string) {
  const trimmedUrl = url.trim().replace(/\/+$/, "");

  if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
    return trimmedUrl;
  }

  return `https://${trimmedUrl}`;
}

function resolveBaseUrl() {
  if (env.BETTER_AUTH_URL) {
    return normalizeBaseUrl(env.BETTER_AUTH_URL);
  }

  if (env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return undefined;
}

export const auth = betterAuth({
  baseURL: resolveBaseUrl(),
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
      scope: ["gist", "user:email"],
    },
  },
});

export type Session = typeof auth.$Infer.Session;
