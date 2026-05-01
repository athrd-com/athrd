import { Octokit } from "@octokit/rest";

export interface GitHubUserInfo {
	id: string;
	username: string;
	avatarImage: string;
	scopes?: string[];
}

export interface GitHubOrgInfo {
	orgId: number;
	orgName: string;
	orgIcon: string;
	name?: string;
}

let cachedUserInfo: GitHubUserInfo | null = null;

/**
 * Fetch authenticated user's GitHub information
 * Results are cached to avoid multiple API calls during batch uploads
 */
export async function getGitHubUserInfo(
	octokit: Octokit,
): Promise<GitHubUserInfo> {
	if (cachedUserInfo) {
		return cachedUserInfo;
	}

	const response = await octokit.users.getAuthenticated();
	const userInfo: GitHubUserInfo = {
		id: String(response.data.id),
		username: response.data.login,
		avatarImage: response.data.avatar_url,
		scopes: parseGitHubScopes(response.headers["x-oauth-scopes"]),
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
	orgName: string,
): Promise<GitHubOrgInfo | null> {
	if (cachedOrgInfos.has(orgName)) {
		return cachedOrgInfos.get(orgName)!;
	}

	const response = await octokit.orgs.get({ org: orgName }).catch(() => {
		return null;
	});

	if (!response) {
		return null;
	}

	const orgInfo: GitHubOrgInfo = {
		orgId: response.data.id,
		orgName: response.data.login,
		orgIcon: response.data.avatar_url,
		name: response.data.name || undefined,
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
	owner: string;
	ownerType?: string;
	name: string;
	fullName: string;
	htmlUrl?: string;
	defaultBranch?: string;
	private?: boolean;
}

const cachedRepoInfos = new Map<string, GitHubRepoInfo>();

/**
 * Fetch GitHub repository information
 * Results are cached to avoid multiple API calls during batch uploads
 */
export async function getGitHubRepoInfo(
	octokit: Octokit,
	owner: string,
	repo: string,
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
		owner: response.data.owner.login,
		ownerType: response.data.owner.type,
		name: response.data.name,
		fullName: response.data.full_name,
		htmlUrl: response.data.html_url,
		defaultBranch: response.data.default_branch,
		private: response.data.private,
	};

	cachedRepoInfos.set(cacheKey, repoInfo);
	return repoInfo;
}

function parseGitHubScopes(value: unknown): string[] | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const scopes = value
		.split(",")
		.map((scope) => scope.trim())
		.filter(Boolean);

	return scopes.length > 0 ? scopes : undefined;
}
