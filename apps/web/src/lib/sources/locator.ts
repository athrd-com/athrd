import {
  ThreadSourceLookupError,
  type ThreadLocator,
} from "./types";

const STRUCTURED_S3_ID_PATTERN =
  /^S-(?<orgId>[^-]+)-(?<userId>[^-]+)-(?<threadId>[A-Za-z0-9]+)$/;

export function parseThreadLocator(id: string): ThreadLocator {
  const publicId = id.trim();

  if (!publicId) {
    throw new ThreadSourceLookupError("Thread id is required");
  }

  if (publicId.startsWith("S-")) {
    const structuredMatch = publicId.match(STRUCTURED_S3_ID_PATTERN);
    if (structuredMatch?.groups) {
      const { orgId, userId, threadId } = structuredMatch.groups;

      return {
        publicId,
        source: "s3",
        sourceId: `${orgId}/${userId}/${threadId}.json`,
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

      return `S-${orgId}-${userId}-${filename.replace(/\.json$/i, "")}`;
    }

    const filename = parts[parts.length - 1];
    if (!filename) {
      throw new ThreadSourceLookupError("S3 thread id is missing an object key");
    }

    return `S-${filename.replace(/\.json$/i, "")}`;
  }

  return normalizedSourceId.startsWith("S-")
    ? normalizedSourceId
    : `S-${normalizedSourceId.replace(/\.json$/i, "")}`;
}

export function parseS3SourceId(sourceId: string): {
  orgId: string;
  ownerId: string;
  filename: string;
} | null {
  const parts = sourceId.trim().split("/").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const [orgId, ownerId, ...rest] = parts;
  const filename = rest[rest.length - 1];

  if (!orgId || !ownerId || !filename) {
    return null;
  }

  return {
    orgId,
    ownerId,
    filename,
  };
}
