import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatSession } from "../types/index.js";
import { readJsonFile } from "../utils/bun-parsing.js";
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
   * Try to resolve workspace path from Gemini's SHA-256 hash directory name
   * Gemini encodes workspace paths as SHA-256 hashes
   */
  private resolveWorkspacePath(projectDirHash: string): string | undefined {
    // Try current working directory first
    const cwd = process.cwd();
    if (this.hashPath(cwd) === projectDirHash) {
      return cwd;
    }

    // Try common workspace locations
    const homeDir = os.homedir();
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
              this.hashPath(fullPath) === projectDirHash
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
    const geminiTmpPath = path.join(os.homedir(), ".gemini", "tmp");

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

        // Try to resolve the actual workspace path from the hash
        const workspacePath = this.resolveWorkspacePath(projectDir);
        const workspaceName = workspacePath
          ? path.basename(workspacePath)
          : "Gemini";

        const chatsPath = path.join(projectPath, "chats");

        if (fs.existsSync(chatsPath) && fs.statSync(chatsPath).isDirectory()) {
          try {
            const chatFiles = fs.readdirSync(chatsPath);

            for (const chatFile of chatFiles) {
              if (!chatFile.endsWith(".json")) {
                continue;
              }

              if (chatFile === "logs.json") {
                continue;
              }

              const filePath = path.join(chatsPath, chatFile);
              try {
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
                    if (msg.content) {
                      firstUserMessage = msg.content.substring(0, 60);
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
