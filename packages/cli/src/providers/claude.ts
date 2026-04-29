import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatSession } from "../types/index.js";
import { readJsonlFile } from "../utils/bun-parsing.js";
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

function getHomeDir(): string {
  return process.env.HOME || os.homedir();
}

export class ClaudeCodeProvider implements ChatProvider {
  readonly id = "claude";
  readonly name = "Claude";

  async install(context: ProviderInstallContext): Promise<ProviderActionResult> {
    const claudeConfigPath = path.join(
      context.homeDir,
      ".claude",
      "settings.json",
    );
    if (!fs.existsSync(claudeConfigPath)) {
      return {
        status: "skipped",
        message: `Claude config not found at ${claudeConfigPath}`,
      };
    }

    const config = context.readJsonObject(claudeConfigPath);

    if (!config.hooks) {
      config.hooks = {};
    }

    if (!config.hooks.Stop) {
      config.hooks.Stop = [];
    }

    const hasHook = config.hooks.Stop.some((hookGroup: any) =>
      hookGroup.matcher === "*" &&
      hookGroup.hooks?.some((hook: any) =>
        typeof hook.command === "string" &&
        hook.command.includes("hook.sh") &&
        hook.command.includes(" claude"),
      ),
    );

    if (hasHook) {
      return { status: "already_installed", message: "Claude hook is already installed" };
    }

    config.hooks.Stop.push({
      matcher: "*",
      hooks: [
        {
          type: "command",
          command: context.getProviderHookCommand(this.id),
        },
      ],
    });
    context.writeJsonObject(claudeConfigPath, config);

    return { status: "installed", message: "Claude hook installed" };
  }

  async uninstall(context: ProviderInstallContext): Promise<ProviderActionResult> {
    const claudeConfigPath = path.join(
      context.homeDir,
      ".claude",
      "settings.json",
    );
    if (!fs.existsSync(claudeConfigPath)) {
      return {
        status: "skipped",
        message: `Claude config not found at ${claudeConfigPath}`,
      };
    }

    const config = context.readJsonObject(claudeConfigPath);

    if (!config.hooks || !Array.isArray(config.hooks.Stop)) {
      return { status: "skipped", message: "Claude hook is not installed" };
    }

    const originalLength = config.hooks.Stop.length;
    config.hooks.Stop = config.hooks.Stop.filter((hookGroup: any) => {
      if (hookGroup.matcher !== "*") {
        return true;
      }

      const matchingHooks = hookGroup.hooks?.filter((hook: any) =>
        typeof hook.command === "string" &&
        hook.command.includes("hook.sh") &&
        hook.command.includes(" claude"),
      );
      return !matchingHooks || matchingHooks.length === 0;
    });

    if (config.hooks.Stop.length === originalLength) {
      return { status: "skipped", message: "Claude hook is not installed" };
    }

    context.writeJsonObject(claudeConfigPath, config);
    return { status: "uninstalled", message: "Claude hook removed" };
  }

  async list(_context?: ProviderListContext): Promise<ChatSession[]> {
    const claudeProjectsPath = path.join(getHomeDir(), ".claude", "projects");

    if (!fs.existsSync(claudeProjectsPath)) {
      return [];
    }

    const sessions: ChatSession[] = [];

    try {
      const projectDirs = fs.readdirSync(claudeProjectsPath);

      for (const projectDir of projectDirs) {
        const projectPath = path.join(claudeProjectsPath, projectDir);

        // Skip if not a directory
        if (!fs.statSync(projectPath).isDirectory()) {
          continue;
        }

        // List all JSONL files in the project directory
        const files = fs.readdirSync(projectPath);
        const agentFiles: Map<string, string[]> = new Map(); // sessionId -> agent file paths

        for (const file of files) {
          // UUID files are session files (look for UUID pattern: 8-4-4-4-12 hex digits)
          if (
            file.match(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i
            )
          ) {
            const filePath = path.join(projectPath, file);

            try {
              const entries = await readJsonlFile<any>(filePath, {
                skipInvalid: true,
              });

              const sessionId = file.replace(".jsonl", "");

              // Parse JSONL to find session metadata
              let aiTitle: string | undefined;
              let summary: string | undefined;
              let lastMessageDate: number = 0;
              let messageCount = 0;
              let firstUserMessage: string | undefined;

              for (const entry of entries) {
                // Get summary if available
                if (entry.type === "summary" && !summary) {
                  summary = entry.summary;
                }

                // Claude Code stores the generated thread title in ai-title events.
                if (entry.type === "ai-title") {
                  const title = this.extractAiTitle([entry], sessionId);
                  if (title) {
                    aiTitle = title;
                  }
                }

                // Capture first user message as fallback for title
                if (entry.type === "user" && !firstUserMessage) {
                  const message = entry.message;
                  if (message && message.content) {
                    firstUserMessage = message.content.substring(0, 60);
                  }
                }

                // Count messages and track latest timestamp
                if (entry.type === "user" || entry.type === "assistant") {
                  messageCount++;
                  if (entry.timestamp) {
                    const timestamp = new Date(entry.timestamp).getTime();
                    lastMessageDate = Math.max(lastMessageDate, timestamp);
                  }
                }
              }

              // Skip sessions with no messages
              if (messageCount === 0) {
                continue;
              }

              // Parse workspace path from project directory name
              // Claude stores paths like: -Users-youruser-code-athrd
              let workspacePath: string | undefined;
              let workspaceName: string | undefined;

              if (projectDir.startsWith("-")) {
                // Convert "-Users-youruser-code-athrd" to "/Users/youruser/code/athrd"
                workspacePath = projectDir
                  .replace(/^-/, "/")
                  .replace(/-/g, "/");
                workspaceName = path.basename(workspacePath);
              } else {
                // Fallback: use the last part of the directory name
                workspaceName = projectDir
                  .split("-")
                  .slice(-1)[0]
                  .split("/")
                  .pop();
              }

              // Use Claude's generated title if available, then fall back to older metadata.
              const title = aiTitle || summary || firstUserMessage || "Claude Chat";

              sessions.push({
                sessionId,
                creationDate: lastMessageDate,
                lastMessageDate,
                title,
                requestCount: messageCount,
                filePath,
                source: this.id,
                workspaceName,
                workspacePath,
                metadata: {
                  agentFiles: agentFiles.get(sessionId) || [],
                },
              });
            } catch (error) {
              // Skip files that can't be parsed
              continue;
            }
          }

          // Agent files (look for agent-XXXXXXXX pattern)
          if (file.match(/^agent-[0-9a-f]{8}\.jsonl$/i)) {
            const filePath = path.join(projectPath, file);
            try {
              const entries = await readJsonlFile<any>(filePath, {
                skipInvalid: true,
              });

              // Find which session this agent belongs to
              for (const entry of entries) {
                if (entry.sessionId) {
                  if (!agentFiles.has(entry.sessionId)) {
                    agentFiles.set(entry.sessionId, []);
                  }
                  agentFiles.get(entry.sessionId)!.push(filePath);
                  break; // Only need first entry to get sessionId
                }
              }
            } catch (error) {
              continue;
            }
          }
        }

        // Add agent files to sessions they belong to
        for (const session of sessions) {
          const sessionAgents = agentFiles.get(session.sessionId);
          if (sessionAgents) {
            session.metadata = {
              ...session.metadata,
              agentFiles: [...new Set(sessionAgents)], // Remove duplicates
            };
          }
        }
      }
    } catch (error) {
      // Ignore errors reading Claude projects directory
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

  private extractAiTitle(
    jsonlEntries: any[],
    sessionId?: string,
  ): string | undefined {
    let aiTitle: string | undefined;

    for (const entry of jsonlEntries) {
      if (entry?.type !== "ai-title" || typeof entry.aiTitle !== "string") {
        continue;
      }

      if (
        sessionId &&
        sessionId !== "unknown" &&
        typeof entry.sessionId === "string" &&
        entry.sessionId !== sessionId
      ) {
        continue;
      }

      const title = entry.aiTitle.trim();
      if (title) {
        aiTitle = title;
      }
    }

    return aiTitle;
  }
}
