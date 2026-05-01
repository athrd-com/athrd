import { env } from "~/env";
import { db } from "~/server/db";

export type OrganizationStorageProvider = "gist" | "s3";

export interface S3StorageConfig {
  endpointUrl?: string;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  virtualHostedStyle?: boolean;
}

export interface OrganizationStorageConfig {
  provider: OrganizationStorageProvider;
  s3: S3StorageConfig;
}

export interface OrganizationStorageRow {
  storageProvider: string;
  s3EndpointUrl: string | null;
  s3Bucket: string | null;
  s3Region: string | null;
  s3AccessKeyId: string | null;
  s3SecretAccessKey: string | null;
  s3VirtualHostedStyle: boolean | null;
}

export async function getOrganizationStorageConfig(
  githubOrgId: string | null | undefined,
): Promise<OrganizationStorageConfig> {
  const defaults = getDefaultS3StorageConfig();
  const normalizedGithubOrgId = githubOrgId?.trim();

  if (!normalizedGithubOrgId) {
    return { provider: "gist", s3: defaults };
  }

  const result = await db.query<OrganizationStorageRow>(
    `SELECT
      "storageProvider",
      "s3EndpointUrl",
      "s3Bucket",
      "s3Region",
      "s3AccessKeyId",
      "s3SecretAccessKey",
      "s3VirtualHostedStyle"
    FROM "organizations"
    WHERE "githubOrgId" = $1
    LIMIT 1`,
    [normalizedGithubOrgId],
  );

  return resolveOrganizationStorageConfig(result.rows[0], defaults);
}

export function resolveOrganizationStorageConfig(
  row: OrganizationStorageRow | undefined,
  defaults: S3StorageConfig,
): OrganizationStorageConfig {
  if (!row) {
    return { provider: "gist", s3: defaults };
  }

  return {
    provider: normalizeStorageProvider(row.storageProvider),
    s3: {
      endpointUrl: firstNonEmptyString(row.s3EndpointUrl, defaults.endpointUrl),
      bucket: firstNonEmptyString(row.s3Bucket, defaults.bucket),
      region: firstNonEmptyString(row.s3Region, defaults.region),
      accessKeyId: firstNonEmptyString(row.s3AccessKeyId, defaults.accessKeyId),
      secretAccessKey: firstNonEmptyString(
        row.s3SecretAccessKey,
        defaults.secretAccessKey,
      ),
      virtualHostedStyle:
        row.s3VirtualHostedStyle ?? defaults.virtualHostedStyle,
    },
  };
}

function getDefaultS3StorageConfig(): S3StorageConfig {
  return {
    endpointUrl: env.ATHRD_THREADS_S3_ENDPOINT,
    bucket: env.ATHRD_THREADS_S3_BUCKET,
    region: env.ATHRD_THREADS_S3_REGION,
    accessKeyId: env.ATHRD_THREADS_S3_ACCESS_KEY_ID,
    secretAccessKey: env.ATHRD_THREADS_S3_SECRET_ACCESS_KEY,
    virtualHostedStyle: env.ATHRD_THREADS_S3_VIRTUAL_HOSTED_STYLE,
  };
}

function normalizeStorageProvider(value: string): OrganizationStorageProvider {
  return value === "s3" ? "s3" : "gist";
}

function firstNonEmptyString(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      return trimmedValue;
    }
  }

  return undefined;
}
