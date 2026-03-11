import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createThreadSourceRecordFromGist,
  parseThreadLocator,
  readThreadSourceRecord,
  ThreadSourceLookupError,
} from "./thread-source";
import type { GistData, GistFile } from "~/lib/github";

vi.mock("@/env", () => ({
  env: {
    ATHRD_THREADS_S3_BUCKET: "athrd-threads",
    ATHRD_THREADS_S3_REGION: "us-west-2",
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

vi.mock("~/lib/github", () => ({
  fetchGist: vi.fn(),
}));

const gistFile: GistFile = {
  filename: "athrd-thread.json",
  type: "application/json",
  language: "JSON",
  raw_url: "https://example.com/raw",
  size: 100,
  content: "{}",
};

const gistData: GistData = {
  id: "gist-1",
  description: "Test thread",
  owner: {
    login: "user",
    id: 1,
    avatar_url: "https://example.com/avatar.png",
    url: "https://api.github.com/users/user",
    html_url: "https://github.com/user",
    type: "User",
  },
  files: {
    "athrd-thread.json": gistFile,
  },
  created_at: "2026-03-03T00:00:00.000Z",
  updated_at: "2026-03-03T00:00:00.000Z",
};

describe("thread-source", () => {
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

  it("parses bare ids as gist ids", () => {
    expect(parseThreadLocator("abc123")).toEqual({
      publicId: "abc123",
      source: "gist",
      sourceId: "abc123",
    });
  });

  it("parses S3-prefixed ids", () => {
    expect(parseThreadLocator("S-threads/demo.json")).toEqual({
      publicId: "S-threads/demo.json",
      source: "s3",
      sourceId: "threads/demo.json",
    });
  });

  it("rejects unsupported prefixed ids", () => {
    expect(() => parseThreadLocator("X-123")).toThrow(ThreadSourceLookupError);
  });

  it("maps gists to normalized source records", () => {
    expect(createThreadSourceRecordFromGist(gistData, gistFile)).toMatchObject({
      id: "gist-1",
      source: "gist",
      sourceId: "gist-1",
      title: "Test thread",
      filename: "athrd-thread.json",
      owner: {
        login: "user",
        avatarUrl: "https://example.com/avatar.png",
      },
    });
  });

  it("loads gist-backed thread records", async () => {
    const { fetchGist } = await import("~/lib/github");
    const fetchGistMock = vi.mocked(fetchGist);
    fetchGistMock.mockResolvedValueOnce({
      gist: gistData,
      file: gistFile,
    });

    await expect(readThreadSourceRecord("gist-1")).resolves.toMatchObject({
      source: "gist",
      id: "gist-1",
      sourceId: "gist-1",
    });
  });

  it("loads S3-backed thread records", async () => {
    existsMock.mockResolvedValueOnce(true);
    textMock.mockResolvedValueOnce('{"title":"S3 thread"}');

    await expect(readThreadSourceRecord("S-threads/demo.json")).resolves.toMatchObject({
      source: "s3",
      id: "S-threads/demo.json",
      sourceId: "threads/demo.json",
      filename: "demo.json",
      content: '{"title":"S3 thread"}',
    });
  });

  it("returns null for missing S3 objects", async () => {
    existsMock.mockResolvedValueOnce(false);

    await expect(readThreadSourceRecord("S-threads/missing.json")).resolves.toBeNull();
  });

  it("returns null when Bun S3 is unavailable", async () => {
    delete (
      globalThis as typeof globalThis & {
        Bun?: unknown;
      }
    ).Bun;

    await expect(readThreadSourceRecord("S-threads/demo.json")).resolves.toBeNull();
  });
});
