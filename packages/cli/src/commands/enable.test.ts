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

function getHookCommands(groups?: Array<{ hooks?: Array<{ command?: string }> }>): string[] {
  return (
    groups?.flatMap((group) =>
      group.hooks?.map((hook) => hook.command || "") || [],
    ) || []
  );
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
  test("installs a home-scoped hook script, repo-local provider configs, and gitignore entries", () => {
    const home = process.env.HOME!;
    const repo = makeTempDir("athrd-enable-repo-");
    runGit(["init"], repo);

    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".codex"), { recursive: true });
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      'model = "gpt-5.4"\n',
      "utf-8",
    );

    const { repoRoot, installedProviders } = enableAthrdForRepo(repo);

    const homeHookPath = join(process.env.ATHRD_HOME!, "hook.sh");
    const repoHookPath = join(repo, ".athrd", "hook.sh");
    const repoCommitHookPath = join(repo, ".git", "hooks", "commit-msg");
    const repoGitignorePath = join(repo, ".gitignore");
    const repoClaudeConfigPath = join(repo, ".claude", "settings.json");
    const repoCodexConfigPath = join(repo, ".codex", "config.toml");
    const repoCodexHooksPath = join(repo, ".codex", "hooks.json");
    const repoGeminiConfigPath = join(repo, ".gemini", "settings.json");
    const homeCodexConfigPath = join(home, ".codex", "config.toml");

    expect(existsSync(homeHookPath)).toBeTrue();
    expect(existsSync(repoHookPath)).toBeFalse();
    expect(existsSync(repoCommitHookPath)).toBeTrue();
    expect(existsSync(repoClaudeConfigPath)).toBeTrue();
    expect(existsSync(repoCodexConfigPath)).toBeTrue();
    expect(existsSync(repoCodexHooksPath)).toBeTrue();
    expect(existsSync(repoGeminiConfigPath)).toBeTrue();
    expect(installedProviders).toEqual(["claude", "codex", "gemini"]);

    const gitignoreContent = readFileSync(repoGitignorePath, "utf-8");
    expect(gitignoreContent).toContain(".claude/");
    expect(gitignoreContent).toContain(".codex/");
    expect(gitignoreContent).toContain(".gemini/");

    const claudeConfig = JSON.parse(
      readFileSync(repoClaudeConfigPath, "utf-8"),
    ) as {
      hooks?: {
        Stop?: Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>;
      };
    };
    const claudeCommands = getHookCommands(claudeConfig.hooks?.Stop);
    expect(claudeCommands).toHaveLength(1);
    expect(claudeCommands[0]).toContain('ATHRD_HOME:-$HOME/.athrd');
    expect(claudeCommands[0]).toContain('"$HOOK" claude');
    expect(claudeCommands[0]).toContain("claude");

    const repoCodexConfig = toml.parse(
      readFileSync(repoCodexConfigPath, "utf-8"),
    ) as {
      features?: Record<string, unknown>;
    };
    expect(repoCodexConfig.features?.codex_hooks).toBeTrue();

    const homeCodexConfig = toml.parse(
      readFileSync(homeCodexConfigPath, "utf-8"),
    ) as {
      model?: string;
      projects?: Record<string, { trust_level?: string }>;
    };
    expect(homeCodexConfig.model).toBe("gpt-5.4");
    expect(homeCodexConfig.projects?.[repoRoot]?.trust_level).toBe("trusted");

    const codexHooks = JSON.parse(
      readFileSync(repoCodexHooksPath, "utf-8"),
    ) as {
      hooks?: {
        Stop?: Array<{ hooks?: Array<{ command?: string; type?: string }> }>;
      };
    };
    const codexCommands = getHookCommands(codexHooks.hooks?.Stop);
    expect(codexCommands).toHaveLength(1);
    expect(codexCommands[0]).toContain('ATHRD_HOME:-$HOME/.athrd');
    expect(codexCommands[0]).toContain("codex");

    const geminiConfig = JSON.parse(
      readFileSync(repoGeminiConfigPath, "utf-8"),
    ) as {
      hooks?: {
        AfterModel?: Array<{
          matcher?: string;
          hooks?: Array<{ command?: string; type?: string }>;
        }>;
      };
      hooksConfig?: {
        enabled?: boolean;
      };
    };
    expect(geminiConfig.hooksConfig?.enabled).toBeTrue();
    expect(geminiConfig.hooks?.AfterModel?.[0]?.matcher).toBe("*");
    expect(geminiConfig.hooks?.AfterModel?.[0]?.hooks?.[0]?.command).toContain(
      'ATHRD_HOME:-$HOME/.athrd',
    );
    expect(geminiConfig.hooks?.AfterModel?.[0]?.hooks?.[0]?.command).toContain(
      "gemini",
    );
  });

  test("preserves existing repo-local provider config and stays idempotent", () => {
    const home = process.env.HOME!;
    const repo = makeTempDir("athrd-enable-existing-repo-");
    runGit(["init"], repo);

    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".codex"), { recursive: true });
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(
      join(repo, ".gitignore"),
      [".claude/", "node_modules/"].join("\n") + "\n",
      "utf-8",
    );

    mkdirSync(join(repo, ".claude"), { recursive: true });
    writeFileSync(
      join(repo, ".claude", "settings.json"),
      JSON.stringify(
        {
          theme: "light",
          hooks: {
            Stop: [
              {
                matcher: "*",
                hooks: [
                  {
                    type: "command",
                    command: "echo existing-claude-hook",
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
                    command: "echo existing-codex-hook",
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

    mkdirSync(join(repo, ".gemini"), { recursive: true });
    writeFileSync(
      join(repo, ".gemini", "settings.json"),
      JSON.stringify(
        {
          general: {
            preferredEditor: "vscode",
          },
          hooksConfig: {
            enabled: false,
            disabled: ["custom-hook"],
          },
          hooks: {
            AfterModel: [
              {
                matcher: "*",
                hooks: [
                  {
                    type: "command",
                    command: "echo existing-gemini-hook",
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

    const claudeConfig = JSON.parse(
      readFileSync(join(repo, ".claude", "settings.json"), "utf-8"),
    ) as {
      theme?: string;
      hooks?: {
        Stop?: Array<{ hooks?: Array<{ command?: string }> }>;
      };
    };
    expect(claudeConfig.theme).toBe("light");
    const claudeCommands = getHookCommands(claudeConfig.hooks?.Stop);
    expect(
      claudeCommands.filter((command) => command === "echo existing-claude-hook"),
    ).toHaveLength(1);
    expect(
      claudeCommands.filter(
        (command) =>
          command.includes('ATHRD_HOME:-$HOME/.athrd') &&
          command.includes("claude"),
      ),
    ).toHaveLength(1);

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
        Stop?: Array<{ hooks?: Array<{ command?: string }> }>;
      };
    };
    const codexCommands = getHookCommands(codexHooks.hooks?.Stop);
    expect(
      codexCommands.filter((command) => command === "echo existing-codex-hook"),
    ).toHaveLength(1);
    expect(
      codexCommands.filter(
        (command) =>
          command.includes('ATHRD_HOME:-$HOME/.athrd') &&
          command.includes("codex"),
      ),
    ).toHaveLength(1);

    const geminiConfig = JSON.parse(
      readFileSync(join(repo, ".gemini", "settings.json"), "utf-8"),
    ) as {
      general?: {
        preferredEditor?: string;
      };
      hooks?: {
        AfterModel?: Array<{ hooks?: Array<{ command?: string }> }>;
      };
      hooksConfig?: {
        enabled?: boolean;
        disabled?: string[];
      };
    };
    expect(geminiConfig.general?.preferredEditor).toBe("vscode");
    expect(geminiConfig.hooksConfig?.enabled).toBeTrue();
    expect(geminiConfig.hooksConfig?.disabled).toEqual(["custom-hook"]);
    const geminiCommands = getHookCommands(geminiConfig.hooks?.AfterModel);
    expect(
      geminiCommands.filter((command) => command === "echo existing-gemini-hook"),
    ).toHaveLength(1);
    expect(
      geminiCommands.filter(
        (command) =>
          command.includes('ATHRD_HOME:-$HOME/.athrd') &&
          command.includes("gemini"),
      ),
    ).toHaveLength(1);

    const gitignoreContent = readFileSync(join(repo, ".gitignore"), "utf-8");
    expect(gitignoreContent.match(/^\.claude\/$/gm)?.length).toBe(1);
    expect(gitignoreContent.match(/^\.codex\/$/gm)?.length).toBe(1);
    expect(gitignoreContent.match(/^\.gemini\/$/gm)?.length).toBe(1);
    expect(gitignoreContent).toContain("node_modules/");
  });

  test("removes legacy home-scoped provider hooks while preserving unrelated settings", () => {
    const home = process.env.HOME!;
    const repo = makeTempDir("athrd-enable-migrate-repo-");
    runGit(["init"], repo);

    mkdirSync(join(home, ".athrd"), { recursive: true });
    writeFileSync(join(home, ".athrd", "hook.sh"), "#!/bin/sh\n", "utf-8");

    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                matcher: "*",
                hooks: [
                  {
                    type: "command",
                    command: `${join(home, ".athrd", "hook.sh")} claude`,
                  },
                  {
                    type: "command",
                    command: "echo keep-claude-hook",
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

    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      toml.stringify({
        model: "gpt-5.4",
        notify: ["bash", join(home, ".athrd", "hook.sh"), "codex"],
      } as any),
      "utf-8",
    );

    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(
      join(home, ".gemini", "settings.json"),
      JSON.stringify(
        {
          hooksConfig: {
            enabled: true,
            hooks: {
              AfterModel: [
                {
                  matcher: "*",
                  hooks: [
                    {
                      type: "command",
                      command: `${join(home, ".athrd", "hook.sh")} gemini`,
                    },
                    {
                      type: "command",
                      command: "echo keep-gemini-hook",
                    },
                  ],
                },
              ],
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { repoRoot } = enableAthrdForRepo(repo);

    const claudeConfig = JSON.parse(
      readFileSync(join(home, ".claude", "settings.json"), "utf-8"),
    ) as {
      hooks?: {
        Stop?: Array<{ hooks?: Array<{ command?: string }> }>;
      };
    };
    expect(getHookCommands(claudeConfig.hooks?.Stop)).toEqual([
      "echo keep-claude-hook",
    ]);

    const codexConfig = toml.parse(
      readFileSync(join(home, ".codex", "config.toml"), "utf-8"),
    ) as {
      model?: string;
      notify?: string[];
      projects?: Record<string, { trust_level?: string }>;
    };
    expect(codexConfig.model).toBe("gpt-5.4");
    expect(codexConfig.notify).toBeUndefined();
    expect(codexConfig.projects?.[repoRoot]?.trust_level).toBe("trusted");

    const geminiConfig = JSON.parse(
      readFileSync(join(home, ".gemini", "settings.json"), "utf-8"),
    ) as {
      hooksConfig?: {
        hooks?: {
          AfterModel?: Array<{ hooks?: Array<{ command?: string }> }>;
        };
      };
    };
    expect(
      getHookCommands(geminiConfig.hooksConfig?.hooks?.AfterModel),
    ).toEqual(["echo keep-gemini-hook"]);
  });

  test("only installs providers whose home directories exist and ignores only those directories", () => {
    const home = process.env.HOME!;
    const repo = makeTempDir("athrd-enable-selective-repo-");
    runGit(["init"], repo);

    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      'model = "gpt-5.4"\n',
      "utf-8",
    );

    const { installedProviders } = enableAthrdForRepo(repo);

    expect(installedProviders).toEqual(["codex"]);
    expect(existsSync(join(repo, ".claude", "settings.json"))).toBeFalse();
    expect(existsSync(join(repo, ".codex", "config.toml"))).toBeTrue();
    expect(existsSync(join(repo, ".codex", "hooks.json"))).toBeTrue();
    expect(existsSync(join(repo, ".gemini", "settings.json"))).toBeFalse();

    const gitignoreContent = readFileSync(join(repo, ".gitignore"), "utf-8");
    expect(gitignoreContent).toContain(".codex/");
    expect(gitignoreContent).not.toContain(".claude/");
    expect(gitignoreContent).not.toContain(".gemini/");
  });
});
