import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbQueryMock, getOrganizationStorageConfigMock } = vi.hoisted(() => ({
  dbQueryMock: vi.fn(),
  getOrganizationStorageConfigMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: dbQueryMock,
  },
}));

vi.mock("~/server/organization-storage", () => ({
  getOrganizationStorageConfig: getOrganizationStorageConfigMock,
}));

const metadata = {
  schemaVersion: 1 as const,
  thread: {
    id: "session-1",
    providerSessionId: "session-1",
    source: "codex",
    title: "Add ingest flow",
    messageCount: 3,
    startedAt: "2026-04-22T14:55:26.053Z",
    updatedAt: "2026-04-22T15:18:42.331Z",
  },
  actor: {
    githubUserId: "123",
    githubUsername: "octocat",
  },
  organization: {
    githubOrgId: "456",
  },
  repository: {
    githubRepoId: "789",
  },
  commit: {
    sha: "deadbeef",
  },
};

const actor = {
  githubUserId: "123",
  githubUsername: "octocat",
};

const originalBun = (globalThis as typeof globalThis & { Bun?: unknown }).Bun;

describe("ingest", () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    getOrganizationStorageConfigMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: originalBun,
    });
  });

  it("creates a storage plan from organization settings", async () => {
    getOrganizationStorageConfigMock.mockResolvedValueOnce({
      provider: "s3",
      s3: {},
    });

    const { createIngestPlan } = await import("./ingest");

    await expect(createIngestPlan(metadata, actor)).resolves.toEqual({
      storageProvider: "s3",
      uploadMode: "signed-url",
    });
    expect(getOrganizationStorageConfigMock).toHaveBeenCalledWith("456");
  });

  it("creates a short-lived signed S3 upload URL", async () => {
    getOrganizationStorageConfigMock.mockResolvedValueOnce({
      provider: "s3",
      s3: {
        endpointUrl: "https://s3.example.com",
        bucket: "athrd-threads",
        region: "us-west-2",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        virtualHostedStyle: false,
      },
    });

    const { createSignedThreadUpload } = await import("./ingest");
    const result = await createSignedThreadUpload({
      metadata,
      artifact: {
        fileName: "athrd-session-1.jsonl",
        format: "jsonl",
      },
      actor,
    });
    const uploadUrl = new URL(result.uploadUrl);

    expect(result).toMatchObject({
      ttlSeconds: 300,
      storage: {
        provider: "s3",
        sourceId: "456/123/athrd-codex-session-1.jsonl",
      },
    });
    expect(uploadUrl.origin).toBe("https://s3.example.com");
    expect(uploadUrl.pathname).toBe(
      "/athrd-threads/456/123/athrd-codex-session-1.jsonl",
    );
    expect(uploadUrl.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(uploadUrl.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(uploadUrl.searchParams.get("X-Amz-Signature")).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(getOrganizationStorageConfigMock).toHaveBeenCalledWith("456");
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it("falls back to manual AWS v4 signing when Bun returns a non-v4 S3 URL", async () => {
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: {
        S3Client: class S3Client {
          file() {
            return {
              presign: () =>
                "https://s3.example.com/athrd-threads/456/123/athrd-codex-session-1.jsonl?AWSAccessKeyId=access-key&Expires=300&Signature=v2",
            };
          }
        },
      },
    });
    getOrganizationStorageConfigMock.mockResolvedValueOnce({
      provider: "s3",
      s3: {
        endpointUrl: "https://s3.example.com",
        bucket: "athrd-threads",
        region: "us-west-2",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        virtualHostedStyle: false,
      },
    });

    const { createSignedThreadUpload } = await import("./ingest");
    const result = await createSignedThreadUpload({
      metadata,
      artifact: {
        fileName: "athrd-session-1.jsonl",
        format: "jsonl",
      },
      actor,
    });
    const uploadUrl = new URL(result.uploadUrl);

    expect(uploadUrl.searchParams.get("X-Amz-Algorithm")).toBe(
      "AWS4-HMAC-SHA256",
    );
    expect(uploadUrl.searchParams.get("X-Amz-Credential")).toContain(
      "/us-west-2/s3/aws4_request",
    );
    expect(uploadUrl.searchParams.get("X-Amz-Signature")).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(uploadUrl.searchParams.get("AWSAccessKeyId")).toBeNull();
  });

  it("rejects metadata for a different GitHub actor", async () => {
    const { completeThreadIngest } = await import("./ingest");

    await expect(
      completeThreadIngest({
        metadata,
        artifact: {
          fileName: "athrd-session-1.jsonl",
          format: "jsonl",
        },
        storage: {
          provider: "gist",
          publicId: "gist-1",
          sourceId: "gist-1",
        },
        actor: {
          githubUserId: "999",
          githubUsername: "mallory",
        },
      }),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it("upserts org, repo, and thread rows on completion", async () => {
    const { completeThreadIngest } = await import("./ingest");

    await expect(
      completeThreadIngest({
        metadata,
        github: {
          organization: {
            githubOrgId: "456",
            login: "athrd-com",
            avatarUrl: "https://example.com/org.png",
          },
          repository: {
            githubRepoId: "789",
            owner: "athrd-com",
            name: "athrd",
            fullName: "athrd-com/athrd",
          },
        },
        artifact: {
          fileName: "athrd-session-1.jsonl",
          format: "jsonl",
        },
        storage: {
          provider: "gist",
          publicId: "gist-1",
          sourceId: "gist-1",
        },
        actor,
      }),
    ).resolves.toMatchObject({
      publicId: "gist-1",
      sourceId: "gist-1",
      storageProvider: "gist",
    });

    expect(dbQueryMock).toHaveBeenCalledTimes(3);
    expect(dbQueryMock.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining([
        "session-1",
        "session-1",
        "codex",
        "Add ingest flow",
        3,
        "123",
        "octocat",
        "456",
        "789",
        "gist-1",
        "gist",
        "gist-1",
        "athrd-session-1.jsonl",
        "jsonl",
        "2026-04-22T14:55:26.053Z",
        "2026-04-22T15:18:42.331Z",
        "deadbeef",
      ]),
    );
  });
});
