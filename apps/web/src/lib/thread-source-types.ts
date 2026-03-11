export type ThreadSource = "gist" | "s3";

export interface ThreadLocator {
  publicId: string;
  source: ThreadSource;
  sourceId: string;
}

export interface ThreadSourceOwner {
  login: string;
  avatarUrl?: string;
  profileUrl?: string;
}

export interface ThreadSourceRecord {
  id: string;
  source: ThreadSource;
  sourceId: string;
  title?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  owner?: ThreadSourceOwner;
  filename: string;
  content: string;
}

export interface ThreadSourceProvider {
  readThread(locator: ThreadLocator): Promise<ThreadSourceRecord | null>;
}

export class ThreadSourceLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadSourceLookupError";
  }
}
