import { execFileSync } from "child_process";
import { getGitRepoRoot } from "./git.js";

const DEFAULT_WINDOW_SECONDS = 30;
const TRAILER_PREFIX = "Agent-Session:";

export type CommitBackfillStatus =
  | "applied"
  | "skipped:not_git_repo"
  | "skipped:no_head"
  | "skipped:empty_url"
  | "skipped:already_pushed"
  | "skipped:head_too_old"
  | "skipped:index_not_clean"
  | "skipped:trailer_exists"
  | "failed";

export interface CommitBackfillResult {
  status: CommitBackfillStatus;
  reason?: string;
}

interface BackfillRecentHeadAgentSessionTrailerParams {
  cwd?: string;
  url: string;
}

interface HeadHasAgentSessionTrailerParams {
  cwd?: string;
  url: string;
}

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
}

function hasHead(cwd: string): boolean {
  try {
    runGit(["rev-parse", "--verify", "HEAD"], cwd);
    return true;
  } catch {
    return false;
  }
}

function isHeadAlreadyInRemoteRef(cwd: string): boolean {
  try {
    const remoteRefs = runGit(
      [
        "for-each-ref",
        "--contains",
        "HEAD",
        "--format=%(refname)",
        "refs/remotes",
      ],
      cwd,
    );
    return remoteRefs
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some(Boolean);
  } catch {
    return false;
  }
}

function isIndexClean(cwd: string): boolean {
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], {
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function hasMatchingTrailer(message: string, url: string): boolean {
  const lines = message.split(/\r?\n/);
  for (const rawLine of lines) {
    if (!rawLine.startsWith(TRAILER_PREFIX)) {
      continue;
    }
    const trailerValue = rawLine.slice(TRAILER_PREFIX.length).trim();
    if (trailerValue === url) {
      return true;
    }
  }
  return false;
}

export function headHasAgentSessionTrailer(
  params: HeadHasAgentSessionTrailerParams,
): boolean {
  const url = params.url.trim();
  if (!url) {
    return false;
  }

  const repoRoot = getGitRepoRoot(params.cwd);
  if (!repoRoot || !hasHead(repoRoot)) {
    return false;
  }

  let message = "";
  try {
    message = runGit(["log", "-1", "--pretty=%B", "HEAD"], repoRoot);
  } catch {
    return false;
  }

  return hasMatchingTrailer(message, url);
}

export function backfillRecentHeadAgentSessionTrailer(
  params: BackfillRecentHeadAgentSessionTrailerParams,
): CommitBackfillResult {
  const url = params.url.trim();
  if (!url) {
    return { status: "skipped:empty_url" };
  }

  const repoRoot = getGitRepoRoot(params.cwd);
  if (!repoRoot) {
    return { status: "skipped:not_git_repo" };
  }

  if (!hasHead(repoRoot)) {
    return { status: "skipped:no_head" };
  }

  if (isHeadAlreadyInRemoteRef(repoRoot)) {
    return { status: "skipped:already_pushed" };
  }

  let commitTimestamp = 0;
  try {
    commitTimestamp = Number.parseInt(
      runGit(["show", "-s", "--format=%ct", "HEAD"], repoRoot),
      10,
    );
  } catch {
    return { status: "failed", reason: "Unable to read HEAD timestamp" };
  }

  if (!Number.isFinite(commitTimestamp)) {
    return { status: "failed", reason: "Invalid HEAD timestamp" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - commitTimestamp >= DEFAULT_WINDOW_SECONDS) {
    return { status: "skipped:head_too_old" };
  }

  let message = "";
  try {
    message = runGit(["log", "-1", "--pretty=%B", "HEAD"], repoRoot);
  } catch {
    return { status: "failed", reason: "Unable to read HEAD message" };
  }

  if (hasMatchingTrailer(message, url)) {
    return { status: "skipped:trailer_exists" };
  }

  if (!isIndexClean(repoRoot)) {
    return { status: "skipped:index_not_clean" };
  }

  try {
    execFileSync(
      "git",
      [
        "commit",
        "--amend",
        "--no-edit",
        "--no-verify",
        "--trailer",
        `${TRAILER_PREFIX} ${url}`,
      ],
      {
        cwd: repoRoot,
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    return { status: "applied" };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
