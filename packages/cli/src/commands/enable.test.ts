import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import toml from "@iarna/toml";
import { enableAthrdForRepo } from "./enable.js";

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

beforeEach(() => {
  const home = makeTempDir("athrd-enable-home-");
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

describe("enableAthrdForRepo", () => {
  test("installs provider hooks and a repo-local commit-msg hook", () => {
    const home = process.env.HOME!;
    const repo = makeTempDir("athrd-enable-repo-");
    runGit(["init"], repo);

    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{}", "utf-8");

    mkdirSync(join(home, ".codex"), { recursive: true });

    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(join(home, ".gemini", "settings.json"), "{}", "utf-8");

    enableAthrdForRepo(repo);

    const hookScriptPath = join(process.env.ATHRD_HOME!, "hook.sh");
    const repoHookPath = join(repo, ".git", "hooks", "commit-msg");

    expect(existsSync(hookScriptPath)).toBeTrue();
    expect(existsSync(repoHookPath)).toBeTrue();

    const claudeConfig = JSON.parse(
      readFileSync(join(home, ".claude", "settings.json"), "utf-8"),
    ) as {
      hooks?: {
        Stop?: Array<{ hooks?: Array<{ command?: string }> }>;
      };
    };
    expect(claudeConfig.hooks?.Stop?.[0]?.hooks?.[0]?.command).toContain(
      "hook.sh claude",
    );

    const codexConfig = toml.parse(
      readFileSync(join(home, ".codex", "config.toml"), "utf-8"),
    ) as { notify?: string[] };
    expect(codexConfig.notify).toEqual(["bash", hookScriptPath, "codex"]);

    const geminiConfig = JSON.parse(
      readFileSync(join(home, ".gemini", "settings.json"), "utf-8"),
    ) as {
      hooksConfig?: {
        hooks?: {
          AfterModel?: Array<{ command?: string; type?: string }>;
        };
      };
    };
    expect(geminiConfig.hooksConfig?.hooks?.AfterModel?.[0]).toEqual({
      command: `${hookScriptPath} gemini`,
      type: "command",
    });
  });

  test("migrates legacy ATHRD global hook state before enabling the repo", () => {
    const repo = makeTempDir("athrd-enable-legacy-repo-");
    runGit(["init"], repo);

    const globalHooksDir = join(process.env.ATHRD_HOME!, "git-hooks");
    const statePath = join(globalHooksDir, "state.json");
    const legacyHookPath = join(globalHooksDir, "commit-msg");

    mkdirSync(globalHooksDir, { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          managedByAthrd: true,
          updatedGlobalHooksPath: true,
          previousHooksPath: null,
          targetHooksPath: globalHooksDir,
          backupHookPath: null,
        },
        null,
        2,
      ),
      "utf-8",
    );
    writeFileSync(
      legacyHookPath,
      "#!/bin/bash\n# ATHRD_MANAGED_COMMIT_MSG\nexit 0\n",
      "utf-8",
    );
    chmodSync(legacyHookPath, 0o755);
    runGit(["config", "--global", "core.hooksPath", globalHooksDir]);

    const result = enableAthrdForRepo(repo);

    expect(result.migratedLegacyGlobalHook).toBeTrue();
    expect(existsSync(statePath)).toBeFalse();
    expect(existsSync(legacyHookPath)).toBeFalse();
    expect(existsSync(join(repo, ".git", "hooks", "commit-msg"))).toBeTrue();
    expect(
      (() => {
        try {
          return runGit(["config", "--global", "--get", "core.hooksPath"]);
        } catch {
          return null;
        }
      })(),
    ).toBeNull();
  });
});
