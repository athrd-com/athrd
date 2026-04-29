import { parseJsonl } from "./bun-parsing.js";

export interface AthrdThreadMetadata {
  id: string;
  providerSessionId: string;
  source: string;
  title?: string;
  messageCount?: number;
  startedAt?: string;
  updatedAt: string;
}

export interface AthrdMetadata {
  schemaVersion: 1;
  thread: AthrdThreadMetadata;
  actor: {
    githubUserId: string;
    githubUsername: string;
    avatarUrl?: string;
  };
  organization?: {
    githubOrgId: string;
  };
  repository?: {
    githubRepoId: string;
  };
  commit?: {
    sha?: string;
    branch?: string;
  };
  [key: string]: unknown;
}

export interface AthrdMetadataArtifact {
  kind: "raw";
  format: "json" | "jsonl";
  fileName: string;
  content: string;
}

export function injectAthrdMetadata(
  artifact: AthrdMetadataArtifact,
  metadata: AthrdMetadata,
): string {
  if (artifact.format === "json") {
    return injectJsonMetadata(artifact.content, metadata);
  }

  return injectJsonlMetadata(artifact.content, metadata);
}

function injectJsonMetadata(content: string, metadata: AthrdMetadata): string {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  parsed.__athrd = metadata;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function injectJsonlMetadata(content: string, metadata: AthrdMetadata): string {
  const metadataRow = JSON.stringify({
    type: "athrd_metadata",
    __athrd: metadata,
  });
  const sourceRows = content.split(/\r?\n/).filter((line) => line.trim());
  const parsedRows = parseJsonl<{ type?: unknown }>(sourceRows.join("\n"));
  const rows = sourceRows.filter(
    (_line, index) => parsedRows[index]?.type !== "athrd_metadata",
  );

  return `${[metadataRow, ...rows].join("\n")}\n`;
}
