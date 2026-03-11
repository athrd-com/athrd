import { env } from "@/env";
import { fetchGist, type GistData, type GistFile } from "~/lib/github";

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
    throw new ThreadSourceLookupError(`Unsupported thread source prefix in ${publicId}`);
  }

  return {
    publicId,
    source: "gist",
    sourceId: publicId,
  };
}

export function createThreadSourceRecordFromGist(
  gist: GistData,
  file: GistFile,
  publicId = gist.id,
): ThreadSourceRecord {
  return {
    id: publicId,
    source: "gist",
    sourceId: gist.id,
    title: gist.description || undefined,
    createdAt: gist.created_at,
    updatedAt: gist.updated_at,
    owner: {
      login: gist.owner.login,
      avatarUrl: gist.owner.avatar_url,
      profileUrl: gist.owner.html_url,
    },
    filename: file.filename,
    content: file.content || "",
  };
}

class GistThreadSourceProvider implements ThreadSourceProvider {
  async readThread(locator: ThreadLocator): Promise<ThreadSourceRecord | null> {
    const { gist, file } = await fetchGist(locator.sourceId);
    if (!gist || !file) {
      return null;
    }

    return createThreadSourceRecordFromGist(gist, file, locator.publicId);
  }
}

class S3ThreadSourceProvider implements ThreadSourceProvider {
  private client: BunS3Client | null = null;

  async readThread(locator: ThreadLocator): Promise<ThreadSourceRecord | null> {
    const bucket = env.ATHRD_THREADS_S3_BUCKET;
    const region = env.ATHRD_THREADS_S3_REGION;

    if (!bucket || !region) {
      return null;
    }

    try {
      const client = this.getClient();
      if (!client) {
        return null;
      }

      const file = client.file(locator.sourceId);
      const exists = await file.exists();

      if (!exists) {
        return null;
      }

      const content = await file.text();

      return {
        id: locator.publicId,
        source: "s3",
        sourceId: locator.sourceId,
        filename: getFileNameFromObjectKey(locator.sourceId),
        content,
      };
    } catch (error) {
      throw error;
    }
  }

  private getClient(): BunS3Client | null {
    const BunRuntime = getBunRuntime();

    if (!BunRuntime?.S3Client) {
      return null;
    }

    if (!this.client) {
      this.client = new BunRuntime.S3Client({
        region: env.ATHRD_THREADS_S3_REGION,
        bucket: env.ATHRD_THREADS_S3_BUCKET,
        endpoint: env.ATHRD_THREADS_S3_ENDPOINT || undefined,
        virtualHostedStyle: env.ATHRD_THREADS_S3_VIRTUAL_HOSTED_STYLE,
      });
    }

    return this.client;
  }
}

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

function getFileNameFromObjectKey(objectKey: string): string {
  const parts = objectKey.split("/").filter(Boolean);
  return parts[parts.length - 1] || objectKey;
}

type BunS3File = {
  exists(): Promise<boolean>;
  text(): Promise<string>;
};

type BunS3Client = {
  file(path: string): BunS3File;
};

type BunRuntimeLike = {
  S3Client: new (options: {
    region?: string;
    bucket?: string;
    endpoint?: string;
    virtualHostedStyle?: boolean;
  }) => BunS3Client;
};

function getBunRuntime(): BunRuntimeLike | undefined {
  const runtime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike }).Bun;
  return runtime;
}
