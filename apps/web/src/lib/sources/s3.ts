import { env } from "@/env";
import type {
  ThreadLocator,
  ThreadSourceProvider,
  ThreadSourceRecord,
} from "./types";

type BunRuntimeLike = {
  S3Client: new (options: {
    region?: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    virtualHostedStyle?: boolean;
  }) => import("bun").S3Client;
};

export class S3ThreadSourceProvider implements ThreadSourceProvider {
  private client: import("bun").S3Client | null = null;

  async readThread(locator: ThreadLocator): Promise<ThreadSourceRecord | null> {
    const bucket = env.ATHRD_THREADS_S3_BUCKET;
    const region = env.ATHRD_THREADS_S3_REGION;
    const accessKeyId = env.ATHRD_THREADS_S3_ACCESS_KEY_ID;
    const secretAccessKey = env.ATHRD_THREADS_S3_SECRET_ACCESS_KEY;

    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
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

  private getClient(): import("bun").S3Client | null {
    const BunRuntime = getBunRuntime();

    if (!BunRuntime?.S3Client) {
      return null;
    }

    if (!this.client) {
      this.client = new BunRuntime.S3Client({
        region: env.ATHRD_THREADS_S3_REGION,
        bucket: env.ATHRD_THREADS_S3_BUCKET,
        accessKeyId: env.ATHRD_THREADS_S3_ACCESS_KEY_ID,
        secretAccessKey: env.ATHRD_THREADS_S3_SECRET_ACCESS_KEY,
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
