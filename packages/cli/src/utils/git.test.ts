import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";
import { getGitRepoRoot } from "./git.js";

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
