import toml from "@iarna/toml";
import chalk from "chalk";
import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { installRepoCommitMsgHook } from "../utils/git-hooks.js";

export interface EnableAthrdResult {
  repoRoot: string;
  installedProviders: ProviderId[];
}

type ProviderId = "claude" | "codex" | "gemini";

interface HookCommand extends Record<string, unknown> {
  command?: string;
  type?: string;
}

interface HookGroup extends Record<string, unknown> {
  hooks?: HookCommand[];
  matcher?: string;
}

interface ClaudeSettings extends Record<string, unknown> {
  hooks?: Record<string, unknown> & {
    Stop?: HookGroup[];
  };
}

interface CodexHooksConfig extends Record<string, unknown> {
  hooks?: Record<string, unknown> & {
    Stop?: HookGroup[];
  };
}

interface GeminiSettings extends Record<string, unknown> {
  hooks?: Record<string, unknown> & {
    AfterModel?: HookGroup[];
  };
  hooksConfig?: Record<string, unknown> & {
    enabled?: boolean;
    hooks?: Record<string, unknown> & {
      AfterModel?: HookGroup[];
    };
  };
}

const hookScriptContent = `#!/bin/sh
# ATHRD_MANAGED_PROVIDER_HOOK
PROVIDER=$1

INPUT=$(cat 2>/dev/null || true)
EVENT_JSON="$INPUT"

# Legacy Codex notify hooks pass the payload as the second argument.
if [ "$PROVIDER" = "codex" ] && [ -n "$2" ]; then
  EVENT_JSON="$2"
fi

if [ -z "$EVENT_JSON" ]; then
  exit 0
fi

if ! command -v athrd >/dev/null 2>&1; then
  exit 0
fi

athrd share --mark --json "$EVENT_JSON" "--$PROVIDER" >/dev/null 2>&1 &
exit 0
`;

function getHomeDir(): string {
  return process.env.HOME || os.homedir();
}

function getAthrdDir(): string {
  if (process.env.ATHRD_HOME) {
    return process.env.ATHRD_HOME;
  }
  return path.join(getHomeDir(), ".athrd");
}

function getHomeHookScriptPath(): string {
  return path.join(getAthrdDir(), "hook.sh");
}

function getClaudeProjectConfigPath(repoRoot: string): string {
  return path.join(repoRoot, ".claude", "settings.json");
}

function getCodexProjectDir(repoRoot: string): string {
  return path.join(repoRoot, ".codex");
}

function getCodexProjectConfigPath(repoRoot: string): string {
  return path.join(getCodexProjectDir(repoRoot), "config.toml");
}

function getCodexProjectHooksPath(repoRoot: string): string {
  return path.join(getCodexProjectDir(repoRoot), "hooks.json");
}

function getGeminiProjectConfigPath(repoRoot: string): string {
  return path.join(repoRoot, ".gemini", "settings.json");
}

function getClaudeHomeConfigPath(): string {
  return path.join(getHomeDir(), ".claude", "settings.json");
}

function getClaudeHomeDir(): string {
  return path.join(getHomeDir(), ".claude");
}

function getCodexHomeConfigPath(): string {
  return path.join(getHomeDir(), ".codex", "config.toml");
}

function getCodexHomeDir(): string {
  return path.join(getHomeDir(), ".codex");
}

function getGeminiHomeConfigPath(): string {
  return path.join(getHomeDir(), ".gemini", "settings.json");
}

function getGeminiHomeDir(): string {
  return path.join(getHomeDir(), ".gemini");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFile<T extends Record<string, unknown>>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    return {} as T;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON config at ${filePath}: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Expected JSON object at ${filePath}`);
  }

  return parsed as T;
}

function writeJsonFile(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readTomlFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const parsed = toml.parse(fs.readFileSync(filePath, "utf-8"));
    if (!isRecord(parsed)) {
      throw new Error("Expected TOML root table");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse TOML config at ${filePath}: ${message}`);
  }
}

function writeTomlFile(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, toml.stringify(value as any));
}

function buildRepoHookCommand(provider: ProviderId): string {
  return `HOOK="\${ATHRD_HOME:-$HOME/.athrd}/hook.sh"; [ -x "$HOOK" ] || exit 0; "$HOOK" ${provider}`;
}

function isAthrdManagedProviderCommand(
  command: unknown,
  provider: ProviderId,
): boolean {
  return (
    typeof command === "string" &&
    command.includes("hook.sh") &&
    command.includes(provider) &&
    (
      command.includes(".athrd/hook.sh") ||
      command.includes("ATHRD_HOME") ||
      command.includes("$HOME/.athrd")
    )
  );
}

function stripManagedHookCommands(
  groups: HookGroup[] | undefined,
  provider: ProviderId,
): { groups: HookGroup[]; removed: boolean } {
  let removed = false;

  const nextGroups = (groups || []).reduce<HookGroup[]>((result, group) => {
    if (!Array.isArray(group.hooks)) {
      result.push(group);
      return result;
    }

    const hooks = group.hooks.filter((hook) => {
      const isManaged = isAthrdManagedProviderCommand(hook.command, provider);
      if (isManaged) {
        removed = true;
      }
      return !isManaged;
    });

    if (hooks.length > 0 || group.hooks.length === 0) {
      result.push({
        ...group,
        hooks,
      });
    }

    return result;
  }, []);

  return {
    groups: nextGroups,
    removed,
  };
}

function createMatcherGroup(
  provider: ProviderId,
  matcher = "*",
): HookGroup {
  return {
    matcher,
    hooks: [
      {
        type: "command",
        command: buildRepoHookCommand(provider),
      },
    ],
  };
}

function createCodexStopGroup(): HookGroup {
  return {
    hooks: [
      {
        type: "command",
        command: buildRepoHookCommand("codex"),
      },
    ],
  };
}

function writeHomeHookScript(): void {
  const hookScriptPath = getHomeHookScriptPath();
  fs.mkdirSync(path.dirname(hookScriptPath), { recursive: true });
  fs.writeFileSync(hookScriptPath, hookScriptContent, { mode: 0o755 });
  console.log(chalk.green(`✓ Hook script created at ${hookScriptPath}`));
}

function ensureGitignoreEntries(repoRoot: string, providers: ProviderId[]): void {
  if (providers.length === 0) {
    return;
  }

  const gitignorePath = path.join(repoRoot, ".gitignore");
  const existingContent = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf-8")
    : "";
  const normalizedContent = existingContent.replace(/\r\n/g, "\n");
  const existingLines = new Set(normalizedContent.split("\n"));
  const entries = providers.map((provider) => `.${provider}/`);
  const missingEntries = entries.filter((entry) => !existingLines.has(entry));

  if (missingEntries.length === 0) {
    return;
  }

  let nextContent = normalizedContent;
  if (nextContent.length > 0 && !nextContent.endsWith("\n")) {
    nextContent += "\n";
  }
  if (nextContent.length > 0 && !nextContent.endsWith("\n\n")) {
    nextContent += "\n";
  }
  nextContent += missingEntries.join("\n");
  nextContent += "\n";

  fs.writeFileSync(gitignorePath, nextContent);
  console.log(
    chalk.green(`✓ Updated .gitignore with ${missingEntries.join(", ")}`),
  );
}

function hasProviderHomeDir(provider: ProviderId): boolean {
  const providerHomeDir =
    provider === "claude"
      ? getClaudeHomeDir()
      : provider === "codex"
        ? getCodexHomeDir()
        : getGeminiHomeDir();

  try {
    return fs.statSync(providerHomeDir).isDirectory();
  } catch {
    return false;
  }
}

function removeLegacyClaudeHomeHook(): void {
  const claudeConfigPath = getClaudeHomeConfigPath();
  if (!fs.existsSync(claudeConfigPath)) {
    return;
  }

  const config = readJsonFile<ClaudeSettings>(claudeConfigPath);
  if (!config.hooks) {
    return;
  }

  const stopGroups = Array.isArray(config.hooks.Stop) ? config.hooks.Stop : [];
  const { groups, removed } = stripManagedHookCommands(stopGroups, "claude");
  if (!removed) {
    return;
  }

  if (groups.length > 0) {
    config.hooks.Stop = groups;
  } else {
    delete config.hooks.Stop;
  }

  if (Object.keys(config.hooks).length === 0) {
    delete config.hooks;
  }

  writeJsonFile(claudeConfigPath, config);
  console.log(chalk.green("✓ Removed legacy Claude home hook"));
}

function updateCodexHomeConfig(repoRoot: string): void {
  const codexConfigPath = getCodexHomeConfigPath();
  const config = readTomlFile(codexConfigPath);
  let changed = false;

  if (
    Array.isArray(config.notify) &&
    config.notify.some((entry) => typeof entry === "string" && entry.includes(".athrd/hook.sh")) &&
    config.notify.some((entry) => entry === "codex")
  ) {
    delete config.notify;
    changed = true;
  }

  const existingProjects = isRecord(config.projects)
    ? (config.projects as Record<string, unknown>)
    : {};
  if (!isRecord(config.projects)) {
    config.projects = existingProjects;
    changed = true;
  }

  const existingProjectConfig = isRecord(existingProjects[repoRoot])
    ? (existingProjects[repoRoot] as Record<string, unknown>)
    : {};
  if (!isRecord(existingProjects[repoRoot])) {
    existingProjects[repoRoot] = existingProjectConfig;
    changed = true;
  }

  if (existingProjectConfig.trust_level !== "trusted") {
    existingProjectConfig.trust_level = "trusted";
    existingProjects[repoRoot] = existingProjectConfig;
    changed = true;
  }

  if (changed || !fs.existsSync(codexConfigPath)) {
    writeTomlFile(codexConfigPath, config);
  }

  if (changed) {
    console.log(chalk.green("✓ Updated Codex home config for project trust"));
  }
}

function removeLegacyGeminiHooksFromConfig(config: GeminiSettings): boolean {
  let changed = false;

  if (config.hooks) {
    const afterModelGroups = Array.isArray(config.hooks.AfterModel)
      ? config.hooks.AfterModel
      : [];
    const { groups, removed } = stripManagedHookCommands(afterModelGroups, "gemini");
    if (removed) {
      changed = true;
      if (groups.length > 0) {
        config.hooks.AfterModel = groups;
      } else {
        delete config.hooks.AfterModel;
      }
    }

    if (Object.keys(config.hooks).length === 0) {
      delete config.hooks;
      changed = true;
    }
  }

  if (config.hooksConfig?.hooks) {
    const afterModelGroups = Array.isArray(config.hooksConfig.hooks.AfterModel)
      ? config.hooksConfig.hooks.AfterModel
      : [];
    const { groups, removed } = stripManagedHookCommands(afterModelGroups, "gemini");
    if (removed) {
      changed = true;
      if (groups.length > 0) {
        config.hooksConfig.hooks.AfterModel = groups;
      } else {
        delete config.hooksConfig.hooks.AfterModel;
      }
    }

    if (Object.keys(config.hooksConfig.hooks).length === 0) {
      delete config.hooksConfig.hooks;
      changed = true;
    }
  }

  if (config.hooksConfig && Object.keys(config.hooksConfig).length === 0) {
    delete config.hooksConfig;
    changed = true;
  }

  return changed;
}

function removeLegacyGeminiHomeHook(): void {
  const geminiConfigPath = getGeminiHomeConfigPath();
  if (!fs.existsSync(geminiConfigPath)) {
    return;
  }

  const config = readJsonFile<GeminiSettings>(geminiConfigPath);
  if (!removeLegacyGeminiHooksFromConfig(config)) {
    return;
  }

  writeJsonFile(geminiConfigPath, config);
  console.log(chalk.green("✓ Removed legacy Gemini home hook"));
}

function installClaudeHook(repoRoot: string): void {
  const claudeConfigPath = getClaudeProjectConfigPath(repoRoot);
  const config = readJsonFile<ClaudeSettings>(claudeConfigPath);

  if (!config.hooks) {
    config.hooks = {};
  }

  const stopGroups = Array.isArray(config.hooks.Stop) ? config.hooks.Stop : [];
  const { groups } = stripManagedHookCommands(stopGroups, "claude");
  config.hooks.Stop = [...groups, createMatcherGroup("claude")];

  writeJsonFile(claudeConfigPath, config);
  console.log(chalk.green("✓ Claude project hook enabled"));
}

function installCodexHook(repoRoot: string): void {
  const codexConfigPath = getCodexProjectConfigPath(repoRoot);
  const codexHooksPath = getCodexProjectHooksPath(repoRoot);

  const config = readTomlFile(codexConfigPath);
  const existingFeatures = isRecord(config.features)
    ? (config.features as Record<string, unknown>)
    : {};
  config.features = {
    ...existingFeatures,
    codex_hooks: true,
  };
  writeTomlFile(codexConfigPath, config);
  console.log(chalk.green("✓ Codex project config enabled"));

  const hooksConfig = readJsonFile<CodexHooksConfig>(codexHooksPath);
  if (!hooksConfig.hooks) {
    hooksConfig.hooks = {};
  }

  const stopGroups = Array.isArray(hooksConfig.hooks.Stop)
    ? hooksConfig.hooks.Stop
    : [];
  const { groups } = stripManagedHookCommands(stopGroups, "codex");
  hooksConfig.hooks.Stop = [...groups, createCodexStopGroup()];

  writeJsonFile(codexHooksPath, hooksConfig);
  console.log(chalk.green("✓ Codex stop hook enabled"));
}

function installGeminiHook(repoRoot: string): void {
  const geminiConfigPath = getGeminiProjectConfigPath(repoRoot);
  const config = readJsonFile<GeminiSettings>(geminiConfigPath);

  if (!config.hooksConfig) {
    config.hooksConfig = {};
  }
  config.hooksConfig.enabled = true;

  removeLegacyGeminiHooksFromConfig(config);

  if (!config.hooks) {
    config.hooks = {};
  }

  const afterModelGroups = Array.isArray(config.hooks.AfterModel)
    ? config.hooks.AfterModel
    : [];
  const { groups } = stripManagedHookCommands(afterModelGroups, "gemini");
  config.hooks.AfterModel = [...groups, createMatcherGroup("gemini")];

  writeJsonFile(geminiConfigPath, config);
  console.log(chalk.green("✓ Gemini project hook enabled"));
}

export function installAiCliHooks(repoRoot: string): ProviderId[] {
  writeHomeHookScript();
  const installedProviders: ProviderId[] = [];

  if (hasProviderHomeDir("claude")) {
    installClaudeHook(repoRoot);
    removeLegacyClaudeHomeHook();
    installedProviders.push("claude");
  } else {
    console.log(
      chalk.yellow(`Claude home dir not found at ${getClaudeHomeDir()}, skipping.`),
    );
  }

  if (hasProviderHomeDir("codex")) {
    installCodexHook(repoRoot);
    updateCodexHomeConfig(repoRoot);
    installedProviders.push("codex");
  } else {
    console.log(
      chalk.yellow(`Codex home dir not found at ${getCodexHomeDir()}, skipping.`),
    );
  }

  if (hasProviderHomeDir("gemini")) {
    installGeminiHook(repoRoot);
    removeLegacyGeminiHomeHook();
    installedProviders.push("gemini");
  } else {
    console.log(
      chalk.yellow(`Gemini home dir not found at ${getGeminiHomeDir()}, skipping.`),
    );
  }

  ensureGitignoreEntries(repoRoot, installedProviders);
  return installedProviders;
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

  const installedProviders = installAiCliHooks(gitHookResult.repoRoot);
  console.log(chalk.green("ATHRD enable complete!"));

  return {
    repoRoot: gitHookResult.repoRoot,
    installedProviders,
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
