import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  installGlobalCommitMsgHook,
  uninstallGlobalCommitMsgHook,
} from "./git-hooks.js";

const tempDirs: string[] = [];
const originalEnv = {
  HOME: process.env.HOME,
  GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
  ATHRD_HOME: process.env.ATHRD_HOME,
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

function getConfiguredHooksPath(): string {
  return runGit(["config", "--global", "--get", "core.hooksPath"]);
}

function getInstalledCommitMsgHookPath(): string {
  return join(getConfiguredHooksPath(), "commit-msg");
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

describe("global git hook install/uninstall", () => {
  test("install sets global hooksPath and writes executable hook", () => {
    installGlobalCommitMsgHook();

    const home = process.env.HOME!;
    const hookPath = getInstalledCommitMsgHookPath();
    const statePath = join(home, ".athrd", "git-hooks", "state.json");

    expect(existsSync(hookPath)).toBeTrue();
    expect(existsSync(statePath)).toBeTrue();
    expect(statSync(hookPath).mode & 0o111).toBeGreaterThan(0);
    expect(getConfiguredHooksPath().length).toBeGreaterThan(0);
  });

  test("install does not replace existing global hooksPath", () => {
    const previousHooksPath = makeTempDir("athrd-prev-hooks-");
    runGit(["config", "--global", "core.hooksPath", previousHooksPath]);

    installGlobalCommitMsgHook();

    expect(runGit(["config", "--global", "--get", "core.hooksPath"])).toBe(
      previousHooksPath,
    );
  });

  test("uninstall restores previous commit-msg hook in existing hooksPath", () => {
    const hooksDir = makeTempDir("athrd-existing-hooks-");
    const existingHook = join(hooksDir, "commit-msg");
    runGit(["config", "--global", "core.hooksPath", hooksDir]);
    writeFileSync(existingHook, "#!/bin/bash\nexit 0\n", "utf-8");
    chmodSync(existingHook, 0o755);

    installGlobalCommitMsgHook();
    uninstallGlobalCommitMsgHook();

    expect(existsSync(existingHook)).toBeTrue();
    expect(readFileSync(existingHook, "utf-8")).toBe("#!/bin/bash\nexit 0\n");
    expect(runGit(["config", "--global", "--get", "core.hooksPath"])).toBe(
      hooksDir,
    );
  });
});

describe("commit-msg script behavior", () => {
  test("applies marker links when .athrdrc is missing", () => {
    installGlobalCommitMsgHook();

    const hookPath = getInstalledCommitMsgHookPath();
    const repo = makeTempDir("athrd-repo-no-rc-");
    runGit(["init"], repo);

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
    installGlobalCommitMsgHook();

    const hookPath = getInstalledCommitMsgHookPath();
    const repo = makeTempDir("athrd-repo-");
    runGit(["init"], repo);

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
    installGlobalCommitMsgHook();

    const hookPath = getInstalledCommitMsgHookPath();
    const repo = makeTempDir("athrd-repo-block-");
    runGit(["init"], repo);

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
    installGlobalCommitMsgHook();

    const hookPath = getInstalledCommitMsgHookPath();
    const repo = makeTempDir("athrd-repo-optout-");
    runGit(["init"], repo);

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
    installGlobalCommitMsgHook();

    const hookPath = getInstalledCommitMsgHookPath();
    const repo = makeTempDir("athrd-repo-optout-off-");
    runGit(["init"], repo);

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
    installGlobalCommitMsgHook();

    const hookPath = getInstalledCommitMsgHookPath();
    const repo = makeTempDir("athrd-repo-optin-");
    runGit(["init"], repo);

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

  test("runs legacy repo hook first and propagates its failure", () => {
    installGlobalCommitMsgHook();

    const hookPath = getInstalledCommitMsgHookPath();
    const repo = makeTempDir("athrd-repo-legacy-");
    runGit(["init"], repo);

    const legacyHook = join(repo, ".git", "hooks", "commit-msg");
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");
    const flagFile = join(repo, "legacy-ran.txt");

    writeFileSync(
      legacyHook,
      `#!/bin/bash\necho ran > "${flagFile}"\nexit 1\n`,
      "utf-8",
    );
    chmodSync(legacyHook, 0o755);
    writeFileSync(msgFile, "feat: blocked commit\n", "utf-8");
    writeFileSync(markerFile, "https://athrd.com/threads/blocked\n", "utf-8");

    try {
      execFileSync(hookPath, [msgFile], { cwd: repo, stdio: "ignore" });
      throw new Error("Expected hook to fail");
    } catch {
      // expected
    }

    expect(existsSync(flagFile)).toBeTrue();
    expect(readFileSync(msgFile, "utf-8")).toBe("feat: blocked commit\n");
    expect(readFileSync(markerFile, "utf-8")).toContain(
      "https://athrd.com/threads/blocked",
    );
  });

  test("chains existing global commit-msg hook when hooksPath already exists", () => {
    const hooksDir = makeTempDir("athrd-global-hooks-");
    runGit(["config", "--global", "core.hooksPath", hooksDir]);
    const existingHook = join(hooksDir, "commit-msg");
    const flagFile = join(hooksDir, "existing-hook-ran.txt");

    writeFileSync(
      existingHook,
      `#!/bin/bash\necho ran > "${flagFile}"\nexit 0\n`,
      "utf-8",
    );
    chmodSync(existingHook, 0o755);

    installGlobalCommitMsgHook();

    const repo = makeTempDir("athrd-repo-global-chain-");
    runGit(["init"], repo);
    const msgFile = join(repo, "COMMIT_EDITMSG");
    const markerFile = join(repo, ".agent-session-marker");
    const managedHook = join(hooksDir, "commit-msg");

    writeFileSync(msgFile, "feat: chain global hook\n", "utf-8");
    writeFileSync(markerFile, "https://athrd.com/threads/chained\n", "utf-8");

    execFileSync(managedHook, [msgFile], { cwd: repo, stdio: "ignore" });

    expect(existsSync(flagFile)).toBeTrue();
    expect(readFileSync(msgFile, "utf-8")).toContain(
      "Agent-Session: https://athrd.com/threads/chained",
    );
  });
});
