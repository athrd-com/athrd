import {
  fetchGist,
  fetchUserGists,
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
}
