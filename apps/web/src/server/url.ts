import { env } from "~/env";

export function getAppBaseUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_ATHRD_URL?.trim() || env.BETTER_AUTH_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return "https://www.athrd.com";
}
