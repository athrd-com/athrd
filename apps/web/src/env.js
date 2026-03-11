import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		BETTER_AUTH_SECRET:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		BETTER_AUTH_URL:
			process.env.NODE_ENV === "production"
				? z.string().url()
				: z.string().url().optional(),
		BETTER_AUTH_GITHUB_CLIENT_ID: z.string(),
		BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string(),
		DATABASE_URL: z.string().url(),
		ATHRD_THREADS_S3_BUCKET:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		ATHRD_THREADS_S3_REGION:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		ATHRD_THREADS_S3_ACCESS_KEY_ID:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		ATHRD_THREADS_S3_SECRET_ACCESS_KEY:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		ATHRD_THREADS_S3_ENDPOINT: z.string().url().optional(),
		ATHRD_THREADS_S3_VIRTUAL_HOSTED_STYLE: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
		BETTER_AUTH_GITHUB_CLIENT_ID: process.env.BETTER_AUTH_GITHUB_CLIENT_ID,
		BETTER_AUTH_GITHUB_CLIENT_SECRET:
			process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
		DATABASE_URL: process.env.DATABASE_URL,
		ATHRD_THREADS_S3_BUCKET: process.env.ATHRD_THREADS_S3_BUCKET,
		ATHRD_THREADS_S3_REGION: process.env.ATHRD_THREADS_S3_REGION,
		ATHRD_THREADS_S3_ACCESS_KEY_ID:
			process.env.ATHRD_THREADS_S3_ACCESS_KEY_ID,
		ATHRD_THREADS_S3_SECRET_ACCESS_KEY:
			process.env.ATHRD_THREADS_S3_SECRET_ACCESS_KEY,
		ATHRD_THREADS_S3_ENDPOINT: process.env.ATHRD_THREADS_S3_ENDPOINT,
		ATHRD_THREADS_S3_VIRTUAL_HOSTED_STYLE:
			process.env.ATHRD_THREADS_S3_VIRTUAL_HOSTED_STYLE,
		NODE_ENV: process.env.NODE_ENV,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
