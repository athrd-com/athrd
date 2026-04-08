import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
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

    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(join(home, ".gemini", "settings.json"), "{}", "utf-8");

    enableAthrdForRepo(repo);

    const hookScriptPath = join(process.env.ATHRD_HOME!, "hook.sh");
    const repoHookPath = join(repo, ".git", "hooks", "commit-msg");
    const repoCodexConfigPath = join(repo, ".codex", "config.toml");
    const repoCodexHooksPath = join(repo, ".codex", "hooks.json");

    expect(existsSync(hookScriptPath)).toBeTrue();
    expect(existsSync(repoHookPath)).toBeTrue();
    expect(existsSync(repoCodexConfigPath)).toBeTrue();
    expect(existsSync(repoCodexHooksPath)).toBeTrue();

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
      readFileSync(repoCodexConfigPath, "utf-8"),
    ) as {
      features?: Record<string, unknown>;
    };
    expect(codexConfig.features?.codex_hooks).toBeTrue();

    const codexHooks = JSON.parse(
      readFileSync(repoCodexHooksPath, "utf-8"),
    ) as {
      hooks?: {
        Stop?: Array<{ hooks?: Array<{ command?: string; type?: string }> }>;
      };
    };
    expect(codexHooks.hooks?.Stop?.[0]?.hooks?.[0]).toEqual({
      command: `bash '${hookScriptPath}' codex`,
      type: "command",
    });

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

  test("preserves existing repo codex config and appends the ATHRD stop hook once", () => {
    const repo = makeTempDir("athrd-enable-codex-repo-");
    runGit(["init"], repo);
    mkdirSync(join(repo, ".codex"), { recursive: true });

    writeFileSync(
      join(repo, ".codex", "config.toml"),
      [
        'model = "gpt-5.4"',
        "",
        "[features]",
        "shell_snapshot = true",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repo, ".codex", "hooks.json"),
      JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command: "echo existing-stop-hook",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    enableAthrdForRepo(repo);
    enableAthrdForRepo(repo);

    const codexConfig = toml.parse(
      readFileSync(join(repo, ".codex", "config.toml"), "utf-8"),
    ) as {
      model?: string;
      features?: Record<string, unknown>;
    };
    expect(codexConfig.model).toBe("gpt-5.4");
    expect(codexConfig.features?.shell_snapshot).toBeTrue();
    expect(codexConfig.features?.codex_hooks).toBeTrue();

    const codexHooks = JSON.parse(
      readFileSync(join(repo, ".codex", "hooks.json"), "utf-8"),
    ) as {
      hooks?: {
        Stop?: Array<{ hooks?: Array<{ command?: string; type?: string }> }>;
      };
    };

    const stopCommands =
      codexHooks.hooks?.Stop?.flatMap((group) =>
        group.hooks?.map((hook) => hook.command || "") || [],
      ) || [];
    expect(
      stopCommands.filter((command) => command === "echo existing-stop-hook"),
    ).toHaveLength(1);
    expect(
      stopCommands.filter((command) => command.includes("hook.sh") && command.includes(" codex")),
    ).toHaveLength(1);
  });
});
