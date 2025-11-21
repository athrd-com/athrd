import { Octokit } from "@octokit/rest";

export interface GitHubUserInfo {
  username: string;
  avatarImage: string;
}

export interface GitHubOrgInfo {
  orgId: number;
  orgName: string;
  orgIcon: string;
}

let cachedUserInfo: GitHubUserInfo | null = null;

/**
 * Fetch authenticated user's GitHub information
 * Results are cached to avoid multiple API calls during batch uploads
 */
export async function getGitHubUserInfo(
  octokit: Octokit
): Promise<GitHubUserInfo> {
  if (cachedUserInfo) {
    return cachedUserInfo;
  }

  const response = await octokit.users.getAuthenticated();
  const userInfo: GitHubUserInfo = {
    username: response.data.login,
    avatarImage: response.data.avatar_url,
  };

  cachedUserInfo = userInfo;
  return userInfo;
}

/**
 * Reset cached user info (useful for testing or multiple sessions)
 */
export function resetGitHubUserInfoCache(): void {
  cachedUserInfo = null;
}

const cachedOrgInfos = new Map<string, GitHubOrgInfo>();

/**
 * Fetch GitHub organization information
 * Results are cached to avoid multiple API calls during batch uploads
 */
export async function getGitHubOrgInfo(
  octokit: Octokit,
  orgName: string
): Promise<GitHubOrgInfo> {
  if (cachedOrgInfos.has(orgName)) {
    return cachedOrgInfos.get(orgName)!;
  }

  const response = await octokit.orgs.get({ org: orgName });
  const orgInfo: GitHubOrgInfo = {
    orgId: response.data.id,
    orgName: response.data.login,
    orgIcon: response.data.avatar_url,
  };

  cachedOrgInfos.set(orgName, orgInfo);
  return orgInfo;
}

/**
 * Reset cached org info (useful for testing or multiple sessions)
 */
export function resetGitHubOrgInfoCache(): void {
  cachedOrgInfos.clear();
}

export interface GitHubRepoInfo {
  repoId: number;
  name: string;
}

const cachedRepoInfos = new Map<string, GitHubRepoInfo>();

/**
 * Fetch GitHub repository information
 * Results are cached to avoid multiple API calls during batch uploads
 */
export async function getGitHubRepoInfo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<GitHubRepoInfo | null> {
  const cacheKey = `${owner}/${repo}`;
  if (cachedRepoInfos.has(cacheKey)) {
    return cachedRepoInfos.get(cacheKey)!;
  }

  const response = await octokit.repos.get({ owner, repo }).catch((error) => {
    return null;
  });

  if (!response) {
    return null;
  }

  const repoInfo: GitHubRepoInfo = {
    repoId: response.data.id,
    name: response.data.name,
  };

  cachedRepoInfos.set(cacheKey, repoInfo);
  return repoInfo;
}
