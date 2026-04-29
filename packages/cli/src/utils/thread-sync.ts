import { config } from "../config.js";

export type ThreadSyncSource = "gist" | "s3";

export interface SyncThreadIndexInput {
  source: ThreadSyncSource;
  sourceId: string;
  token: string;
  baseUrl?: string;
}

export interface SyncThreadIndexResult {
  ok: true;
  publicId: string;
}

export async function syncThreadIndex(
  input: SyncThreadIndexInput,
): Promise<SyncThreadIndexResult> {
  const token = input.token.trim();
  if (!token) {
    throw new Error("GitHub token is required to sync a thread");
  }

  const response = await fetch(buildSyncUrl(input.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: input.source,
      sourceId: input.sourceId,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Thread sync failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`,
    );
  }

  const body = (await response.json()) as Partial<SyncThreadIndexResult>;
  if (body.ok !== true || typeof body.publicId !== "string") {
    throw new Error("Thread sync returned an invalid response");
  }

  return {
    ok: true,
    publicId: body.publicId,
  };
}

function buildSyncUrl(baseUrl = config.api.baseUrl): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    throw new Error("ATHRD API URL is not configured");
  }

  return new URL("/api/threads/sync", `${normalizedBaseUrl}/`).toString();
}
