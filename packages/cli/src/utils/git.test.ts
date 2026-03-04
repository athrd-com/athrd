import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";
import { getGitHeadCommitHash, getGitHubRepo, getGitRepoRoot } from "./git.js";

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

describe("getGitRepoRoot", () => {
  test("returns git root for nested directory", () => {
    const root = makeTempDir("athrd-git-root-");
    execSync("git init", { cwd: root, stdio: "ignore" });

    const nested = join(root, "a", "b");
    mkdirSync(nested, { recursive: true });

    expect(getGitRepoRoot(nested)).toBe(realpathSync(root));
  });

  test("returns null outside git repo", () => {
    const dir = makeTempDir("athrd-no-git-");
    expect(getGitRepoRoot(dir)).toBeNull();
  });
});

describe("getGitHubRepo", () => {
  test("parses HTTPS origin URL", () => {
    const root = makeTempDir("athrd-github-repo-https-");
    execSync("git init", { cwd: root, stdio: "ignore" });
    execSync("git remote add origin https://github.com/athrd-com/athrd.git", {
      cwd: root,
      stdio: "ignore",
    });

    expect(getGitHubRepo(root)).toBe("athrd-com/athrd");
  });

  test("parses SSH origin URL", () => {
    const root = makeTempDir("athrd-github-repo-ssh-");
    execSync("git init", { cwd: root, stdio: "ignore" });
    execSync("git remote add origin git@github.com:athrd-com/athrd.git", {
      cwd: root,
      stdio: "ignore",
    });

    expect(getGitHubRepo(root)).toBe("athrd-com/athrd");
  });
});

describe("getGitHeadCommitHash", () => {
  test("returns HEAD commit hash", () => {
    const root = makeTempDir("athrd-git-head-");
    execSync("git init", { cwd: root, stdio: "ignore" });
    execSync('git config user.name "athrd-tests"', { cwd: root, stdio: "ignore" });
    execSync('git config user.email "athrd-tests@example.com"', {
      cwd: root,
      stdio: "ignore",
    });
    execSync("touch file.txt", { cwd: root, stdio: "ignore" });
    execSync("git add file.txt", { cwd: root, stdio: "ignore" });
    execSync('git commit -m "feat: test"', { cwd: root, stdio: "ignore" });

    const expected = execSync("git rev-parse HEAD", {
      cwd: root,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    expect(getGitHeadCommitHash(root)).toBe(expected);
  });

  test("returns null when no commits exist", () => {
    const root = makeTempDir("athrd-git-head-empty-");
    execSync("git init", { cwd: root, stdio: "ignore" });

    expect(getGitHeadCommitHash(root)).toBeNull();
  });
});
