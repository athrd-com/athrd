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
const fileMock = vi.fn(() => ({
  exists: existsMock,
  text: textMock,
}));

describe("sources/s3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockReset();
    textMock.mockReset();
    fileMock.mockClear();
    (
      globalThis as typeof globalThis & {
        Bun?: {
          S3Client: new () => { file: typeof fileMock };
        };
      }
    ).Bun = {
      S3Client: class S3Client {
        file = fileMock;
      },
    };
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
    delete (
      globalThis as typeof globalThis & {
        Bun?: unknown;
      }
    ).Bun;

    const provider = new S3ThreadSourceProvider();

    await expect(
      provider.readThread({
        publicId: "S-threads/demo.json",
        source: "s3",
        sourceId: "threads/demo.json",
      }),
    ).resolves.toBeNull();
  });
});
