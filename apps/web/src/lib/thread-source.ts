import {
  createThreadSourceRecordFromGist,
  GistThreadSourceProvider,
} from "./gist-thread-source";
import { parseThreadLocator } from "./thread-source-locator";
import {
  ThreadSourceLookupError,
  type ThreadLocator,
  type ThreadSource,
  type ThreadSourceOwner,
  type ThreadSourceProvider,
  type ThreadSourceRecord,
} from "./thread-source-types";
import { S3ThreadSourceProvider } from "./s3-thread-source";

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
