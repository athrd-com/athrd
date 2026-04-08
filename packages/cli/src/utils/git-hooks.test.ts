import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { installRepoCommitMsgHook } from "./git-hooks.js";

const tempDirs: string[] = [];
const originalEnv = {
  ATHRD_HOME: process.env.ATHRD_HOME,
  GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
  HOME: process.env.HOME,
};

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
}

function getRepoCommitMsgHookPath(repo: string): string {
  return join(repo, ".git", "hooks", "commit-msg");
}

beforeEach(() => {
  const home = makeTempDir("athrd-githooks-home-");
  process.env.HOME = home;
  process.env.GIT_CONFIG_GLOBAL = join(home, ".gitconfig");
  process.env.ATHRD_HOME = join(home, ".athrd");
});

afterEach(() => {
  process.env.HOME = originalEnv.HOME;
  process.env.GIT_CONFIG_GLOBAL = originalEnv.GIT_CONFIG_GLOBAL;
  process.env.ATHRD_HOME = originalEnv.ATHRD_HOME;

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("repo git hook install", () => {
  test("install writes an executable repo-local hook", () => {
    const repo = makeTempDir("athrd-repo-install-");
    runGit(["init"], repo);

    const result = installRepoCommitMsgHook(repo);
    const hookPath = getRepoCommitMsgHookPath(repo);

    expect(result.installedCommitMsgHook).toBeTrue();
    expect(existsSync(hookPath)).toBeTrue();
    expect(statSync(hookPath).mode & 0o111).toBeGreaterThan(0);
  });

  test("install is idempotent when the repo hook is already ATHRD-managed", () => {
    const repo = makeTempDir("athrd-repo-idempotent-");
    runGit(["init"], repo);

    installRepoCommitMsgHook(repo);
    const secondInstall = installRepoCommitMsgHook(repo);

    expect(secondInstall.installedCommitMsgHook).toBeFalse();
    expect(
      readdirSync(join(repo, ".git", "hooks")).filter((file) =>
        file.startsWith("commit-msg.athrd-backup-"),
      ),
    ).toHaveLength(0);
  });

  test("install ignores unrelated global hooksPath configuration", () => {
    const repo = makeTempDir("athrd-repo-other-global-");
    const otherGlobalHooksDir = makeTempDir("athrd-other-global-hooks-");
    runGit(["init"], repo);
    runGit(["config", "--global", "core.hooksPath", otherGlobalHooksDir]);

    installRepoCommitMsgHook(repo);

    expect(runGit(["config", "--global", "--get", "core.hooksPath"])).toBe(
      otherGlobalHooksDir,
    );
    expect(existsSync(getRepoCommitMsgHookPath(repo))).toBeTrue();
  });

  test("install fails when the repo sets a local hooksPath", () => {
    const repo = makeTempDir("athrd-repo-local-hooks-path-");
    runGit(["init"], repo);
    runGit(["config", "--local", "core.hooksPath", ".husky"], repo);

    expect(() => installRepoCommitMsgHook(repo)).toThrow(/core\.hooksPath/);
    expect(existsSync(getRepoCommitMsgHookPath(repo))).toBeFalse();
  });
});

describe("commit-msg script behavior", () => {
  test("applies marker links when .athrdrc is missing", () => {
    const repo = makeTempDir("athrd-repo-no-rc-");
    runGit(["init"], repo);
    installRepoCommitMsgHook(repo);

    const hookPath = getRepoCommitMsgHookPath(repo);
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");

    writeFileSync(msgFile, "feat: no rc file\n", "utf-8");
    writeFileSync(markerFile, "https://athrd.com/threads/no-rc\n", "utf-8");

    execFileSync(hookPath, [msgFile], { cwd: repo, stdio: "ignore" });

    expect(readFileSync(msgFile, "utf-8")).toContain(
      "Agent-Session: https://athrd.com/threads/no-rc",
    );
    expect(readFileSync(markerFile, "utf-8")).toBe("");
  });

  test("appends marker links as Agent-Session trailers and clears marker", () => {
    const repo = makeTempDir("athrd-repo-markers-");
    runGit(["init"], repo);
    installRepoCommitMsgHook(repo);

    const hookPath = getRepoCommitMsgHookPath(repo);
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");

    writeFileSync(msgFile, "feat: add feature\n", "utf-8");
    writeFileSync(
      markerFile,
      "https://athrd.com/threads/a\nhttps://athrd.com/threads/a\nhttps://athrd.com/threads/b\n",
      "utf-8",
    );

    execFileSync(hookPath, [msgFile], { cwd: repo, stdio: "ignore" });

    const updatedMessage = readFileSync(msgFile, "utf-8");
    expect(updatedMessage).toContain("Agent-Session: https://athrd.com/threads/a");
    expect(updatedMessage).toContain("Agent-Session: https://athrd.com/threads/b");
    expect(updatedMessage.match(/threads\/a/g)?.length).toBe(1);
    expect(readFileSync(markerFile, "utf-8")).toBe("");
  });

  test("appends new links into existing trailers without duplicates", () => {
    const repo = makeTempDir("athrd-repo-existing-trailers-");
    runGit(["init"], repo);
    installRepoCommitMsgHook(repo);

    const hookPath = getRepoCommitMsgHookPath(repo);
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");

    writeFileSync(
      msgFile,
      [
        "feat: existing block",
        "",
        "Agent-Session: https://athrd.com/threads/a",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      markerFile,
      "https://athrd.com/threads/a\nhttps://athrd.com/threads/c\n",
      "utf-8",
    );

    execFileSync(hookPath, [msgFile], { cwd: repo, stdio: "ignore" });

    const updatedMessage = readFileSync(msgFile, "utf-8");
    expect(updatedMessage.match(/threads\/a/g)?.length).toBe(1);
    expect(updatedMessage).toContain(
      "Agent-Session: https://athrd.com/threads/c",
    );
    expect(readFileSync(markerFile, "utf-8")).toBe("");
  });

  test("respects .athrdrc disabled=true opt-out and leaves message/marker unchanged", () => {
    const repo = makeTempDir("athrd-repo-optout-");
    runGit(["init"], repo);
    installRepoCommitMsgHook(repo);

    const hookPath = getRepoCommitMsgHookPath(repo);
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");
    const rcFile = join(repo, ".athrdrc");

    writeFileSync(msgFile, "feat: skip trailers\n", "utf-8");
    writeFileSync(markerFile, "https://athrd.com/threads/skipped\n", "utf-8");
    writeFileSync(rcFile, "disabled=true\n", "utf-8");

    execFileSync(hookPath, [msgFile], { cwd: repo, stdio: "ignore" });

    expect(readFileSync(msgFile, "utf-8")).toBe("feat: skip trailers\n");
    expect(readFileSync(markerFile, "utf-8")).toBe(
      "https://athrd.com/threads/skipped\n",
    );
  });

  test("honors case-insensitive true value in .athrdrc disabled key", () => {
    const repo = makeTempDir("athrd-repo-optout-case-");
    runGit(["init"], repo);
    installRepoCommitMsgHook(repo);

    const hookPath = getRepoCommitMsgHookPath(repo);
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");
    const rcFile = join(repo, ".athrdrc");

    writeFileSync(msgFile, "feat: skip trailers off\n", "utf-8");
    writeFileSync(markerFile, "https://athrd.com/threads/skipped-off\n", "utf-8");
    writeFileSync(rcFile, "disabled=ON\n", "utf-8");

    execFileSync(hookPath, [msgFile], { cwd: repo, stdio: "ignore" });

    expect(readFileSync(msgFile, "utf-8")).toBe("feat: skip trailers off\n");
    expect(readFileSync(markerFile, "utf-8")).toBe(
      "https://athrd.com/threads/skipped-off\n",
    );
  });

  test("keeps hook enabled when .athrdrc sets disabled=false", () => {
    const repo = makeTempDir("athrd-repo-optin-");
    runGit(["init"], repo);
    installRepoCommitMsgHook(repo);

    const hookPath = getRepoCommitMsgHookPath(repo);
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");
    const rcFile = join(repo, ".athrdrc");

    writeFileSync(msgFile, "feat: keep trailers\n", "utf-8");
    writeFileSync(markerFile, "https://athrd.com/threads/enabled\n", "utf-8");
    writeFileSync(rcFile, "disabled=false\n", "utf-8");

    execFileSync(hookPath, [msgFile], { cwd: repo, stdio: "ignore" });

    expect(readFileSync(msgFile, "utf-8")).toContain(
      "Agent-Session: https://athrd.com/threads/enabled",
    );
    expect(readFileSync(markerFile, "utf-8")).toBe("");
  });

  test("runs the previous repo hook first and propagates its failure", () => {
    const repo = makeTempDir("athrd-repo-previous-hook-");
    runGit(["init"], repo);

    const existingHook = getRepoCommitMsgHookPath(repo);
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");
    const flagFile = join(repo, "previous-hook-ran.txt");

    writeFileSync(
      existingHook,
      `#!/bin/bash\necho ran > "${flagFile}"\nexit 1\n`,
      "utf-8",
    );
    chmodSync(existingHook, 0o755);

    installRepoCommitMsgHook(repo);
    writeFileSync(msgFile, "feat: blocked commit\n", "utf-8");
    writeFileSync(markerFile, "https://athrd.com/threads/blocked\n", "utf-8");

    try {
      execFileSync(existingHook, [msgFile], { cwd: repo, stdio: "ignore" });
      throw new Error("Expected hook to fail");
    } catch {
      // Expected.
    }

    expect(existsSync(flagFile)).toBeTrue();
    expect(readFileSync(msgFile, "utf-8")).toBe("feat: blocked commit\n");
    expect(readFileSync(markerFile, "utf-8")).toContain(
      "https://athrd.com/threads/blocked",
    );
  });

  test("chains an existing repo commit-msg hook and preserves its behavior", () => {
    const repo = makeTempDir("athrd-repo-chain-hook-");
    runGit(["init"], repo);

    const existingHook = getRepoCommitMsgHookPath(repo);
    const flagFile = join(repo, "existing-hook-ran.txt");
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");

    writeFileSync(
      existingHook,
      `#!/bin/bash\necho ran > "${flagFile}"\nexit 0\n`,
      "utf-8",
    );
    chmodSync(existingHook, 0o755);

    installRepoCommitMsgHook(repo);
    writeFileSync(msgFile, "feat: chain repo hook\n", "utf-8");
    writeFileSync(markerFile, "https://athrd.com/threads/chained\n", "utf-8");

    execFileSync(existingHook, [msgFile], { cwd: repo, stdio: "ignore" });

    expect(existsSync(flagFile)).toBeTrue();
    expect(readFileSync(msgFile, "utf-8")).toContain(
      "Agent-Session: https://athrd.com/threads/chained",
    );
  });
});
