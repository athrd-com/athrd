import type { PullRequestEventAction, PullRequestEventPayload } from "../types/github";
import type { Logger } from "./logger";
import { createGitHubClient } from "./github-client";
import { syncPullRequestAthrdLinks } from "./sync-pr";

const handledActions = new Set<PullRequestEventAction>([
  "opened",
  "reopened",
  "synchronize",
  "edited",
  "ready_for_review",
]);

type HandlerConfig = {
  appId: string;
  privateKey: string;
};

export async function handlePullRequestEvent(
  payload: PullRequestEventPayload,
  config: HandlerConfig,
  logger: Logger,
): Promise<void> {
  if (!handledActions.has(payload.action as PullRequestEventAction)) {
    return;
  }

  if (payload.pull_request.state === "closed") {
    return;
  }

  const installationId = payload.installation?.id;
  if (!installationId) {
    logger.warn("Skipping pull request event with missing installation id", {
      action: payload.action,
      repository: payload.repository.name,
      pullNumber: payload.pull_request.number,
    });
    return;
  }

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pullNumber = payload.pull_request.number;

  const client = createGitHubClient(
    installationId,
    {
      appId: config.appId,
      privateKey: config.privateKey,
    },
    logger,
  );

  const result = await syncPullRequestAthrdLinks(
    client,
    { owner, repo, pullNumber },
    payload.pull_request.body,
  );

  logger.info("Processed pull request athrd link sync", {
    installationId,
    owner,
    repo,
    pullNumber,
    action: payload.action,
    changed: result.changed,
    linkCount: result.links.length,
  });
}
