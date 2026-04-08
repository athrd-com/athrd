import toml from "@iarna/toml";
import chalk from "chalk";
import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { installRepoCommitMsgHook } from "../utils/git-hooks.js";

export interface EnableAthrdResult {
  repoRoot: string;
}

function getHomeDir(): string {
  return process.env.HOME || os.homedir();
}

function getAthrdDir(): string {
  if (process.env.ATHRD_HOME) {
    return process.env.ATHRD_HOME;
  }
  return path.join(getHomeDir(), ".athrd");
}

function getHookScriptPath(): string {
  return path.join(getAthrdDir(), "hook.sh");
}

function getClaudeConfigPath(): string {
  return path.join(getHomeDir(), ".claude", "settings.json");
}

function getCodexConfigPath(): string {
  return path.join(getHomeDir(), ".codex", "config.toml");
}

function getGeminiConfigPath(): string {
  return path.join(getHomeDir(), ".gemini", "settings.json");
}

const hookScriptContent = `#!/bin/bash
PROVIDER=$1

INPUT=$(cat)
EVENT_JSON="$INPUT"

# Codex sends hook data as the second argument, not stdin.
if [ "$PROVIDER" = "codex" ] && [ -n "$2" ]; then
    EVENT_JSON="$2"
fi

if [ -n "$EVENT_JSON" ]; then
    athrd share --mark --json "$EVENT_JSON" "--$PROVIDER" >/dev/null 2>&1 &
fi
`;

function ensureAthrdDir(): void {
  fs.mkdirSync(getAthrdDir(), { recursive: true });
}

function writeHookScript(): void {
  const hookScriptPath = getHookScriptPath();
  ensureAthrdDir();
  fs.writeFileSync(hookScriptPath, hookScriptContent, { mode: 0o755 });
  console.log(chalk.green(`✓ Hook script created at ${hookScriptPath}`));
}

function installClaudeHook(): void {
  const claudeConfigPath = getClaudeConfigPath();
  const hookScriptPath = getHookScriptPath();

  try {
    if (!fs.existsSync(claudeConfigPath)) {
      console.log(
        chalk.yellow(`Claude config not found at ${claudeConfigPath}, skipping.`),
      );
      return;
    }

    const content = fs.readFileSync(claudeConfigPath, "utf-8");
    const config = JSON.parse(content) as {
      hooks?: {
        Stop?: Array<{
          matcher?: string;
          hooks?: Array<{ command?: string; type?: string }>;
        }>;
      };
    };

    if (!config.hooks) {
      config.hooks = {};
    }

    if (!config.hooks.Stop) {
      config.hooks.Stop = [];
    }

    const hasHook = config.hooks.Stop.some(
      (hookGroup) =>
        hookGroup.matcher === "*" &&
        hookGroup.hooks?.some((hook) =>
          hook.command?.includes("hook.sh claude"),
        ),
    );

    if (hasHook) {
      console.log(chalk.blue("ℹ Claude hook is already installed"));
      return;
    }

    config.hooks.Stop.push({
      matcher: "*",
      hooks: [
        {
          type: "command",
          command: `${hookScriptPath} claude`,
        },
      ],
    });
    fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
    console.log(chalk.green("✓ Claude hook installed"));
  } catch (error) {
    console.error(chalk.red("Error installing Claude hook:"), error);
  }
}

function installCodexHook(): void {
  const codexConfigPath = getCodexConfigPath();
  const hookScriptPath = getHookScriptPath();

  try {
    const codexDir = path.dirname(codexConfigPath);
    if (!fs.existsSync(codexDir)) {
      console.log(
        chalk.yellow(`Codex config dir not found at ${codexDir}, skipping.`),
      );
      return;
    }

    let config: { notify?: string[] } = {};
    if (fs.existsSync(codexConfigPath)) {
      config = toml.parse(fs.readFileSync(codexConfigPath, "utf-8")) as {
        notify?: string[];
      };
    }

    const newNotify = ["bash", hookScriptPath, "codex"];
    if (JSON.stringify(config.notify) === JSON.stringify(newNotify)) {
      console.log(chalk.blue("ℹ Codex hook is already installed"));
      return;
    }

    config.notify = newNotify;
    fs.writeFileSync(codexConfigPath, toml.stringify(config));
    console.log(chalk.green("✓ Codex hook installed"));
  } catch (error) {
    console.error(chalk.red("Error installing Codex hook:"), error);
  }
}

function installGeminiHook(): void {
  const geminiConfigPath = getGeminiConfigPath();
  const hookScriptPath = getHookScriptPath();

  try {
    if (!fs.existsSync(geminiConfigPath)) {
      console.log(
        chalk.yellow(`Gemini config not found at ${geminiConfigPath}, skipping.`),
      );
      return;
    }

    const content = fs.readFileSync(geminiConfigPath, "utf-8");
    const config = JSON.parse(content) as {
      hooksConfig?: {
        enabled?: boolean;
        hooks?: {
          AfterModel?: Array<{ command?: string; type?: string }>;
        };
      };
    };

    if (!config.hooksConfig) {
      config.hooksConfig = { enabled: true, hooks: {} };
    }

    if (!config.hooksConfig.hooks) {
      config.hooksConfig.hooks = {};
    }

    if (!config.hooksConfig.hooks.AfterModel) {
      config.hooksConfig.hooks.AfterModel = [];
    }

    const hasHook = config.hooksConfig.hooks.AfterModel.some(
      (hook) =>
        hook.type === "command" && hook.command?.includes("hook.sh gemini"),
    );

    if (hasHook) {
      console.log(chalk.blue("ℹ Gemini hook is already installed"));
      return;
    }

    config.hooksConfig.hooks.AfterModel.push({
      type: "command",
      command: `${hookScriptPath} gemini`,
    });
    fs.writeFileSync(geminiConfigPath, JSON.stringify(config, null, 2));
    console.log(chalk.green("✓ Gemini hook installed"));
  } catch (error) {
    console.error(chalk.red("Error installing Gemini hook:"), error);
  }
}

export function installAiCliHooks(): void {
  writeHookScript();
  installClaudeHook();
  installCodexHook();
  installGeminiHook();
}

export function enableAthrdForRepo(cwd = process.cwd()): EnableAthrdResult {
  console.log(chalk.blue("Enabling ATHRD for this repository..."));

  const gitHookResult = installRepoCommitMsgHook(cwd);
  if (gitHookResult.installedCommitMsgHook) {
    console.log(
      chalk.green(`✓ Repo git commit-msg hook installed at ${gitHookResult.hookPath}`),
    );
  } else {
    console.log(chalk.blue("ℹ Repo git commit-msg hook is already installed"));
  }

  installAiCliHooks();
  console.log(chalk.green("ATHRD enable complete!"));

  return {
    repoRoot: gitHookResult.repoRoot,
  };
}

export function enableCommand(program: Command): void {
  program
    .command("enable")
    .description("Enable ATHRD for the current repository")
    .action(() => {
      try {
        enableAthrdForRepo();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(chalk.red("Failed to enable ATHRD:"), message);
        process.exit(1);
      }
    });
}
