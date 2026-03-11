import {
  deleteGist,
  fetchGist,
  fetchUserGists,
  updateGistDescription,
  type GistData,
  type GistFile,
} from "~/lib/github";
import type { ThreadListPage } from "../thread-list";
import type {
  ThreadLocator,
  ThreadListPageOptions,
  ThreadSourceProvider,
  ThreadSourceRecord,
} from "./types";

export function createThreadSourceRecordFromGist(
  gist: GistData,
  file: GistFile,
  publicId = gist.id,
): ThreadSourceRecord {
  return {
    id: publicId,
    source: "gist",
    sourceId: gist.id,
    title: gist.description || undefined,
    createdAt: gist.created_at,
    updatedAt: gist.updated_at,
    owner: {
      id: String(gist.owner.id),
      login: gist.owner.login,
      avatarUrl: gist.owner.avatar_url,
      profileUrl: gist.owner.html_url,
    },
    filename: file.filename,
    content: file.content || "",
  };
}

export class GistThreadSourceProvider implements ThreadSourceProvider {
  async readThread(locator: ThreadLocator): Promise<ThreadSourceRecord | null> {
    const { gist, file } = await fetchGist(locator.sourceId);
    if (!gist || !file) {
      return null;
    }

    return createThreadSourceRecordFromGist(gist, file, locator.publicId);
  }

  async listThreads(
    accessToken: string,
    options: ThreadListPageOptions = {},
  ): Promise<ThreadListPage> {
    if (!accessToken.trim()) {
      return { items: [] };
    }

    const page =
      typeof options.cursor === "string" ? Number.parseInt(options.cursor, 10) : 1;
    const { items, nextPage } = await fetchUserGists(accessToken, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      perPage: options.limit,
    });

    return {
      items: items.map((gist) => ({
        id: gist.id,
        source: "gist",
        sourceId: gist.id,
        title: gist.description || undefined,
        createdAt: gist.created_at,
        updatedAt: gist.updated_at,
      })),
      nextCursor: nextPage ? String(nextPage) : undefined,
    };
  }

  async deleteThread(accessToken: string, gistId: string): Promise<void> {
    if (!accessToken.trim()) {
      throw new Error("GitHub access token is required to delete a gist");
    }

    const deleted = await deleteGist(accessToken, gistId);
    if (!deleted) {
      throw new Error("Unable to delete gist thread");
    }
  }

  async updateTitle(
    accessToken: string,
    gistId: string,
    title: string,
  ): Promise<void> {
    if (!accessToken.trim()) {
      throw new Error("GitHub access token is required to update a gist");
    }

    const updated = await updateGistDescription(accessToken, gistId, title);
    if (!updated) {
      throw new Error("Unable to update gist thread title");
    }
  }
}
