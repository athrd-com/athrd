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
): Promise<ThreadSourceRecord | null> {
  const locator = parseThreadLocator(publicId);
  const provider = providers[locator.source];
  return provider.readThread(locator);
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
