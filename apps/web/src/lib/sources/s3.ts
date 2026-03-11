import { env } from "@/env";
import type {
  ThreadLocator,
  ThreadSourceProvider,
  ThreadSourceRecord,
} from "./types";

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

export class S3ThreadSourceProvider implements ThreadSourceProvider {
  private client: BunS3Client | null = null;

  async readThread(locator: ThreadLocator): Promise<ThreadSourceRecord | null> {
    const bucket = env.ATHRD_THREADS_S3_BUCKET;
    const region = env.ATHRD_THREADS_S3_REGION;

    if (!bucket || !region) {
      return null;
    }

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

function getFileNameFromObjectKey(objectKey: string): string {
  const parts = objectKey.split("/").filter(Boolean);
  return parts[parts.length - 1] || objectKey;
}

function getBunRuntime(): BunRuntimeLike | undefined {
  const runtime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike }).Bun;
  return runtime;
}
