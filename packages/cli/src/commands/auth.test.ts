import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getAuthEnableRepoRoot } from "./auth.js";

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

describe("getAuthEnableRepoRoot", () => {
  test("returns the repo root when auth runs inside a git repository", () => {
    const repo = makeTempDir("athrd-auth-repo-");
    execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });

    expect(getAuthEnableRepoRoot(repo)).toBe(realpathSync(repo));
  });

  test("returns null when auth runs outside a git repository", () => {
    const dir = makeTempDir("athrd-auth-no-repo-");
    expect(getAuthEnableRepoRoot(dir)).toBeNull();
  });
});
