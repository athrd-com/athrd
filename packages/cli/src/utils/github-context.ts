import type { Octokit } from "@octokit/rest";
import type { AthrdMetadata } from "./athrd-metadata.js";
import {
  getGitHubOrgInfo,
  getGitHubRepoInfo,
  type GitHubOrgInfo,
  type GitHubRepoInfo,
  type GitHubUserInfo,
} from "./github.js";
import type { IngestGithubContext } from "./ingest-client.js";

type OrganizationMetadata = NonNullable<AthrdMetadata["organization"]>;
type RepositoryMetadata = NonNullable<AthrdMetadata["repository"]>;

interface GitHubRepositoryLookups {
  getOrgInfo?: (
    octokit: Octokit,
    orgName: string,
  ) => Promise<GitHubOrgInfo | null>;
  getRepoInfo?: (
    octokit: Octokit,
    owner: string,
    repo: string,
  ) => Promise<GitHubRepoInfo | null>;
}

export interface GitHubRepositoryContext {
  github: IngestGithubContext;
  organization?: OrganizationMetadata;
  repository?: RepositoryMetadata;
  repositoryLookupFailed: boolean;
  repositoryFullName?: string;
}

export async function resolveGitHubRepositoryContext(input: {
  octokit: Octokit;
  githubRepo: string | null;
  userInfo: GitHubUserInfo;
  lookups?: GitHubRepositoryLookups;
}): Promise<GitHubRepositoryContext> {
  const parsedRepo = parseGitHubRepoFullName(input.githubRepo);

  if (!parsedRepo) {
    return {
      github: {},
      repositoryLookupFailed: false,
    };
  }

  const getRepoInfo = input.lookups?.getRepoInfo ?? getGitHubRepoInfo;
  const getOrgInfo = input.lookups?.getOrgInfo ?? getGitHubOrgInfo;
  const repoInfo = await getRepoInfo(
    input.octokit,
    parsedRepo.owner,
    parsedRepo.repo,
  );
  const ownerIsAuthenticatedUser =
    parsedRepo.owner.toLowerCase() === input.userInfo.username.toLowerCase();
  const shouldFetchOrgInfo = repoInfo
    ? repoInfo.ownerType === "Organization"
    : !ownerIsAuthenticatedUser;
  const orgInfo = shouldFetchOrgInfo
    ? await getOrgInfo(input.octokit, parsedRepo.owner)
    : null;

  const github: IngestGithubContext = {
    ...(orgInfo && {
      organization: {
        githubOrgId: String(orgInfo.orgId),
        login: orgInfo.orgName,
        ...(orgInfo.name ? { name: orgInfo.name } : {}),
        avatarUrl: orgInfo.orgIcon,
      },
    }),
    ...(repoInfo && {
      repository: {
        githubRepoId: String(repoInfo.repoId),
        owner: repoInfo.owner,
        name: repoInfo.name,
        fullName: repoInfo.fullName,
        ...(repoInfo.htmlUrl ? { htmlUrl: repoInfo.htmlUrl } : {}),
        ...(repoInfo.defaultBranch
          ? { defaultBranch: repoInfo.defaultBranch }
          : {}),
        ...(typeof repoInfo.private === "boolean"
          ? { private: repoInfo.private }
          : {}),
      },
    }),
  };

  return {
    github,
    ...(orgInfo && {
      organization: {
        githubOrgId: String(orgInfo.orgId),
      },
    }),
    ...(repoInfo && {
      repository: {
        githubRepoId: String(repoInfo.repoId),
      },
    }),
    repositoryLookupFailed: !repoInfo,
    repositoryFullName: `${parsedRepo.owner}/${parsedRepo.repo}`,
  };
}

function parseGitHubRepoFullName(
  githubRepo: string | null,
): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = githubRepo?.split("/") ?? [];

  if (!owner || !repo || rest.length > 0) {
    return null;
  }

  return { owner, repo };
}
