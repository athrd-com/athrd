import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { markSharedSessionInRepo } from "./share.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("markSharedSessionInRepo", () => {
  test("does not install a repo git hook as a side effect", () => {
    const repo = makeTempDir("athrd-share-repo-");
    execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
    execSync('git config user.name "athrd-tests"', { cwd: repo, stdio: "ignore" });
    execSync('git config user.email "athrd-tests@example.com"', {
      cwd: repo,
      stdio: "ignore",
    });

    markSharedSessionInRepo({
      cwd: repo,
      mark: true,
      url: "https://athrd.com/threads/share-test",
    });

    expect(readFileSync(join(repo, ".agent-session-marker"), "utf-8")).toBe(
      "https://athrd.com/threads/share-test\n",
    );
    expect(existsSync(join(repo, ".git", "hooks", "commit-msg"))).toBeFalse();
  });
});
