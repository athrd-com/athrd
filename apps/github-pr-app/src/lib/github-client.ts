import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type { PullRequestAddress, PullRequestCommit } from "../types/github";
import { withRetry } from "./retry";
import type { Logger } from "./logger";

type GitHubAppConfig = {
  appId: string;
  privateKey: string;
};

export type GitHubClient = {
  listPullRequestCommits: (address: PullRequestAddress) => Promise<PullRequestCommit[]>;
  updatePullRequestBody: (address: PullRequestAddress, body: string) => Promise<void>;
};

export function createGitHubClient(
  installationId: number,
  config: GitHubAppConfig,
  logger: Logger,
): GitHubClient {
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: config.privateKey,
      installationId,
    },
  });

  return {
    listPullRequestCommits: async ({ owner, repo, pullNumber }) => {
      return withRetry(
        async () => {
          return octokit.paginate(octokit.rest.pulls.listCommits, {
            owner,
            repo,
            pull_number: pullNumber,
            per_page: 100,
          }) as Promise<PullRequestCommit[]>;
        },
        logger,
        { owner, repo, pullNumber, installationId, operation: "listPullRequestCommits" },
      );
    },
    updatePullRequestBody: async ({ owner, repo, pullNumber }, body) => {
      await withRetry(
        async () => {
          await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number: pullNumber,
            body,
          });
        },
        logger,
        { owner, repo, pullNumber, installationId, operation: "updatePullRequestBody" },
      );
    },
  };
}
