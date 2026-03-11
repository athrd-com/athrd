import {
  ThreadSourceLookupError,
  type ThreadLocator,
} from "./types";

const ENCODED_S3_SOURCE_ID_PREFIX = "~";

export function parseThreadLocator(id: string): ThreadLocator {
  const publicId = id.trim();

  if (!publicId) {
    throw new ThreadSourceLookupError("Thread id is required");
  }

  if (publicId.startsWith("S-")) {
    const encodedSourceId = publicId.slice(2);
    const sourceId = decodeS3SourceId(encodedSourceId);
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
    const filename = normalizedSourceId.split("/").filter(Boolean).pop();
    if (!filename) {
      throw new ThreadSourceLookupError("S3 thread id is missing an object key");
    }

    return `S-${filename.replace(/\.json$/i, "")}`;
  }

  return normalizedSourceId.startsWith("S-")
    ? normalizedSourceId
    : `S-${normalizedSourceId.replace(/\.json$/i, "")}`;
}

function decodeS3SourceId(sourceId: string): string {
  if (!sourceId) {
    return "";
  }

  if (!sourceId.startsWith(ENCODED_S3_SOURCE_ID_PREFIX)) {
    return sourceId;
  }

  const encodedValue = sourceId.slice(ENCODED_S3_SOURCE_ID_PREFIX.length);
  if (!encodedValue) {
    throw new ThreadSourceLookupError("S3 thread id is invalid");
  }

  try {
    return Buffer.from(encodedValue, "base64url").toString("utf-8");
  } catch (error) {
    throw new ThreadSourceLookupError("S3 thread id is invalid");
  }
}
