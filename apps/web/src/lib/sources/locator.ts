import {
  ThreadSourceLookupError,
  type ThreadLocator,
} from "./types";

export function parseThreadLocator(id: string): ThreadLocator {
  const publicId = id.trim();

  if (!publicId) {
    throw new ThreadSourceLookupError("Thread id is required");
  }

  if (publicId.startsWith("S-")) {
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
