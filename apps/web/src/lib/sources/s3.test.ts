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

const existsMock = vi.fn();
const textMock = vi.fn();
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
    listMock.mockReset();
    fileMock.mockClear();
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      writable: true,
      value: {
      S3Client: class S3Client {
        file = fileMock;
        list = listMock;
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
      hasMore: false,
    });

    textMock
      .mockResolvedValueOnce('{"customTitle":"Older thread"}')
      .mockResolvedValueOnce('{"customTitle":"Newer thread"}');

    const provider = new S3ThreadSourceProvider();

    await expect(provider.listThreads("456", "123")).resolves.toEqual([
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
    ]);
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
    textMock.mockResolvedValueOnce('{"customTitle":"Scoped thread"}');

    const provider = new S3ThreadSourceProvider();

    await expect(provider.listThreads("456", "123")).resolves.toEqual([
      expect.objectContaining({
        id: "S-456-123-thread-a",
        source: "s3",
        sourceId: "456/123/thread-a.json",
        title: "Scoped thread",
      }),
    ]);
    expect(listMock).toHaveBeenCalledWith({
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
});
