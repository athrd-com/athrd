import chalk from "chalk";
import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { providers } from "../providers/index.js";
import type {
    ChatProvider,
    ProviderActionResult,
    ProviderInstallContext,
} from "../providers/base.js";
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
    console.log(chalk.green(`✓ Hook script created at ${hookScriptPath}`));
}

function removeHookScript() {
    const hookScriptPath = getHookScriptPath();
    if (fs.existsSync(hookScriptPath)) {
        fs.unlinkSync(hookScriptPath);
        console.log(chalk.green(`✓ Hook script removed from ${hookScriptPath}`));
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

function getProviderHookCommand(providerId: string) {
    return `bash ${shellQuote(getHookScriptPath())} ${providerId}`;
}

export function createProviderInstallContext(): ProviderInstallContext {
    return {
        homeDir: getHomeDir(),
        hookScriptPath: getHookScriptPath(),
        getProviderHookCommand,
        readJsonObject,
        writeJsonObject,
    };
}

function logProviderResult(
    provider: ChatProvider,
    result: ProviderActionResult,
) {
    const message = result.message || `${provider.name}: ${result.status}`;

    if (result.status === "installed" || result.status === "uninstalled") {
        console.log(chalk.green(`✓ ${message}`));
        return;
    }

    if (result.status === "already_installed") {
        console.log(chalk.blue(`ℹ ${message}`));
        return;
    }

    console.log(chalk.yellow(`- ${provider.name}: ${message}`));
}

export async function installAllHooks() {
    console.log(chalk.blue("Installing hooks..."));
    writeHookScript();

    const context = createProviderInstallContext();
    for (const provider of providers) {
        try {
            const result = await provider.install(context);
            logProviderResult(provider, result);
        } catch (err) {
            console.error(chalk.red(`Error installing ${provider.name} hook:`), err);
        }
    }

    try {
        installGlobalCommitMsgHook();
        console.log(chalk.green("✓ Global git commit-msg hook installed"));
    } catch (err) {
        console.error(chalk.red("Error installing global git commit-msg hook:"), err);
    }
    console.log(chalk.green("Hooks installation complete!"));
}

export async function uninstallAllHooks() {
    console.log(chalk.blue("Uninstalling hooks..."));
    removeHookScript();

    const context = createProviderInstallContext();
    for (const provider of providers) {
        try {
            const result = await provider.uninstall(context);
            logProviderResult(provider, result);
        } catch (err) {
            console.error(chalk.red(`Error uninstalling ${provider.name} hook:`), err);
        }
    }

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
        .action(async () => {
            await installAllHooks();
        });

    hooksCmd
        .command("uninstall")
        .description("Remove installed AI CLI hooks")
        .action(async () => {
            await uninstallAllHooks();
        });
}
