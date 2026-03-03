import { execSync } from "child_process";

/**
 * Get the GitHub repository name from the current working directory
 * Supports both HTTPS and SSH remote URLs
 * Returns null if not in a git repo or can't determine the repo
 */
export function getGitHubRepo(cwd?: string): string | null {
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      encoding: "utf-8",
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    if (!remoteUrl) {
      return null;
    }

    // Parse HTTPS URL: https://github.com/owner/repo.git or https://github.com/owner/repo
    const httpsMatch = remoteUrl.match(
      /https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/
    );
    if (httpsMatch) {
      return `${httpsMatch[1]}/${httpsMatch[2]}`;
    }

    // Parse SSH URL: git@github.com:owner/repo.git or git@github.com:owner/repo
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/);
    if (sshMatch) {
      return `${sshMatch[1]}/${sshMatch[2]}`;
    }

    return null;
  } catch (error) {
    // Not in a git repo or git command failed
    return null;
  }
}

/**
 * Get the root directory of a git repository from a working directory
 * Returns null if not in a git repository
 */
export function getGitRepoRoot(cwd?: string): string | null {
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    return gitRoot || null;
  } catch {
    return null;
  }
}
