import {
  ThreadSourceLookupError,
  type ThreadLocator,
} from "./types";

const STRUCTURED_S3_ID_PATTERN =
  /^S-(?<orgId>[^-]+)-(?<userId>[^-]+)-(?<threadId>.+)$/;
const ENCODED_S3_ID_PREFIX = "S_";

export function parseThreadLocator(id: string): ThreadLocator {
  const publicId = id.trim();

  if (!publicId) {
    throw new ThreadSourceLookupError("Thread id is required");
  }

  if (publicId.startsWith(ENCODED_S3_ID_PREFIX)) {
    const sourceId = decodeS3SourceId(publicId.slice(ENCODED_S3_ID_PREFIX.length));
    if (!sourceId) {
      throw new ThreadSourceLookupError("S3 thread id is missing an object key");
    }

    return {
      publicId,
      source: "s3",
      sourceId,
    };
  }

  if (publicId.startsWith("S-")) {
    const structuredMatch = publicId.match(STRUCTURED_S3_ID_PATTERN);
    if (structuredMatch?.groups) {
      const { orgId, userId, threadId } = structuredMatch.groups;

      if (!orgId || !userId || !threadId) {
        throw new ThreadSourceLookupError("S3 thread id is missing an object key");
      }

      return {
        publicId,
        source: "s3",
        sourceId: `${orgId}/${userId}/${ensureThreadArtifactExtension(threadId)}`,
      };
    }

    const sourceId = publicId.slice(2);
    if (!sourceId) {
      throw new ThreadSourceLookupError("S3 thread id is missing an object key");
    }

    return {
      publicId,
      source: "s3",
      sourceId,
    };
  }

  if (/^[A-Z]+-.+/.test(publicId)) {
    throw new ThreadSourceLookupError(
      `Unsupported thread source prefix in ${publicId}`,
    );
  }

  return {
    publicId,
    source: "gist",
    sourceId: publicId,
  };
}

export function createS3PublicId(sourceId: string): string {
  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    throw new ThreadSourceLookupError("S3 thread id is missing an object key");
  }

  if (normalizedSourceId.includes("/")) {
    const parts = normalizedSourceId.split("/").filter(Boolean);
    if (parts.length >= 3) {
      const [orgId, userId, ...rest] = parts;
      const filename = rest[rest.length - 1];
      if (!filename) {
        throw new ThreadSourceLookupError("S3 thread id is missing an object key");
      }

      if (!filename.toLowerCase().endsWith(".json")) {
        return createEncodedS3PublicId(normalizedSourceId);
      }

      return `S-${orgId}-${userId}-${filename.replace(/\.json$/i, "")}`;
    }

    const filename = parts[parts.length - 1];
    if (!filename) {
      throw new ThreadSourceLookupError("S3 thread id is missing an object key");
    }

    return `S-${filename.replace(/\.json$/i, "")}`;
  }

  return normalizedSourceId.startsWith("S-") ||
    normalizedSourceId.startsWith(ENCODED_S3_ID_PREFIX)
    ? normalizedSourceId
    : `S-${normalizedSourceId.replace(/\.json$/i, "")}`;
}

function createEncodedS3PublicId(sourceId: string): string {
  return `${ENCODED_S3_ID_PREFIX}${Buffer.from(sourceId, "utf-8").toString(
    "base64url",
  )}`;
}

function decodeS3SourceId(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf-8").trim() || null;
  } catch {
    return null;
  }
}

function ensureThreadArtifactExtension(value: string): string {
  return value.match(/\.jsonl?$/i) ? value : `${value}.json`;
}
