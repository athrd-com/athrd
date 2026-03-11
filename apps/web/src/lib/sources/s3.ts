import { env } from "@/env";
import { createS3ThreadListEntry, type ThreadListPage } from "../thread-list";
import type {
  ThreadLocator,
  ThreadListPageOptions,
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
    write(path: string, value: string): Promise<unknown>;
    delete(path: string): Promise<void>;
    list(options: {
      prefix?: string;
      cursor?: string;
      limit?: number;
    }): Promise<{
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
    options: ThreadListPageOptions = {},
  ): Promise<ThreadListPage> {
    if (!orgId.trim() || !ownerId.trim()) {
      return { items: [] };
    }

    const client = this.getClient();
    if (!client) {
      return { items: [] };
    }

    const normalizedOrgId = orgId.trim();
    const page = await listObjectKeysPage(client, {
      prefix: `${normalizedOrgId}/${ownerId.trim()}/`,
      cursor: options.cursor,
      limit: options.limit,
    });
    const records = await Promise.all(
      page.items.map(async (object) => {
        const file = client.file(object.key);
        const content = await file.text();

        return createS3ThreadListEntry({
          sourceId: object.key,
          content,
          lastModified: object.lastModified,
        });
      }),
    );

    return {
      items: records.sort(compareThreadEntriesByDate),
      nextCursor: page.nextCursor,
    };
  }

  async deleteThread(sourceId: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      throw new Error("S3 storage is not configured");
    }

    const objectKey = await this.resolveObjectKey(sourceId, client);
    if (!objectKey) {
      throw new Error("S3 thread not found");
    }

    await client.delete(objectKey);
  }

  async updateTitle(sourceId: string, title: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      throw new Error("S3 storage is not configured");
    }

    const objectKey = await this.resolveObjectKey(sourceId, client);
    if (!objectKey) {
      throw new Error("S3 thread not found");
    }

    const file = client.file(objectKey);
    const exists = await file.exists();
    if (!exists) {
      throw new Error("S3 thread not found");
    }

    const content = await file.text();
    let rawContent: Record<string, unknown>;

    try {
      rawContent = JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      throw new Error("S3 thread does not contain valid JSON", {
        cause: error,
      });
    }

    rawContent.__athrd = mergeAthrdMetadata(rawContent.__athrd, title);

    await client.write(objectKey, `${JSON.stringify(rawContent, null, 2)}\n`);
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

function mergeAthrdMetadata(
  value: unknown,
  title: string,
): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return {
      ...(value as Record<string, unknown>),
      title,
    };
  }

  return { title };
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
      if (
        !object.key ||
        !object.key.endsWith(".json") ||
        (prefix && !object.key.startsWith(prefix))
      ) {
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

async function listObjectKeysPage(
  client: BunS3ClientLike,
  options: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  },
): Promise<{
  items: Array<{ key: string; lastModified?: Date | string }>;
  nextCursor?: string;
}> {
  const response = await client.list({
    ...(options.prefix ? { prefix: options.prefix } : {}),
    ...(options.cursor ? { cursor: options.cursor } : {}),
    ...(typeof options.limit === "number" && options.limit > 0
      ? { limit: options.limit }
      : {}),
  });

  return {
    items: (response.contents || [])
      .filter(
        (object) =>
          object.key &&
          object.key.endsWith(".json") &&
          (!options.prefix || object.key.startsWith(options.prefix)),
      )
      .map((object) => ({
        key: object.key as string,
        lastModified: object.lastModified,
      })),
    nextCursor: response.hasMore ? response.cursor : undefined,
  };
}

function compareThreadEntriesByDate(
  a: ThreadListPage["items"][number],
  b: ThreadListPage["items"][number],
) {
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
