import { describe, expect, it, vi } from "vitest";
import {
  createS3PublicId,
  parseThreadLocator,
  ThreadSourceLookupError,
  readThreadSourceRecord,
} from "./thread-source";
import { parseS3SourceId } from "./sources/locator";

vi.mock("./sources/gist", () => ({
  GistThreadSourceProvider: class GistThreadSourceProvider {
    readThread = vi.fn().mockResolvedValue({
      id: "gist-1",
      source: "gist",
      sourceId: "gist-1",
      filename: "athrd-thread.json",
      content: "{}",
    });
  },
  createThreadSourceRecordFromGist: vi.fn(),
}));

vi.mock("./sources/s3", () => ({
  S3ThreadSourceProvider: class S3ThreadSourceProvider {
    readThread = vi.fn().mockResolvedValue({
      id: "S-threads/demo.json",
      source: "s3",
      sourceId: "threads/demo.json",
      filename: "demo.json",
      content: "{}",
    });
  },
}));

describe("thread-source", () => {
  it("parses bare ids as gist ids", () => {
    expect(parseThreadLocator("abc123")).toEqual({
      publicId: "abc123",
      source: "gist",
      sourceId: "abc123",
    });
  });

  it("parses S3-prefixed ids", () => {
    const publicId = createS3PublicId("456/123/abc123.json");

    expect(parseThreadLocator(publicId)).toEqual({
      publicId,
      source: "s3",
      sourceId: "456/123/abc123.json",
    });
  });

  it("keeps supporting raw S3 ids", () => {
    expect(parseThreadLocator("S-threads/demo.json")).toEqual({
      publicId: "S-threads/demo.json",
      source: "s3",
      sourceId: "threads/demo.json",
    });
  });

  it("rejects unsupported prefixed ids", () => {
    expect(() => parseThreadLocator("X-123")).toThrow(ThreadSourceLookupError);
  });

  it("extracts org and owner metadata from S3 source ids", () => {
    expect(parseS3SourceId("456/123/abc123.json")).toEqual({
      orgId: "456",
      ownerId: "123",
      filename: "abc123.json",
    });
  });

  it("routes gist ids through the gist provider", async () => {
    await expect(readThreadSourceRecord("gist-1")).resolves.toMatchObject({
      source: "gist",
      id: "gist-1",
    });
  });

  it("routes prefixed ids through the S3 provider", async () => {
    const publicId = createS3PublicId("456/123/abc123.json");

    await expect(readThreadSourceRecord(publicId)).resolves.toMatchObject({
      source: "s3",
      id: "S-threads/demo.json",
    });
  });
});
