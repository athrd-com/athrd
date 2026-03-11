import { createS3PublicId } from "./sources/locator";

export interface ThreadListEntry {
  id: string;
  source: "gist" | "s3";
  sourceId: string;
  title?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
}

export interface ThreadListPage {
  items: ThreadListEntry[];
  nextCursor?: string;
}

interface S3ThreadListEntryInput {
  sourceId: string;
  content?: string;
  lastModified?: string | number | Date;
}

export function createS3ThreadListEntry(
  input: S3ThreadListEntryInput,
): ThreadListEntry {
  const metadata = parseThreadListMetadata(input.content);

  return {
    id: createS3PublicId(input.sourceId),
    source: "s3",
    sourceId: input.sourceId,
    title: metadata.title || getFilenameFromObjectKey(input.sourceId),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt ?? normalizeDateValue(input.lastModified),
  };
}

function parseThreadListMetadata(content?: string): {
  title?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
} {
  if (!content) {
    return {};
  }

  try {
    const rawContent = JSON.parse(content) as Record<string, unknown>;

    return {
      title: firstNonEmptyString(
        getNestedString(rawContent, ["__athrd", "title"]),
        getNestedString(rawContent, ["metadata", "name"]),
        getString(rawContent, "title"),
        getString(rawContent, "customTitle"),
        getString(rawContent, "summary"),
      ),
      createdAt: firstDefinedValue(
        getString(rawContent, "timestamp"),
        getString(rawContent, "createdAt"),
        getString(rawContent, "created_at"),
        getNestedValue(rawContent, ["metadata", "createdAt"]),
        getString(rawContent, "startTime"),
      ),
      updatedAt: firstDefinedValue(
        getString(rawContent, "updatedAt"),
        getString(rawContent, "updated_at"),
        getString(rawContent, "lastUpdated"),
        getNestedValue(rawContent, ["metadata", "lastUpdatedAt"]),
      ),
    };
  } catch {
    return {};
  }
}

function getFilenameFromObjectKey(objectKey: string): string {
  const filename = objectKey.split("/").filter(Boolean).pop() || objectKey;
  return filename.replace(/\.json$/i, "");
}

function getString(
  input: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNestedString(
  input: Record<string, unknown>,
  path: string[],
): string | undefined {
  const value = getNestedValue(input, path);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNestedValue(
  input: Record<string, unknown>,
  path: string[],
): string | number | undefined {
  let current: unknown = input;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return typeof current === "string" || typeof current === "number"
    ? current
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstNonEmptyString(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim());
}

function firstDefinedValue(
  ...values: Array<string | number | undefined>
): string | number | undefined {
  return values.find((value) => value !== undefined);
}

function normalizeDateValue(
  value: string | number | Date | undefined,
): string | number | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}
