import { beforeEach, describe, expect, it, vi } from "vitest";
import { S3ThreadSourceProvider } from "./s3";

vi.mock("@/env", () => ({
  env: {
    ATHRD_THREADS_S3_BUCKET: "athrd-threads",
    ATHRD_THREADS_S3_REGION: "us-west-2",
    ATHRD_THREADS_S3_ACCESS_KEY_ID: "filebase-key",
    ATHRD_THREADS_S3_SECRET_ACCESS_KEY: "filebase-secret",
    ATHRD_THREADS_S3_ENDPOINT: undefined,
    ATHRD_THREADS_S3_VIRTUAL_HOSTED_STYLE: false,
  },
}));

vi.mock("~/server/organization-storage", () => ({
  getOrganizationStorageConfig: vi.fn().mockResolvedValue({
    provider: "s3",
    s3: {
      bucket: "athrd-threads",
      region: "us-west-2",
      accessKeyId: "filebase-key",
      secretAccessKey: "filebase-secret",
      endpointUrl: undefined,
      virtualHostedStyle: false,
    },
  }),
}));

const existsMock = vi.fn();
const textMock = vi.fn();
const deleteMock = vi.fn();
const writeMock = vi.fn();
const listMock = vi.fn();
const fileMock = vi.fn(() => ({
  exists: existsMock,
  text: textMock,
}));

describe("sources/s3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockReset();
    textMock.mockReset();
    deleteMock.mockReset();
    writeMock.mockReset();
    listMock.mockReset();
    fileMock.mockClear();
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: {
      S3Client: class S3Client {
        delete = deleteMock;
        file = fileMock;
        list = listMock;
        write = writeMock;
      },
      },
    });
  });

  it("loads S3-backed thread records", async () => {
    existsMock.mockResolvedValueOnce(true);
    textMock.mockResolvedValueOnce('{"title":"S3 thread"}');

    const provider = new S3ThreadSourceProvider();

    await expect(
      provider.readThread({
        publicId: "S-threads/demo.json",
        source: "s3",
        sourceId: "threads/demo.json",
      }),
    ).resolves.toMatchObject({
      source: "s3",
      id: "S-threads/demo.json",
      sourceId: "threads/demo.json",
      filename: "demo.json",
      content: '{"title":"S3 thread"}',
    });
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns null for missing S3 objects", async () => {
    existsMock.mockResolvedValueOnce(false);

    const provider = new S3ThreadSourceProvider();

    await expect(
      provider.readThread({
        publicId: "S-threads/missing.json",
        source: "s3",
        sourceId: "threads/missing.json",
      }),
    ).resolves.toBeNull();
  });

  it("returns null when Bun S3 is unavailable", async () => {
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const provider = new S3ThreadSourceProvider();

    await expect(
      provider.readThread({
        publicId: "S-threads/demo.json",
        source: "s3",
        sourceId: "threads/demo.json",
      }),
    ).resolves.toBeNull();
  });

  it("lists S3-backed thread records for an org and owner", async () => {
    listMock.mockResolvedValueOnce({
      contents: [
        {
          key: "456/123/thread-a.json",
          lastModified: "2026-03-10T00:00:00.000Z",
        },
        {
          key: "456/123/thread-b.json",
          lastModified: "2026-03-11T00:00:00.000Z",
        },
        {
          key: "999/777/thread-c.json",
          lastModified: "2026-03-12T00:00:00.000Z",
        },
      ],
      cursor: "cursor-2",
      hasMore: false,
    });

    textMock
      .mockResolvedValueOnce('{"title":"Older thread"}')
      .mockResolvedValueOnce('{"title":"Newer thread"}');

    const provider = new S3ThreadSourceProvider();

    await expect(provider.listThreads("456", "123")).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "S-456-123-thread-b",
          source: "s3",
          sourceId: "456/123/thread-b.json",
          title: "Newer thread",
        }),
        expect.objectContaining({
          id: "S-456-123-thread-a",
          source: "s3",
          sourceId: "456/123/thread-a.json",
          title: "Older thread",
        }),
      ],
      nextCursor: undefined,
    });
  });

  it("uses org and owner prefix when org id is provided", async () => {
    listMock.mockResolvedValueOnce({
      contents: [
        {
          key: "456/123/thread-a.json",
          lastModified: "2026-03-10T00:00:00.000Z",
        },
      ],
      hasMore: false,
    });
    textMock.mockResolvedValueOnce('{"title":"Scoped thread"}');

    const provider = new S3ThreadSourceProvider();

    await expect(provider.listThreads("456", "123")).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "S-456-123-thread-a",
          source: "s3",
          sourceId: "456/123/thread-a.json",
          title: "Scoped thread",
        }),
      ],
      nextCursor: undefined,
    });
    expect(listMock).toHaveBeenCalledWith({
      limit: undefined,
      prefix: "456/123/",
    });
  });

  it("returns the next S3 cursor when more results are available", async () => {
    listMock.mockResolvedValueOnce({
      contents: [
        {
          key: "456/123/thread-a.json",
          lastModified: "2026-03-10T00:00:00.000Z",
        },
      ],
      cursor: "cursor-2",
      hasMore: true,
    });
    textMock.mockResolvedValueOnce('{"title":"Scoped thread"}');

    const provider = new S3ThreadSourceProvider();

    await expect(
      provider.listThreads("456", "123", {
        cursor: "cursor-1",
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "S-456-123-thread-a",
          sourceId: "456/123/thread-a.json",
          title: "Scoped thread",
        }),
      ],
      nextCursor: "cursor-2",
    });
    expect(listMock).toHaveBeenCalledWith({
      cursor: "cursor-1",
      limit: 10,
      prefix: "456/123/",
    });
  });

  it("resolves bare S3 ids by filename", async () => {
    listMock.mockResolvedValueOnce({
      contents: [
        {
          key: "456/123/demo.json",
          lastModified: "2026-03-11T00:00:00.000Z",
        },
      ],
      hasMore: false,
    });
    existsMock.mockResolvedValueOnce(true);
    textMock.mockResolvedValueOnce('{"title":"Resolved thread"}');

    const provider = new S3ThreadSourceProvider();

    await expect(
      provider.readThread({
        publicId: "S-demo",
        source: "s3",
        sourceId: "demo",
      }),
    ).resolves.toMatchObject({
      source: "s3",
      id: "S-demo",
      sourceId: "456/123/demo.json",
      filename: "demo.json",
      content: '{"title":"Resolved thread"}',
    });
  });

  it("deletes S3-backed thread records", async () => {
    const provider = new S3ThreadSourceProvider();

    await expect(provider.deleteThread("456/123/thread-a.json")).resolves.toBe(
      undefined,
    );
    expect(deleteMock).toHaveBeenCalledWith("456/123/thread-a.json");
  });

  it("updates S3-backed thread titles in athrd metadata", async () => {
    existsMock.mockResolvedValueOnce(true);
    textMock.mockResolvedValueOnce(
      JSON.stringify({
        messages: [],
        __athrd: {
          ide: "codex",
        },
      }),
    );

    const provider = new S3ThreadSourceProvider();

    await expect(
      provider.updateTitle("456/123/thread-a.json", "Renamed thread"),
    ).resolves.toBe(undefined);
    expect(writeMock).toHaveBeenCalledWith(
      "456/123/thread-a.json",
      expect.stringContaining('"title": "Renamed thread"'),
    );
  });
});
