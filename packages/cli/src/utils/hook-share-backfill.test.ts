import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, execSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { appendAthrdUrlMarker } from "./marker.js";
import { maybeBackfillHookDrivenCommit } from "./hook-share-backfill.js";

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

describe("maybeBackfillHookDrivenCommit", () => {
  test("backfills recent HEAD for hook-driven share and removes marker URL", () => {
    const repo = makeTempDir("athrd-hook-backfill-apply-");
    initRepoWithIdentity(repo);
    commitFile(repo, "feat: recent");

    const url = "https://athrd.com/threads/hook-apply";
    appendAthrdUrlMarker({ cwd: repo, url });

    const result = maybeBackfillHookDrivenCommit({
      cwd: repo,
      mark: true,
      hookPayloadJson: '{"thread-id":"x"}',
      url,
    });

    expect(result?.status).toBe("applied");
    expect(readFileSync(join(repo, ".agent-session-marker"), "utf-8")).toBe("");
  });

  test("keeps marker when backfill is skipped", () => {
    const repo = makeTempDir("athrd-hook-backfill-skip-");
    initRepoWithIdentity(repo);
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    commitFileAtUnixTime(repo, "feat: old", oldTimestamp);

    const url = "https://athrd.com/threads/hook-skip";
    appendAthrdUrlMarker({ cwd: repo, url });

    const result = maybeBackfillHookDrivenCommit({
      cwd: repo,
      mark: true,
      hookPayloadJson: '{"thread-id":"x"}',
      url,
    });

    expect(result?.status).toBe("skipped:head_too_old");
    expect(readFileSync(join(repo, ".agent-session-marker"), "utf-8")).toBe(
      `${url}\n`,
    );
  });
});
