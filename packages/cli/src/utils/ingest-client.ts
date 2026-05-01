import { config } from "../config.js";
import type {
  AthrdMetadata,
  AthrdMetadataArtifact,
} from "./athrd-metadata.js";

export type IngestStorageProvider = "gist" | "s3";

export interface IngestGithubContext {
  organization?: {
    githubOrgId: string;
    login: string;
    name?: string;
    avatarUrl?: string;
  };
  repository?: {
    githubRepoId?: string;
    owner: string;
    name: string;
    fullName: string;
    htmlUrl?: string;
    defaultBranch?: string;
    private?: boolean;
  };
}

export interface IngestPlan {
  storageProvider: IngestStorageProvider;
  uploadMode: "client" | "signed-url";
}

export interface IngestResult {
  publicId: string;
  sourceId: string;
  storageProvider: IngestStorageProvider;
  url: string;
}

export interface SignedUploadResult {
  uploadUrl: string;
  expiresAt: string;
  ttlSeconds: number;
  storage: {
    provider: "s3";
    publicId: string;
    sourceId: string;
  };
}

export async function createIngestPlan(input: {
  token: string;
  metadata: AthrdMetadata;
  github?: IngestGithubContext;
}): Promise<IngestPlan> {
  return postJson("/api/ingest/plan", input.token, {
    metadata: input.metadata,
    github: input.github,
  });
}

export async function completeIngest(input: {
  token: string;
  metadata: AthrdMetadata;
  github?: IngestGithubContext;
  artifact: Pick<AthrdMetadataArtifact, "fileName" | "format">;
  storage: {
    provider: IngestStorageProvider;
    publicId: string;
    sourceId: string;
  };
}): Promise<IngestResult> {
  return postJson("/api/ingest/complete", input.token, {
    metadata: input.metadata,
    github: input.github,
    artifact: input.artifact,
    storage: input.storage,
  });
}

export async function createSignedUpload(input: {
  token: string;
  metadata: AthrdMetadata;
  github?: IngestGithubContext;
  artifact: Pick<AthrdMetadataArtifact, "fileName" | "format">;
}): Promise<SignedUploadResult> {
  return postJson("/api/ingest/upload", input.token, {
    metadata: input.metadata,
    github: input.github,
    artifact: input.artifact,
  });
}

export async function uploadToSignedUrl(input: {
  uploadUrl: string;
  content: string;
  format: "json" | "jsonl";
}): Promise<void> {
  const response = await fetch(input.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type":
        input.format === "jsonl"
          ? "application/x-ndjson; charset=utf-8"
          : "application/json; charset=utf-8",
    },
    body: input.content,
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed with HTTP ${response.status}`);
  }
}

export function getFallbackThreadUrl(publicId: string): string {
  return `${canonicalizeAthrdBaseUrl(config.web.baseUrl)}/threads/${encodeURIComponent(
    publicId,
  )}`;
}

export function canonicalizeAthrdBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" && url.hostname === "athrd.com") {
      url.hostname = "www.athrd.com";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

async function postJson<T>(
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function getErrorMessage(response: Response): Promise<string> {
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    return location
      ? `athrd ingest API redirected to ${location}. Set ATHRD_API_URL to the canonical API origin so the authorization header is not lost.`
      : `athrd ingest API returned HTTP ${response.status} redirect response`;
  }

  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Fall through to a generic status message.
  }

  return `athrd ingest API returned HTTP ${response.status}`;
}

function resolveApiUrl(path: string): string {
  return `${canonicalizeAthrdBaseUrl(config.api.baseUrl)}${path}`;
}
