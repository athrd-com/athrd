import { createS3ThreadListEntry, type ThreadListPage } from "../thread-list";
import {
  getOrganizationStorageConfig,
  type S3StorageConfig,
} from "~/server/organization-storage";
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
  private clients = new Map<string, BunS3ClientLike>();

  async readThread(locator: ThreadLocator): Promise<ThreadSourceRecord | null> {
    const storageConfig = await this.getStorageConfig(locator.sourceId);
    if (!isS3StorageConfigured(storageConfig)) {
      return null;
    }

    const client = this.getClient(storageConfig);
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

    const storageConfig = await this.getStorageConfig(orgId);
    if (!isS3StorageConfigured(storageConfig)) {
      return { items: [] };
    }

    const client = this.getClient(storageConfig);
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
    const storageConfig = await this.getStorageConfig(sourceId);
    if (!isS3StorageConfigured(storageConfig)) {
      throw new Error("S3 storage is not configured");
    }

    const client = this.getClient(storageConfig);
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
    const storageConfig = await this.getStorageConfig(sourceId);
    if (!isS3StorageConfigured(storageConfig)) {
      throw new Error("S3 storage is not configured");
    }

    const client = this.getClient(storageConfig);
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

  private async getStorageConfig(sourceIdOrOrgId: string): Promise<S3StorageConfig> {
    const orgId = getOrgIdFromSourceId(sourceIdOrOrgId);
    const storage = await getOrganizationStorageConfig(orgId);
    return storage.s3;
  }

  private getClient(config: S3StorageConfig) {
    const BunRuntime = getBunRuntime();

    if (!BunRuntime?.S3Client) {
      return null;
    }

    const clientKey = getS3ClientKey(config);
    const existingClient = this.clients.get(clientKey);
    if (existingClient) {
      return existingClient;
    }

    const client = this.createClient(BunRuntime, config);
    this.clients.set(clientKey, client);
    return client;
  }

  private createClient(BunRuntime: BunRuntimeLike, config: S3StorageConfig) {
    return new BunRuntime.S3Client({
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpointUrl || undefined,
      virtualHostedStyle: config.virtualHostedStyle,
    });
  }

  private async resolveObjectKey(
    sourceId: string,
    client: BunS3ClientLike,
  ): Promise<string | null> {
    if (sourceId.includes("/")) {
      return sourceId;
    }

    const filename = sourceId.match(/\.jsonl?$/i) ? sourceId : `${sourceId}.json`;
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
        !isThreadArtifactObjectKey(object.key) ||
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
          isThreadArtifactObjectKey(object.key) &&
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

function isThreadArtifactObjectKey(objectKey: string): boolean {
  return /\.jsonl?$/i.test(objectKey);
}

function getOrgIdFromSourceId(sourceIdOrOrgId: string): string | undefined {
  return sourceIdOrOrgId.trim().split("/").filter(Boolean)[0];
}

function isS3StorageConfigured(config: S3StorageConfig): boolean {
  return Boolean(
    config.bucket &&
      config.region &&
      config.accessKeyId &&
      config.secretAccessKey,
  );
}

function getS3ClientKey(config: S3StorageConfig): string {
  return JSON.stringify({
    endpointUrl: config.endpointUrl || "",
    bucket: config.bucket || "",
    region: config.region || "",
    accessKeyId: config.accessKeyId || "",
    virtualHostedStyle: config.virtualHostedStyle ?? null,
  });
}
