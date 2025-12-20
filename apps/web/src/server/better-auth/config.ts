import { betterAuth } from "better-auth";

import { env } from "~/env";
import { pool } from "~/server/db";

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
      scope: ["gist"],
    },
  },
});

export type Session = typeof auth.$Infer.Session;
