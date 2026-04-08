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

function getAthrdDir(): string {
  if (process.env.ATHRD_HOME) {
    return process.env.ATHRD_HOME;
  }
  const homeDir = process.env.HOME || os.homedir();
  return path.join(homeDir, ".athrd");
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

function writeHookScript(): void {
  const athrdDir = getAthrdDir();
  const hookScriptPath = path.join(athrdDir, "hook.sh");
  fs.mkdirSync(athrdDir, { recursive: true });
  fs.writeFileSync(hookScriptPath, hookScriptContent, { mode: 0o755 });
  console.log(chalk.green(`✓ Hook script created at ${hookScriptPath}`));
}

function installClaudeHook(): void {
  const homeDir = process.env.HOME || os.homedir();
  const claudeConfigPath = path.join(homeDir, ".claude", "settings.json");
  const hookScriptPath = path.join(getAthrdDir(), "hook.sh");

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

function installCodexHook(repoRoot: string): void {
  const repoCodexDir = path.join(repoRoot, ".codex");
  const codexConfigPath = path.join(repoCodexDir, "config.toml");
  const codexHooksPath = path.join(repoCodexDir, "hooks.json");
  const hookScriptPath = path.join(getAthrdDir(), "hook.sh");
  const quotedHookScriptPath = hookScriptPath.replace(/'/g, `'\"'\"'`);
  const hookCommand = `bash '${quotedHookScriptPath}' codex`;

  try {
    fs.mkdirSync(repoCodexDir, { recursive: true });

    let config: Record<string, unknown> = {};
    if (fs.existsSync(codexConfigPath)) {
      config = toml.parse(
        fs.readFileSync(codexConfigPath, "utf-8"),
      ) as Record<string, unknown>;
    }

    const existingFeatures =
      (config.features as Record<string, unknown> | undefined) || {};
    const codexHooksAlreadyEnabled = existingFeatures.codex_hooks === true;

    config.features = {
      ...existingFeatures,
      codex_hooks: true,
    };

    if (!codexHooksAlreadyEnabled) {
      fs.writeFileSync(codexConfigPath, toml.stringify(config as any));
      console.log(chalk.green("✓ Codex project config enabled"));
    } else if (!fs.existsSync(codexConfigPath)) {
      fs.writeFileSync(codexConfigPath, toml.stringify(config as any));
      console.log(chalk.green("✓ Codex project config enabled"));
    } else {
      fs.writeFileSync(codexConfigPath, toml.stringify(config as any));
    }

    let hooksConfig: {
      hooks?: Record<
        string,
        Array<{
          matcher?: string;
          hooks?: Array<Record<string, unknown>>;
        }>
      >;
    } = {};
    if (fs.existsSync(codexHooksPath)) {
      hooksConfig = JSON.parse(fs.readFileSync(codexHooksPath, "utf-8")) as {
        hooks?: Record<
          string,
          Array<{
            matcher?: string;
            hooks?: Array<Record<string, unknown>>;
          }>
        >;
      };
    }

    if (!hooksConfig.hooks) {
      hooksConfig.hooks = {};
    }

    if (!hooksConfig.hooks.Stop) {
      hooksConfig.hooks.Stop = [];
    }

    const hasHook = hooksConfig.hooks.Stop.some((group) =>
      group.hooks?.some(
        (hook) =>
          hook.type === "command" &&
          typeof hook.command === "string" &&
          hook.command === hookCommand,
      ),
    );

    if (hasHook) {
      fs.writeFileSync(codexHooksPath, JSON.stringify(hooksConfig, null, 2));
      console.log(chalk.blue("ℹ Codex hook is already installed"));
      return;
    }

    hooksConfig.hooks.Stop.push({
      hooks: [
        {
          type: "command",
          command: hookCommand,
        },
      ],
    });
    fs.writeFileSync(codexHooksPath, JSON.stringify(hooksConfig, null, 2));
    console.log(chalk.green("✓ Codex hook installed"));
  } catch (error) {
    console.error(chalk.red("Error installing Codex hook:"), error);
  }
}

function installGeminiHook(): void {
  const homeDir = process.env.HOME || os.homedir();
  const geminiConfigPath = path.join(homeDir, ".gemini", "settings.json");
  const hookScriptPath = path.join(getAthrdDir(), "hook.sh");

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

export function installAiCliHooks(repoRoot: string): void {
  writeHookScript();
  installClaudeHook();
  installCodexHook(repoRoot);
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

  installAiCliHooks(gitHookResult.repoRoot);
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
