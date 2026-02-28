import chalk from "chalk";
import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import toml from "@iarna/toml";
import {
    installGlobalCommitMsgHook,
    uninstallGlobalCommitMsgHook,
} from "../utils/git-hooks.js";

const homedir = os.homedir();
const athrdDir = path.join(homedir, ".athrd");
const hookScriptPath = path.join(athrdDir, "hook.sh");

const claudeConfigPath = path.join(homedir, ".claude", "settings.json");
const codexConfigPath = path.join(homedir, ".codex", "config.toml");
const geminiConfigPath = path.join(homedir, ".gemini", "settings.json");

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

async function ensureAthrdDir() {
    if (!fs.existsSync(athrdDir)) {
        fs.mkdirSync(athrdDir, { recursive: true });
    }
}

function writeHookScript() {
    ensureAthrdDir();
    fs.writeFileSync(hookScriptPath, hookScriptContent, { mode: 0o755 });
    console.log(
        chalk.green(`✓ Hook script created at ${hookScriptPath}`),
    );
}

function removeHookScript() {
    if (fs.existsSync(hookScriptPath)) {
        fs.unlinkSync(hookScriptPath);
        console.log(chalk.green(`✓ Hook script removed from ${hookScriptPath}`));
    }
}

function installClaudeHook() {
    try {
        if (!fs.existsSync(claudeConfigPath)) {
            console.log(
                chalk.yellow(`Claude config not found at ${claudeConfigPath}, skipping.`),
            );
            return;
        }

        const content = fs.readFileSync(claudeConfigPath, "utf-8");
        let config = JSON.parse(content);

        if (!config.hooks) {
            config.hooks = {};
        }

        if (!config.hooks.Stop) {
            config.hooks.Stop = [];
        }

        // Check if hook already exists
        const hasHook = config.hooks.Stop.some((hookGroup: any) =>
            hookGroup.matcher === "*" &&
            hookGroup.hooks?.some((h: any) => h.command && h.command.includes("hook.sh claude")),
        );

        if (!hasHook) {
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
            console.log(chalk.green(`✓ Claude hook installed`));
        } else {
            console.log(chalk.blue(`ℹ Claude hook is already installed`));
        }
    } catch (err) {
        console.error(chalk.red(`Error installing Claude hook:`), err);
    }
}

function uninstallClaudeHook() {
    try {
        if (!fs.existsSync(claudeConfigPath)) return;

        const content = fs.readFileSync(claudeConfigPath, "utf-8");
        let config = JSON.parse(content);

        if (config.hooks && config.hooks.Stop) {
            let originalLength = config.hooks.Stop.length;
            config.hooks.Stop = config.hooks.Stop.filter((hookGroup: any) => {
                if (hookGroup.matcher === "*") {
                    const matchingHooks = hookGroup.hooks?.filter((h: any) => h.command && h.command.includes("hook.sh claude"));
                    if (matchingHooks && matchingHooks.length > 0) return false; // remove this group entirely or filter its hooks
                }
                return true;
            });

            if (config.hooks.Stop.length < originalLength) {
                fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
                console.log(chalk.green(`✓ Claude hook removed`));
            }
        }
    } catch (err) {
        console.error(chalk.red(`Error uninstalling Claude hook:`), err);
    }
}

function installCodexHook() {
    try {
        const codexDir = path.dirname(codexConfigPath);
        if (!fs.existsSync(codexDir)) {
            console.log(
                chalk.yellow(`Codex config dir not found at ${codexDir}, skipping.`),
            );
            return;
        }

        let config: any = {};
        if (fs.existsSync(codexConfigPath)) {
            const content = fs.readFileSync(codexConfigPath, "utf-8");
            config = toml.parse(content);
        }

        const newNotify = ["bash", hookScriptPath, "codex"];
        if (!config.notify || JSON.stringify(config.notify) !== JSON.stringify(newNotify)) {
            config.notify = newNotify;
            fs.writeFileSync(codexConfigPath, toml.stringify(config));
            console.log(chalk.green(`✓ Codex hook installed`));
        } else {
            console.log(chalk.blue(`ℹ Codex hook is already installed`));
        }
    } catch (err) {
        console.error(chalk.red(`Error installing Codex hook:`), err);
    }
}

function uninstallCodexHook() {
    try {
        if (!fs.existsSync(codexConfigPath)) return;

        const content = fs.readFileSync(codexConfigPath, "utf-8");
        const config: any = toml.parse(content);

        if (config.notify && Array.isArray(config.notify) && config.notify.includes("codex")) {
            delete config.notify;
            fs.writeFileSync(codexConfigPath, toml.stringify(config));
            console.log(chalk.green(`✓ Codex hook removed`));
        }
    } catch (err) {
        console.error(chalk.red(`Error uninstalling Codex hook:`), err);
    }
}

function installGeminiHook() {
    try {
        if (!fs.existsSync(geminiConfigPath)) {
            console.log(
                chalk.yellow(`Gemini config not found at ${geminiConfigPath}, skipping.`),
            );
            return;
        }

        const content = fs.readFileSync(geminiConfigPath, "utf-8");
        let config = JSON.parse(content);

        if (!config.hooksConfig) {
            config.hooksConfig = { enabled: true, hooks: {} };
        }

        if (!config.hooksConfig.hooks) {
            config.hooksConfig.hooks = {};
        }

        if (!config.hooksConfig.hooks.AfterModel) {
            config.hooksConfig.hooks.AfterModel = [];
        }

        const hasHook = config.hooksConfig.hooks.AfterModel.some((h: any) =>
            h.type === "command" && h.command && h.command.includes("hook.sh gemini"),
        );

        if (!hasHook) {
            config.hooksConfig.hooks.AfterModel.push({
                type: "command",
                command: `${hookScriptPath} gemini`,
            });
            fs.writeFileSync(geminiConfigPath, JSON.stringify(config, null, 2));
            console.log(chalk.green(`✓ Gemini hook installed`));
        } else {
            console.log(chalk.blue(`ℹ Gemini hook is already installed`));
        }
    } catch (err) {
        console.error(chalk.red(`Error installing Gemini hook:`), err);
    }
}

function uninstallGeminiHook() {
    try {
        if (!fs.existsSync(geminiConfigPath)) return;

        const content = fs.readFileSync(geminiConfigPath, "utf-8");
        let config = JSON.parse(content);

        if (config.hooksConfig && config.hooksConfig.hooks && config.hooksConfig.hooks.AfterModel) {
            let originalLength = config.hooksConfig.hooks.AfterModel.length;
            config.hooksConfig.hooks.AfterModel = config.hooksConfig.hooks.AfterModel.filter(
                (h: any) => !(h.type === "command" && h.command && h.command.includes("hook.sh gemini"))
            );

            if (config.hooksConfig.hooks.AfterModel.length < originalLength) {
                fs.writeFileSync(geminiConfigPath, JSON.stringify(config, null, 2));
                console.log(chalk.green(`✓ Gemini hook removed`));
            }
        }
    } catch (err) {
        console.error(chalk.red(`Error uninstalling Gemini hook:`), err);
    }
}

export function installAllHooks() {
    console.log(chalk.blue("Installing hooks..."));
    writeHookScript();
    installClaudeHook();
    installCodexHook();
    installGeminiHook();
    try {
        installGlobalCommitMsgHook();
        console.log(chalk.green("✓ Global git commit-msg hook installed"));
    } catch (err) {
        console.error(chalk.red("Error installing global git commit-msg hook:"), err);
    }
    console.log(chalk.green("Hooks installation complete!"));
}

export function uninstallAllHooks() {
    console.log(chalk.blue("Uninstalling hooks..."));
    removeHookScript();
    uninstallClaudeHook();
    uninstallCodexHook();
    uninstallGeminiHook();
    try {
        uninstallGlobalCommitMsgHook();
        console.log(chalk.green("✓ Global git commit-msg hook removed"));
    } catch (err) {
        console.error(chalk.red("Error uninstalling global git commit-msg hook:"), err);
    }
    console.log(chalk.green("Hooks uninstallation complete!"));
}

export function hooksCommand(program: Command) {
    const hooksCmd = program
        .command("hooks")
        .description("Manage AI CLI hooks for automatic thread synchronization");

    hooksCmd
        .command("install")
        .description("Install hooks for supported AI CLIs (Claude, Codex, Gemini)")
        .action(() => {
            installAllHooks();
        });

    hooksCmd
        .command("uninstall")
        .description("Remove installed AI CLI hooks")
        .action(() => {
            uninstallAllHooks();
        });
}
