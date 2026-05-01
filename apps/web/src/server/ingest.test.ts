import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbQueryMock,
  getOrganizationStorageConfigMock,
  getOrganizationBillingStateMock,
} = vi.hoisted(() => ({
  dbQueryMock: vi.fn(),
  getOrganizationStorageConfigMock: vi.fn(),
  getOrganizationBillingStateMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: dbQueryMock,
  },
}));

vi.mock("~/server/organization-storage", () => ({
  getOrganizationStorageConfig: getOrganizationStorageConfigMock,
}));

vi.mock("~/server/organization-billing", () => ({
  getOrganizationBillingState: getOrganizationBillingStateMock,
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
    getOrganizationBillingStateMock.mockReset();
    getOrganizationBillingStateMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: originalBun,
    });
  });

  it("caches successful GitHub token validation briefly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 123,
        login: "octocat",
        avatar_url: "https://example.com/octocat.png",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { authenticateGithubRequest } = await import("./ingest");
    const first = await authenticateGithubRequest(
      githubAuthRequest("cached-token"),
    );
    const second = await authenticateGithubRequest(
      githubAuthRequest("cached-token"),
    );

    expect(first).toEqual({
      githubUserId: "123",
      githubUsername: "octocat",
      avatarUrl: "https://example.com/octocat.png",
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.github.com/user");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer cached-token",
      },
      cache: "no-store",
    });
  });

  it("revalidates GitHub tokens after the auth cache expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T15:00:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 123, login: "octocat" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 456, login: "monalisa" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { authenticateGithubRequest } = await import("./ingest");

    await expect(
      authenticateGithubRequest(githubAuthRequest("expiring-token")),
    ).resolves.toMatchObject({
      githubUserId: "123",
      githubUsername: "octocat",
    });

    vi.advanceTimersByTime(60_001);

    await expect(
      authenticateGithubRequest(githubAuthRequest("expiring-token")),
    ).resolves.toMatchObject({
      githubUserId: "456",
      githubUsername: "monalisa",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed GitHub token validation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 123, login: "octocat" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { authenticateGithubRequest } = await import("./ingest");

    await expect(
      authenticateGithubRequest(githubAuthRequest("retry-token")),
    ).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      authenticateGithubRequest(githubAuthRequest("retry-token")),
    ).resolves.toMatchObject({
      githubUserId: "123",
      githubUsername: "octocat",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("authenticates signed CLI ingest tokens without calling GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { authenticateIngestRequest, createCliAccessToken } = await import(
      "./ingest"
    );
    const exchange = createCliAccessToken({
      ...actor,
      avatarUrl: "https://example.com/octocat.png",
    });

    await expect(
      authenticateIngestRequest(githubAuthRequest(exchange.token)),
    ).resolves.toEqual({
      ...actor,
      avatarUrl: "https://example.com/octocat.png",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid signed CLI ingest tokens without GitHub fallback", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { authenticateIngestRequest, createCliAccessToken } = await import(
      "./ingest"
    );
    const exchange = createCliAccessToken(actor);

    await expect(
      authenticateIngestRequest(githubAuthRequest(`${exchange.token}.tampered`)),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("forces S3 storage for paid organizations with a GitHub App installation", async () => {
    getOrganizationBillingStateMock.mockResolvedValueOnce({
      orgReadyForAcl: true,
      setupIncomplete: false,
    });
    getOrganizationStorageConfigMock.mockResolvedValueOnce({
      provider: "gist",
      s3: {},
    });

    const { createIngestPlan } = await import("./ingest");

    await expect(createIngestPlan(metadata, actor)).resolves.toEqual({
      storageProvider: "s3",
      uploadMode: "signed-url",
    });
  });

  it("rejects paid organizations before GitHub App setup is complete", async () => {
    getOrganizationBillingStateMock.mockResolvedValueOnce({
      orgReadyForAcl: false,
      setupIncomplete: true,
    });

    const { createIngestPlan } = await import("./ingest");

    await expect(createIngestPlan(metadata, actor)).rejects.toMatchObject({
      status: 409,
      message:
        "Organization billing is active but GitHub App installation is incomplete.",
    });
    expect(getOrganizationStorageConfigMock).not.toHaveBeenCalled();
  });

  it("creates a storage plan from a known organization repository owner", async () => {
    const slugMetadata = createSlugRepositoryMetadata();
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          githubOrgId: "456",
          login: "athrd-com",
          name: "athrd",
          avatarUrl: "https://example.com/org.png",
        },
      ],
    });
    getOrganizationStorageConfigMock.mockResolvedValueOnce({
      provider: "s3",
      s3: {},
    });

    const { createIngestPlan } = await import("./ingest");

    await expect(
      createIngestPlan(slugMetadata, actor, {
        repository: {
          owner: "athrd-com",
          name: "athrd",
          fullName: "athrd-com/athrd",
        },
      }),
    ).resolves.toEqual({
      storageProvider: "s3",
      uploadMode: "signed-url",
    });
    expect(dbQueryMock).toHaveBeenCalledWith(expect.any(String), ["athrd-com"]);
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

  it("rejects Gist completion for paid organization threads", async () => {
    getOrganizationBillingStateMock.mockResolvedValueOnce({
      orgReadyForAcl: true,
      setupIncomplete: false,
    });
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
        actor,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Paid organization threads must use managed S3 storage.",
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

  it("indexes slug-only repository metadata without GitHub repo lookups", async () => {
    const slugMetadata = createSlugRepositoryMetadata();
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    const { completeThreadIngest } = await import("./ingest");

    await expect(
      completeThreadIngest({
        metadata: slugMetadata,
        github: {
          repository: {
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
      storageProvider: "gist",
    });

    expect(dbQueryMock).toHaveBeenCalledTimes(3);
    expect(dbQueryMock.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([
        "slug:athrd-com/athrd",
        "athrd-com",
        "athrd",
        "athrd-com/athrd",
      ]),
    );
    expect(dbQueryMock.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining(["slug:athrd-com/athrd"]),
    );
  });
});

function githubAuthRequest(token: string): Request {
  return new Request("http://localhost/api/ingest/plan", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function createSlugRepositoryMetadata() {
  const {
    organization: _organization,
    repository: _repository,
    ...base
  } = metadata;

  return {
    ...base,
    repository: {
      owner: "athrd-com",
      name: "athrd",
      fullName: "athrd-com/athrd",
    },
  };
}
