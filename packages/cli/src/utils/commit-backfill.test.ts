import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, execSync } from "child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { backfillRecentHeadAgentSessionTrailer } from "./commit-backfill.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function initRepoWithIdentity(repo: string): void {
  execSync("git init", { cwd: repo, stdio: "ignore" });
  execSync('git config user.email "athrd-tests@example.com"', {
    cwd: repo,
    stdio: "ignore",
  });
  execSync('git config user.name "athrd-tests"', {
    cwd: repo,
    stdio: "ignore",
  });
}

function commitFile(repo: string, message: string): void {
  writeFileSync(join(repo, "file.txt"), `${Math.random()}\n`, "utf-8");
  execSync("git add file.txt", { cwd: repo, stdio: "ignore" });
  execSync(`git commit -m "${message}"`, { cwd: repo, stdio: "ignore" });
}

function commitFileAtUnixTime(repo: string, message: string, unixSeconds: number): void {
  writeFileSync(join(repo, "file.txt"), `${Math.random()}\n`, "utf-8");
  execSync("git add file.txt", { cwd: repo, stdio: "ignore" });
  const date = `@${unixSeconds}`;
  execFileSync("git", ["commit", "-m", message], {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
    stdio: "ignore",
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("backfillRecentHeadAgentSessionTrailer", () => {
  test("applies trailer on recent clean HEAD commit", () => {
    const repo = makeTempDir("athrd-backfill-apply-");
    initRepoWithIdentity(repo);
    commitFile(repo, "feat: recent");

    const url = "https://athrd.com/threads/abc";
    const result = backfillRecentHeadAgentSessionTrailer({ cwd: repo, url });

    expect(result.status).toBe("applied");

    const message = execSync("git log -1 --pretty=%B", {
      cwd: repo,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    expect(message).toContain(`Agent-Session: ${url}`);
  });

  test("skips when HEAD is older than allowed window", () => {
    const repo = makeTempDir("athrd-backfill-old-");
    initRepoWithIdentity(repo);

    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    commitFileAtUnixTime(repo, "feat: old", oldTimestamp);

    const result = backfillRecentHeadAgentSessionTrailer({
      cwd: repo,
      url: "https://athrd.com/threads/old",
    });

    expect(result.status).toBe("skipped:head_too_old");
  });

  test("skips when index has staged changes", () => {
    const repo = makeTempDir("athrd-backfill-staged-");
    initRepoWithIdentity(repo);
    commitFile(repo, "feat: base");

    writeFileSync(join(repo, "staged.txt"), "staged\n", "utf-8");
    execSync("git add staged.txt", { cwd: repo, stdio: "ignore" });

    const result = backfillRecentHeadAgentSessionTrailer({
      cwd: repo,
      url: "https://athrd.com/threads/staged",
    });

    expect(result.status).toBe("skipped:index_not_clean");
  });

  test("skips when trailer already exists on HEAD", () => {
    const repo = makeTempDir("athrd-backfill-exists-");
    initRepoWithIdentity(repo);
    commitFile(repo, "feat: base");

    const url = "https://athrd.com/threads/already";
    execSync(
      `git commit --amend --no-edit --no-verify --trailer "Agent-Session: ${url}"`,
      {
        cwd: repo,
        stdio: "ignore",
      },
    );

    const result = backfillRecentHeadAgentSessionTrailer({ cwd: repo, url });
    expect(result.status).toBe("skipped:trailer_exists");
  });

  test("skips outside a git repository", () => {
    const dir = makeTempDir("athrd-backfill-no-git-");
    const result = backfillRecentHeadAgentSessionTrailer({
      cwd: dir,
      url: "https://athrd.com/threads/no-git",
    });
    expect(result.status).toBe("skipped:not_git_repo");
  });

  test("skips when repository has no commits", () => {
    const repo = makeTempDir("athrd-backfill-no-head-");
    initRepoWithIdentity(repo);

    const result = backfillRecentHeadAgentSessionTrailer({
      cwd: repo,
      url: "https://athrd.com/threads/no-head",
    });
    expect(result.status).toBe("skipped:no_head");
  });

  test("skips when HEAD is already pushed to upstream", () => {
    const remote = makeTempDir("athrd-backfill-remote-");
    execSync("git init --bare", { cwd: remote, stdio: "ignore" });

    const repo = makeTempDir("athrd-backfill-pushed-");
    initRepoWithIdentity(repo);
    execSync(`git remote add origin "${remote}"`, { cwd: repo, stdio: "ignore" });
    commitFile(repo, "feat: pushed");
    execSync("git push -u origin HEAD", { cwd: repo, stdio: "ignore" });

    const url = "https://athrd.com/threads/pushed";
    const result = backfillRecentHeadAgentSessionTrailer({ cwd: repo, url });

    expect(result.status).toBe("skipped:already_pushed");
    const message = execSync("git log -1 --pretty=%B", {
      cwd: repo,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    expect(message).not.toContain(`Agent-Session: ${url}`);
  });
});
