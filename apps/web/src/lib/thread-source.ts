import {
  createThreadSourceRecordFromGist,
  GistThreadSourceProvider,
} from "./sources/gist";
import { createS3PublicId, parseThreadLocator } from "./sources/locator";
import {
  ThreadSourceLookupError,
  type ThreadLocator,
  type ThreadSource,
  type ThreadSourceOwner,
  type ThreadSourceProvider,
  type ThreadSourceRecord,
} from "./sources/types";
import { S3ThreadSourceProvider } from "./sources/s3";

const providers: Record<ThreadSource, ThreadSourceProvider> = {
  gist: new GistThreadSourceProvider(),
  s3: new S3ThreadSourceProvider(),
};

export async function readThreadSourceRecord(
  publicId: string,
  sourceIdOverride?: string,
): Promise<ThreadSourceRecord | null> {
  const locator = parseThreadLocator(publicId);
  const resolvedLocator =
    locator.source === "s3" && sourceIdOverride
      ? {
          ...locator,
          sourceId: sourceIdOverride,
        }
      : locator;
  const provider = providers[resolvedLocator.source];
  return provider.readThread(resolvedLocator);
}

export {
  createS3PublicId,
  createThreadSourceRecordFromGist,
  parseThreadLocator,
  ThreadSourceLookupError,
};

export type {
  ThreadLocator,
  ThreadSource,
  ThreadSourceOwner,
  ThreadSourceProvider,
  ThreadSourceRecord,
};
