import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQueryMock } = vi.hoisted(() => ({
  dbQueryMock: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: {
    ATHRD_THREADS_S3_ENDPOINT: "https://default-s3.example.com",
    ATHRD_THREADS_S3_BUCKET: "athrd-default",
    ATHRD_THREADS_S3_REGION: "us-west-2",
    ATHRD_THREADS_S3_ACCESS_KEY_ID: "default-access-key",
    ATHRD_THREADS_S3_SECRET_ACCESS_KEY: "default-secret-key",
    ATHRD_THREADS_S3_VIRTUAL_HOSTED_STYLE: false,
  },
}));

vi.mock("~/server/db", () => ({
  db: {
    query: dbQueryMock,
  },
}));

describe("organization-storage", () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
  });

  it("defaults to gist and app-level S3 settings when no org id is provided", async () => {
    const { getOrganizationStorageConfig } = await import(
      "./organization-storage"
    );

    await expect(getOrganizationStorageConfig(undefined)).resolves.toEqual({
      provider: "gist",
      s3: {
        endpointUrl: "https://default-s3.example.com",
        bucket: "athrd-default",
        region: "us-west-2",
        accessKeyId: "default-access-key",
        secretAccessKey: "default-secret-key",
        virtualHostedStyle: false,
      },
    });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it("uses org S3 values as overrides over app-level defaults", async () => {
    const { resolveOrganizationStorageConfig } = await import(
      "./organization-storage"
    );

    expect(
      resolveOrganizationStorageConfig(
        {
          storageProvider: "s3",
          s3EndpointUrl: null,
          s3Bucket: " customer-bucket ",
          s3Region: "us-east-1",
          s3AccessKeyId: null,
          s3SecretAccessKey: "customer-secret",
          s3VirtualHostedStyle: true,
        },
        {
          endpointUrl: "https://default-s3.example.com",
          bucket: "athrd-default",
          region: "us-west-2",
          accessKeyId: "default-access-key",
          secretAccessKey: "default-secret-key",
          virtualHostedStyle: false,
        },
      ),
    ).toEqual({
      provider: "s3",
      s3: {
        endpointUrl: "https://default-s3.example.com",
        bucket: "customer-bucket",
        region: "us-east-1",
        accessKeyId: "default-access-key",
        secretAccessKey: "customer-secret",
        virtualHostedStyle: true,
      },
    });
  });

  it("loads the matching organization row by GitHub org id", async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          storageProvider: "s3",
          s3EndpointUrl: "https://customer-s3.example.com",
          s3Bucket: "customer-bucket",
          s3Region: null,
          s3AccessKeyId: null,
          s3SecretAccessKey: null,
          s3VirtualHostedStyle: null,
        },
      ],
    });

    const { getOrganizationStorageConfig } = await import(
      "./organization-storage"
    );

    await expect(getOrganizationStorageConfig(" 456 ")).resolves.toMatchObject({
      provider: "s3",
      s3: {
        endpointUrl: "https://customer-s3.example.com",
        bucket: "customer-bucket",
        region: "us-west-2",
      },
    });
    expect(dbQueryMock).toHaveBeenCalledWith(expect.any(String), ["456"]);
  });
});
