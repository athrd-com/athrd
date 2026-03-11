import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GistData, GistFile } from "~/lib/github";
import {
  createThreadSourceRecordFromGist,
  GistThreadSourceProvider,
} from "./gist";

vi.mock("~/lib/github", () => ({
  deleteGist: vi.fn(),
  fetchGist: vi.fn(),
  fetchUserGists: vi.fn(),
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

describe("sources/gist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(fetchGist).mockResolvedValueOnce({
      gist: gistData,
      file: gistFile,
    });

    const provider = new GistThreadSourceProvider();

    await expect(
      provider.readThread({
        publicId: "gist-1",
        source: "gist",
        sourceId: "gist-1",
      }),
    ).resolves.toMatchObject({
      source: "gist",
      id: "gist-1",
      sourceId: "gist-1",
    });
  });

  it("returns null when gist lookup fails", async () => {
    const { fetchGist } = await import("~/lib/github");
    vi.mocked(fetchGist).mockResolvedValueOnce({});

    const provider = new GistThreadSourceProvider();

    await expect(
      provider.readThread({
        publicId: "missing",
        source: "gist",
        sourceId: "missing",
      }),
    ).resolves.toBeNull();
  });

  it("lists gist-backed threads as thread list entries", async () => {
    const { fetchUserGists } = await import("~/lib/github");
    vi.mocked(fetchUserGists).mockResolvedValueOnce({
      items: [gistData],
      nextPage: 2,
    });

    const provider = new GistThreadSourceProvider();

    await expect(provider.listThreads("github-token")).resolves.toEqual({
      items: [
        {
          id: "gist-1",
          source: "gist",
          sourceId: "gist-1",
          title: "Test thread",
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: "2026-03-03T00:00:00.000Z",
        },
      ],
      nextCursor: "2",
    });
  });

  it("deletes gist-backed threads", async () => {
    const { deleteGist } = await import("~/lib/github");
    vi.mocked(deleteGist).mockResolvedValueOnce(true);

    const provider = new GistThreadSourceProvider();

    await expect(provider.deleteThread("github-token", "gist-1")).resolves.toBe(
      undefined,
    );
    expect(deleteGist).toHaveBeenCalledWith("github-token", "gist-1");
  });
});
