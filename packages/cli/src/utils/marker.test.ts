import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";
import { appendAthrdUrlMarker } from "./marker.js";

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

describe("appendAthrdUrlMarker", () => {
  test("creates marker file and appends URL", () => {
    const root = makeTempDir("athrd-marker-create-");
    execSync("git init", { cwd: root, stdio: "ignore" });

    appendAthrdUrlMarker({ cwd: root, url: "https://athrd.com/threads/abc" });

    const markerPath = join(root, ".athrd-ai-marker");
    const gitignorePath = join(root, ".gitignore");
    expect(existsSync(markerPath)).toBeTrue();
    expect(existsSync(gitignorePath)).toBeTrue();
    expect(readFileSync(markerPath, "utf-8")).toBe(
      "https://athrd.com/threads/abc\n",
    );
    expect(readFileSync(gitignorePath, "utf-8")).toBe(".athrd-ai-marker\n");
  });

  test("skips duplicate URLs and appends unique URLs", () => {
    const root = makeTempDir("athrd-marker-dedupe-");
    execSync("git init", { cwd: root, stdio: "ignore" });

    appendAthrdUrlMarker({ cwd: root, url: "https://athrd.com/threads/abc" });
    appendAthrdUrlMarker({ cwd: root, url: "https://athrd.com/threads/abc" });
    appendAthrdUrlMarker({ cwd: root, url: "https://athrd.com/threads/def" });

    const markerPath = join(root, ".athrd-ai-marker");
    expect(readFileSync(markerPath, "utf-8")).toBe(
      "https://athrd.com/threads/abc\nhttps://athrd.com/threads/def\n",
    );
  });

  test("handles existing marker file without trailing newline", () => {
    const root = makeTempDir("athrd-marker-newline-");
    execSync("git init", { cwd: root, stdio: "ignore" });

    const markerPath = join(root, ".athrd-ai-marker");
    writeFileSync(markerPath, "https://athrd.com/threads/abc", "utf-8");

    appendAthrdUrlMarker({ cwd: root, url: "https://athrd.com/threads/def" });

    expect(readFileSync(markerPath, "utf-8")).toBe(
      "https://athrd.com/threads/abc\nhttps://athrd.com/threads/def\n",
    );
  });

  test("adds marker entry to existing gitignore once", () => {
    const root = makeTempDir("athrd-marker-gitignore-");
    execSync("git init", { cwd: root, stdio: "ignore" });

    const gitignorePath = join(root, ".gitignore");
    writeFileSync(gitignorePath, "node_modules\n", "utf-8");

    appendAthrdUrlMarker({ cwd: root, url: "https://athrd.com/threads/abc" });
    appendAthrdUrlMarker({ cwd: root, url: "https://athrd.com/threads/def" });

    expect(readFileSync(gitignorePath, "utf-8")).toBe(
      "node_modules\n.athrd-ai-marker\n",
    );
  });

  test("no-ops outside git repository", () => {
    const dir = makeTempDir("athrd-marker-no-git-");
    appendAthrdUrlMarker({ cwd: dir, url: "https://athrd.com/threads/abc" });

    expect(existsSync(join(dir, ".athrd-ai-marker"))).toBeFalse();
  });
});
