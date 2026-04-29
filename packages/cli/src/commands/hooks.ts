import chalk from "chalk";
import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    installGlobalCommitMsgHook,
    uninstallGlobalCommitMsgHook,
} from "../utils/git-hooks.js";

function getAthrdDir() {
    return path.join(getHomeDir(), ".athrd");
}

function getHookScriptPath() {
    return path.join(getAthrdDir(), "hook.sh");
}

function getClaudeConfigPath() {
    return path.join(getHomeDir(), ".claude", "settings.json");
}

function getCodexHooksPath() {
    return path.join(getHomeDir(), ".codex", "hooks.json");
}

function getGeminiConfigPath() {
    return path.join(getHomeDir(), ".gemini", "settings.json");
}

function getHomeDir() {
    return process.env.HOME || os.homedir();
}

const hookScriptContent = `#!/bin/bash
PROVIDER=$1

INPUT=$(cat)
EVENT_JSON="$INPUT"

# Most providers send hook JSON on stdin. Legacy Codex notify hooks sent
# hook data as the second argument, so keep that fallback for older installs.
if [ "$PROVIDER" = "codex" ] && [ -n "$2" ]; then
    EVENT_JSON="$2"
fi

if [ -n "$EVENT_JSON" ]; then
    athrd share --mark --json "$EVENT_JSON" "--$PROVIDER" >/dev/null 2>&1 &
fi
`;

function ensureAthrdDir() {
    const athrdDir = getAthrdDir();
    if (!fs.existsSync(athrdDir)) {
        fs.mkdirSync(athrdDir, { recursive: true });
    }
}

function writeHookScript() {
    const hookScriptPath = getHookScriptPath();
    ensureAthrdDir();
    fs.writeFileSync(hookScriptPath, hookScriptContent, { mode: 0o755 });
    console.log(
        chalk.green(`✓ Hook script created at ${hookScriptPath}`),
    );
}

function removeHookScript() {
    const hookScriptPath = getHookScriptPath();
    if (fs.existsSync(hookScriptPath)) {
        fs.unlinkSync(hookScriptPath);
        console.log(chalk.green(`✓ Hook script removed from ${hookScriptPath}`));
    }
}

function installClaudeHook() {
    try {
        const claudeConfigPath = getClaudeConfigPath();
        const hookScriptPath = getHookScriptPath();
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
        const claudeConfigPath = getClaudeConfigPath();
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

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, any> {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const content = fs.readFileSync(filePath, "utf-8");
    if (content.trim().length === 0) {
        return {};
    }

    const config = JSON.parse(content);
    if (!isRecord(config)) {
        throw new Error(`${filePath} must contain a JSON object.`);
    }

    return config;
}

function writeJsonObject(filePath: string, value: Record<string, any>) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

function getCodexHookCommand() {
    return `bash ${shellQuote(getHookScriptPath())} codex`;
}

function isAthrdCodexHook(hook: unknown): boolean {
    if (!isRecord(hook) || hook.type !== "command" || typeof hook.command !== "string") {
        return false;
    }

    return hook.command.includes("hook.sh") && /(^|[\s"'])codex($|[\s"'])/.test(hook.command);
}

export function installCodexHook() {
    try {
        const codexHooksPath = getCodexHooksPath();
        const codexDir = path.dirname(codexHooksPath);
        if (!fs.existsSync(codexDir)) {
            console.log(
                chalk.yellow(`Codex config dir not found at ${codexDir}, skipping.`),
            );
            return;
        }

        const config = readJsonObject(codexHooksPath);

        if (config.hooks === undefined) {
            config.hooks = {};
        } else if (!isRecord(config.hooks)) {
            throw new Error(`${codexHooksPath} hooks must be an object.`);
        }

        if (config.hooks.Stop === undefined) {
            config.hooks.Stop = [];
        } else if (!Array.isArray(config.hooks.Stop)) {
            throw new Error(`${codexHooksPath} hooks.Stop must be an array.`);
        }

        const hasHook = config.hooks.Stop.some((hookGroup: any) =>
            Array.isArray(hookGroup?.hooks) && hookGroup.hooks.some(isAthrdCodexHook),
        );

        if (!hasHook) {
            config.hooks.Stop.push({
                hooks: [
                    {
                        type: "command",
                        command: getCodexHookCommand(),
                        timeout: 30,
                    },
                ],
            });
            writeJsonObject(codexHooksPath, config);
            console.log(chalk.green(`✓ Codex hook installed`));
        } else {
            console.log(chalk.blue(`ℹ Codex hook is already installed`));
        }
    } catch (err) {
        console.error(chalk.red(`Error installing Codex hook:`), err);
    }
}

export function uninstallCodexHook() {
    try {
        const codexHooksPath = getCodexHooksPath();
        if (!fs.existsSync(codexHooksPath)) return;

        const config = readJsonObject(codexHooksPath);
        if (!isRecord(config.hooks) || !Array.isArray(config.hooks.Stop)) {
            return;
        }

        let changed = false;
        config.hooks.Stop = config.hooks.Stop.flatMap((hookGroup: any) => {
            if (!isRecord(hookGroup) || !Array.isArray(hookGroup.hooks)) {
                return [hookGroup];
            }

            const hooks = hookGroup.hooks.filter((hook: unknown) => !isAthrdCodexHook(hook));
            if (hooks.length === hookGroup.hooks.length) {
                return [hookGroup];
            }

            changed = true;
            if (hooks.length === 0) {
                return [];
            }

            return [{ ...hookGroup, hooks }];
        });

        if (changed) {
            writeJsonObject(codexHooksPath, config);
            console.log(chalk.green(`✓ Codex hook removed`));
        }
    } catch (err) {
        console.error(chalk.red(`Error uninstalling Codex hook:`), err);
    }
}

function installGeminiHook() {
    try {
        const geminiConfigPath = getGeminiConfigPath();
        const hookScriptPath = getHookScriptPath();
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
        const geminiConfigPath = getGeminiConfigPath();
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
