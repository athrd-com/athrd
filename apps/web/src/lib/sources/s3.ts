import { env } from "@/env";
import { createS3ThreadListEntry, type ThreadListEntry } from "../thread-list";
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
  }) => {
    file(path: string): {
      exists(): Promise<boolean>;
      text(): Promise<string>;
    };
    list(options: { prefix?: string; cursor?: string }): Promise<{
      contents?: Array<{
        key?: string;
        lastModified?: Date | string;
      }>;
      cursor?: string;
      hasMore?: boolean;
    }>;
  };
};

type BunS3ClientLike = InstanceType<BunRuntimeLike["S3Client"]>;

export class S3ThreadSourceProvider implements ThreadSourceProvider {
  private client: BunS3ClientLike | null = null;

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

    const objectKey = await this.resolveObjectKey(locator.sourceId, client);
    if (!objectKey) {
      return null;
    }

    const file = client.file(objectKey);
    const exists = await file.exists();

    if (!exists) {
      return null;
    }

    const content = await file.text();

    return {
      id: locator.publicId,
      source: "s3",
      sourceId: objectKey,
      filename: getFileNameFromObjectKey(objectKey),
      content,
    };
  }

  async listThreads(
    orgId: string,
    ownerId: string,
  ): Promise<ThreadListEntry[]> {
    if (!orgId.trim() || !ownerId.trim()) {
      return [];
    }

    const client = this.getClient();
    if (!client) {
      return [];
    }

    const normalizedOrgId = orgId.trim();
    const objectKeys = await listAllObjectKeys(
      client,
      `${normalizedOrgId}/${ownerId.trim()}/`,
    );
    const records = await Promise.all(
      objectKeys.map(async (object) => {
        const file = client.file(object.key);
        const content = await file.text();

        return createS3ThreadListEntry({
          sourceId: object.key,
          content,
          lastModified: object.lastModified,
        });
      }),
    );

    return records.sort(compareThreadEntriesByDate);
  }

  private getClient() {
    const BunRuntime = getBunRuntime();

    if (!BunRuntime?.S3Client) {
      return null;
    }

    if (!this.client) {
      this.client = this.createClient(BunRuntime);
    }

    return this.client;
  }

  private createClient(BunRuntime: BunRuntimeLike) {
    return new BunRuntime.S3Client({
      region: env.ATHRD_THREADS_S3_REGION,
      bucket: env.ATHRD_THREADS_S3_BUCKET,
      accessKeyId: env.ATHRD_THREADS_S3_ACCESS_KEY_ID,
      secretAccessKey: env.ATHRD_THREADS_S3_SECRET_ACCESS_KEY,
      endpoint: env.ATHRD_THREADS_S3_ENDPOINT || undefined,
      virtualHostedStyle: env.ATHRD_THREADS_S3_VIRTUAL_HOSTED_STYLE,
    });
  }

  private async resolveObjectKey(
    sourceId: string,
    client: BunS3ClientLike,
  ): Promise<string | null> {
    if (sourceId.includes("/")) {
      return sourceId;
    }

    const filename = sourceId.endsWith(".json") ? sourceId : `${sourceId}.json`;
    const objectKeys = await listAllObjectKeys(client);
    const match = objectKeys.find((object) =>
      object.key.endsWith(`/${filename}`),
    );

    return match?.key || null;
  }
}

function getFileNameFromObjectKey(objectKey: string): string {
  const parts = objectKey.split("/").filter(Boolean);
  return parts[parts.length - 1] || objectKey;
}

function getBunRuntime(): BunRuntimeLike | undefined {
  const runtime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike })
    .Bun;
  return runtime;
}

async function listAllObjectKeys(
  client: BunS3ClientLike,
  prefix?: string,
): Promise<Array<{ key: string; lastModified?: Date | string }>> {
  const objects: Array<{ key: string; lastModified?: Date | string }> = [];
  let cursor: string | undefined;

  do {
    const response = await client.list({
      ...(prefix ? { prefix } : {}),
      ...(cursor ? { cursor } : {}),
    });

    for (const object of response.contents || []) {
      if (!object.key || !object.key.endsWith(".json")) {
        continue;
      }

      objects.push({
        key: object.key,
        lastModified: object.lastModified,
      });
    }

    cursor = response.hasMore ? response.cursor : undefined;
  } while (cursor);

  return objects;
}

function compareThreadEntriesByDate(a: ThreadListEntry, b: ThreadListEntry) {
  return (
    getComparableDate(b.updatedAt ?? b.createdAt) -
    getComparableDate(a.updatedAt ?? a.createdAt)
  );
}

function getComparableDate(value: string | number | undefined): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Date.parse(value);
    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }

  return 0;
}
