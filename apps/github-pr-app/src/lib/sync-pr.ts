import { extractAthrdLinks, upsertAthrdLinksSection } from "./athrd-links";
import type { GitHubClient } from "./github-client";
import type { PullRequestAddress } from "../types/github";

export type SyncResult = {
  changed: boolean;
  links: string[];
  body: string;
};

export async function syncPullRequestAthrdLinks(
  client: GitHubClient,
  address: PullRequestAddress,
  currentBody: string | null,
): Promise<SyncResult> {
  const commits = await client.listPullRequestCommits(address);
  const messages = commits.map((commit) => commit.commit.message);
  const links = extractAthrdLinks(messages);
  const nextBody = upsertAthrdLinksSection(currentBody, links);

  if (nextBody === (currentBody ?? "")) {
    return {
      changed: false,
      links,
      body: nextBody,
    };
  }

  await client.updatePullRequestBody(address, nextBody);

  return {
    changed: true,
    links,
    body: nextBody,
  };
}
