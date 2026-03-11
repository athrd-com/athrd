import {
  fetchGist,
  fetchUserGists,
  type GistData,
  type GistFile,
} from "~/lib/github";
import type { ThreadListEntry } from "../thread-list";
import type {
  ThreadLocator,
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

  async listThreads(accessToken: string): Promise<ThreadListEntry[]> {
    if (!accessToken.trim()) {
      return [];
    }

    const gists = await fetchUserGists(accessToken);

    return gists.map((gist) => ({
      id: gist.id,
      source: "gist",
      sourceId: gist.id,
      title: gist.description || undefined,
      createdAt: gist.created_at,
      updatedAt: gist.updated_at,
    }));
  }
}
