import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatSession } from "../types/index.js";
import { readJsonFile, readJsonlFile } from "../utils/bun-parsing.js";
import {
  ChatProvider,
  getDefaultProviderThreadMetadata,
  parseRawSessionFile,
  ProviderActionResult,
  ProviderInstallContext,
  ProviderListContext,
  ProviderMetadataContext,
  ProviderParseResult,
  ProviderThreadMetadata,
} from "./base.js";

export class GeminiProvider implements ChatProvider {
  readonly id = "gemini";
  readonly name = "Gemini";

  async install(context: ProviderInstallContext): Promise<ProviderActionResult> {
    const geminiConfigPath = path.join(
      context.homeDir,
      ".gemini",
      "settings.json",
    );
    if (!fs.existsSync(geminiConfigPath)) {
      return {
        status: "skipped",
        message: `Gemini config not found at ${geminiConfigPath}`,
      };
    }

    const config = context.readJsonObject(geminiConfigPath);

    if (!config.hooksConfig) {
      config.hooksConfig = { enabled: true, hooks: {} };
    }

    if (!config.hooksConfig.hooks) {
      config.hooksConfig.hooks = {};
    }

    if (!config.hooksConfig.hooks.AfterModel) {
      config.hooksConfig.hooks.AfterModel = [];
    }

    const hasHook = config.hooksConfig.hooks.AfterModel.some((hook: any) =>
      hook.type === "command" &&
      typeof hook.command === "string" &&
      hook.command.includes("hook.sh") &&
      hook.command.includes(" gemini"),
    );

    if (hasHook) {
      return { status: "already_installed", message: "Gemini hook is already installed" };
    }

    config.hooksConfig.hooks.AfterModel.push({
      type: "command",
      command: context.getProviderHookCommand(this.id),
    });
    context.writeJsonObject(geminiConfigPath, config);

    return { status: "installed", message: "Gemini hook installed" };
  }

  async uninstall(context: ProviderInstallContext): Promise<ProviderActionResult> {
    const geminiConfigPath = path.join(
      context.homeDir,
      ".gemini",
      "settings.json",
    );
    if (!fs.existsSync(geminiConfigPath)) {
      return {
        status: "skipped",
        message: `Gemini config not found at ${geminiConfigPath}`,
      };
    }

    const config = context.readJsonObject(geminiConfigPath);
    const afterModelHooks = config.hooksConfig?.hooks?.AfterModel;
    if (!Array.isArray(afterModelHooks)) {
      return { status: "skipped", message: "Gemini hook is not installed" };
    }

    const originalLength = afterModelHooks.length;
    config.hooksConfig.hooks.AfterModel = afterModelHooks.filter(
      (hook: any) =>
        !(
          hook.type === "command" &&
          typeof hook.command === "string" &&
          hook.command.includes("hook.sh") &&
          hook.command.includes(" gemini")
        ),
    );

    if (config.hooksConfig.hooks.AfterModel.length === originalLength) {
      return { status: "skipped", message: "Gemini hook is not installed" };
    }

    context.writeJsonObject(geminiConfigPath, config);
    return { status: "uninstalled", message: "Gemini hook removed" };
  }

  /**
   * Try to resolve workspace path from Gemini's SHA-256 projectHash
   * Gemini encodes workspace paths as SHA-256 hashes
   */
  private resolveWorkspacePath(
    projectHash: string,
    candidatePaths: string[] = [],
  ): string | undefined {
    for (const candidatePath of candidatePaths) {
      if (this.hashPath(candidatePath) === projectHash) {
        return candidatePath;
      }
    }

    // Try current working directory first
    const cwd = process.cwd();
    if (this.hashPath(cwd) === projectHash) {
      return cwd;
    }

    // Try common workspace locations
    const homeDir = this.getHomeDir();
    const commonPaths = [
      path.join(homeDir, "code"),
      path.join(homeDir, "projects"),
      path.join(homeDir, "workspace"),
      path.join(homeDir, "dev"),
      path.join(homeDir, "Documents"),
    ];

    // Scan common workspace directories
    for (const basePath of commonPaths) {
      if (fs.existsSync(basePath)) {
        try {
          const entries = fs.readdirSync(basePath);
          for (const entry of entries) {
            const fullPath = path.join(basePath, entry);
            if (
              fs.statSync(fullPath).isDirectory() &&
              this.hashPath(fullPath) === projectHash
            ) {
              return fullPath;
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }
    }

    return undefined;
  }

  private hashPath(dirPath: string): string {
    return crypto.createHash("sha256").update(dirPath).digest("hex");
  }

  async list(_context?: ProviderListContext): Promise<ChatSession[]> {
    const geminiTmpPath = path.join(this.getGeminiHomeDir(), "tmp");

    if (!fs.existsSync(geminiTmpPath)) {
      return [];
    }

    const sessions: ChatSession[] = [];

    try {
      const projectDirs = fs.readdirSync(geminiTmpPath);

      for (const projectDir of projectDirs) {
        const projectPath = path.join(geminiTmpPath, projectDir);

        // Skip if not a directory
        if (!fs.statSync(projectPath).isDirectory()) {
          continue;
        }

        const chatsPath = path.join(projectPath, "chats");

        if (fs.existsSync(chatsPath) && fs.statSync(chatsPath).isDirectory()) {
          try {
            const chatFiles = fs.readdirSync(chatsPath);

            for (const chatFile of chatFiles) {
              if (!chatFile.endsWith(".json") && !chatFile.endsWith(".jsonl")) {
                continue;
              }

              if (chatFile === "logs.json") {
                continue;
              }

              const filePath = path.join(chatsPath, chatFile);
              try {
                if (chatFile.endsWith(".jsonl")) {
                  const session = await this.createJsonlSession(
                    filePath,
                    chatFile,
                    projectDir,
                    projectPath,
                  );
                  if (session) {
                    sessions.push(session);
                  }
                  continue;
                }

                const sessionData = await readJsonFile<any>(filePath);

                if (
                  !sessionData.messages ||
                  !Array.isArray(sessionData.messages)
                ) {
                  continue;
                }

                const messages = sessionData.messages;
                if (messages.length === 0) {
                  continue;
                }

                const projectHash =
                  typeof sessionData.projectHash === "string"
                    ? sessionData.projectHash
                    : undefined;
                const projectRoot = this.readVerifiedProjectRoot(
                  projectPath,
                  projectHash,
                );
                const workspacePath = projectHash
                  ? this.resolveWorkspacePath(
                      projectHash,
                      projectRoot ? [projectRoot] : [],
                    )
                  : projectRoot ?? this.resolveWorkspacePath(projectDir);
                const workspaceName = workspacePath
                  ? path.basename(workspacePath)
                  : this.getFallbackWorkspaceName(projectDir);

                // Find first user message for title
                let firstUserMessage = "Gemini Chat";
                let lastMessageDate = 0;

                if (sessionData.lastUpdated) {
                  lastMessageDate = new Date(sessionData.lastUpdated).getTime();
                } else if (sessionData.startTime) {
                  lastMessageDate = new Date(sessionData.startTime).getTime();
                }

                for (const msg of messages) {
                  if (msg.timestamp) {
                    const timestamp = new Date(msg.timestamp).getTime();
                    lastMessageDate = Math.max(lastMessageDate, timestamp);
                  }

                  if (
                    msg.type === "user" &&
                    firstUserMessage === "Gemini Chat"
                  ) {
                    const preview = this.extractTextFromContent(msg.content);
                    if (preview) {
                      firstUserMessage = preview.substring(0, 60);
                    }
                  }
                }

                sessions.push({
                  sessionId:
                    sessionData.sessionId || chatFile.replace(".json", ""),
                  creationDate: sessionData.startTime
                    ? new Date(sessionData.startTime).getTime()
                    : lastMessageDate,
                  lastMessageDate,
                  title: firstUserMessage,
                  requestCount: messages.length,
                  filePath: filePath,
                  source: this.id,
                  workspaceName,
                  workspacePath,
                });
              } catch (error) {
                // Skip invalid JSON
                continue;
              }
            }
          } catch (error) {
            // Ignore errors reading chats directory
          }
        }
      }
    } catch (error) {
      // Ignore errors reading Gemini directory
    }

    return sessions;
  }

  private async createJsonlSession(
    filePath: string,
    chatFile: string,
    projectDir: string,
    projectPath: string,
  ): Promise<ChatSession | null> {
    const entries = await readJsonlFile<any>(filePath, { skipInvalid: true });
    if (entries.length === 0) {
      return null;
    }

    const sessionEntry = entries.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.sessionId === "string",
    );
    const sessionId =
      sessionEntry?.sessionId || chatFile.replace(/\.jsonl$/i, "");
    const projectHash =
      typeof sessionEntry?.projectHash === "string"
        ? sessionEntry.projectHash
        : undefined;
    const projectRoot = this.readVerifiedProjectRoot(projectPath, projectHash);
    const workspacePath = projectHash
      ? this.resolveWorkspacePath(
          projectHash,
          projectRoot ? [projectRoot] : [],
        )
      : projectRoot ?? this.resolveWorkspacePath(projectDir);
    const workspaceName = workspacePath
      ? path.basename(workspacePath)
      : this.getFallbackWorkspaceName(projectDir);

    let firstUserMessage: string | undefined;
    let messageCount = 0;
    const seenMessageIds = new Set<string>();
    let earliestTimestamp = Number.POSITIVE_INFINITY;
    let latestTimestamp = 0;

    for (const entry of entries) {
      const timestamp = this.extractTimestamp(entry);
      if (typeof timestamp === "number") {
        earliestTimestamp = Math.min(earliestTimestamp, timestamp);
        latestTimestamp = Math.max(latestTimestamp, timestamp);
      }

      if (entry?.$set?.lastUpdated) {
        const lastUpdated = new Date(entry.$set.lastUpdated).getTime();
        if (!Number.isNaN(lastUpdated)) {
          latestTimestamp = Math.max(latestTimestamp, lastUpdated);
        }
      }

      if (entry?.type !== "user" && entry?.type !== "gemini") {
        continue;
      }

      const messageId =
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id
          : undefined;
      if (!messageId || !seenMessageIds.has(messageId)) {
        messageCount++;
      }
      if (messageId) {
        seenMessageIds.add(messageId);
      }

      if (entry.type === "user" && !firstUserMessage) {
        firstUserMessage = this.extractTextFromContent(entry.content);
      }
    }

    if (messageCount === 0) {
      return null;
    }

    const creationDate = Number.isFinite(earliestTimestamp)
      ? earliestTimestamp
      : latestTimestamp || Date.now();
    const lastMessageDate = latestTimestamp || creationDate;

    return {
      sessionId,
      creationDate,
      lastMessageDate,
      title: firstUserMessage?.substring(0, 60) || "Gemini Chat",
      requestCount: messageCount,
      filePath,
      source: this.id,
      workspaceName,
      workspacePath,
    };
  }

  private extractTimestamp(entry: any): number | undefined {
    const raw = entry?.timestamp || entry?.startTime || entry?.lastUpdated;
    if (!raw) {
      return undefined;
    }

    const timestamp = new Date(raw).getTime();
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  private extractTextFromContent(content: any): string | undefined {
    if (typeof content === "string") {
      return this.normalizePreview(content);
    }

    if (Array.isArray(content)) {
      const parts = content
        .map((item) => this.extractTextFromContent(item))
        .filter((part): part is string => Boolean(part));
      return parts.length > 0 ? parts.join("\n") : undefined;
    }

    if (content && typeof content === "object") {
      return this.extractTextFromContent(content.text ?? content.content);
    }

    return undefined;
  }

  private normalizePreview(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private getFallbackWorkspaceName(projectDir: string): string {
    return /^[a-f0-9]{64}$/i.test(projectDir) ? "Gemini" : projectDir;
  }

  private readVerifiedProjectRoot(
    projectPath: string,
    projectHash?: string,
  ): string | undefined {
    const projectRootPath = path.join(projectPath, ".project_root");
    if (!fs.existsSync(projectRootPath)) {
      return undefined;
    }

    try {
      const projectRoot = fs.readFileSync(projectRootPath, "utf-8").trim();
      if (!projectRoot) {
        return undefined;
      }

      if (projectHash && this.hashPath(projectRoot) !== projectHash) {
        return undefined;
      }

      return projectRoot;
    } catch {
      return undefined;
    }
  }

  private getGeminiHomeDir(): string {
    return process.env.GEMINI_HOME || path.join(this.getHomeDir(), ".gemini");
  }

  private getHomeDir(): string {
    return process.env.HOME || os.homedir();
  }

  async parse(session: ChatSession): Promise<ProviderParseResult> {
    return parseRawSessionFile(session);
  }

  async getMetadata(
    session: ChatSession,
    _context: ProviderMetadataContext,
  ): Promise<ProviderThreadMetadata> {
    return getDefaultProviderThreadMetadata(this, session);
  }
}
