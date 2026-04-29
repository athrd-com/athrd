import { Database } from "bun:sqlite";
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

export class CodexProvider implements ChatProvider {
  readonly id = "codex";
  readonly name = "Codex";

  async install(context: ProviderInstallContext): Promise<ProviderActionResult> {
    const codexHooksPath = path.join(context.homeDir, ".codex", "hooks.json");
    const codexDir = path.dirname(codexHooksPath);
    if (!fs.existsSync(codexDir)) {
      return {
        status: "skipped",
        message: `Codex config dir not found at ${codexDir}`,
      };
    }

    const config = context.readJsonObject(codexHooksPath);

    if (config.hooks === undefined) {
      config.hooks = {};
    } else if (!this.isRecord(config.hooks)) {
      throw new Error(`${codexHooksPath} hooks must be an object.`);
    }

    if (config.hooks.Stop === undefined) {
      config.hooks.Stop = [];
    } else if (!Array.isArray(config.hooks.Stop)) {
      throw new Error(`${codexHooksPath} hooks.Stop must be an array.`);
    }

    const hasHook = config.hooks.Stop.some((hookGroup: any) =>
      Array.isArray(hookGroup?.hooks) &&
      hookGroup.hooks.some((hook: unknown) => this.isAthrdCodexHook(hook)),
    );

    if (hasHook) {
      return { status: "already_installed", message: "Codex hook is already installed" };
    }

    config.hooks.Stop.push({
      hooks: [
        {
          type: "command",
          command: context.getProviderHookCommand(this.id),
          timeout: 30,
        },
      ],
    });
    context.writeJsonObject(codexHooksPath, config);

    return { status: "installed", message: "Codex hook installed" };
  }

  async uninstall(context: ProviderInstallContext): Promise<ProviderActionResult> {
    const codexHooksPath = path.join(context.homeDir, ".codex", "hooks.json");
    if (!fs.existsSync(codexHooksPath)) {
      return { status: "skipped", message: "Codex hook is not installed" };
    }

    const config = context.readJsonObject(codexHooksPath);
    if (!this.isRecord(config.hooks) || !Array.isArray(config.hooks.Stop)) {
      return { status: "skipped", message: "Codex hook is not installed" };
    }

    let changed = false;
    config.hooks.Stop = config.hooks.Stop.flatMap((hookGroup: any) => {
      if (!this.isRecord(hookGroup) || !Array.isArray(hookGroup.hooks)) {
        return [hookGroup];
      }

      const hooks = hookGroup.hooks.filter(
        (hook: unknown) => !this.isAthrdCodexHook(hook),
      );
      if (hooks.length === hookGroup.hooks.length) {
        return [hookGroup];
      }

      changed = true;
      if (hooks.length === 0) {
        return [];
      }

      return [{ ...hookGroup, hooks }];
    });

    if (!changed) {
      return { status: "skipped", message: "Codex hook is not installed" };
    }

    context.writeJsonObject(codexHooksPath, config);
    return { status: "uninstalled", message: "Codex hook removed" };
  }

  async list(_context?: ProviderListContext): Promise<ChatSession[]> {
    const sessionsDir = path.join(os.homedir(), ".codex", "sessions");
    if (!fs.existsSync(sessionsDir)) {
      return [];
    }

    const sessions: ChatSession[] = [];

    const walk = async (dir: string): Promise<void> => {
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          await walk(fullPath);
        } else if (entry.endsWith(".jsonl")) {
          try {
            const entries = await readJsonlFile<any>(fullPath, {
              skipInvalid: true,
            });
            if (entries.length === 0) {
              continue;
            }

            const session = this.createSessionFromEntries(entries, fullPath);
            if (session) {
              sessions.push(session);
            }
          } catch {
            // skip unreadable or invalid files
          }
        }
      }
    };

    await walk(sessionsDir);
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

  private createSessionFromEntries(
    entries: any[],
    filePath: string,
  ): ChatSession | null {
    let sessionId: string | undefined;
    let workspacePath: string | undefined;
    let workspaceName: string | undefined;
    let firstUserMessage: string | undefined;
    let messageCount = 0;
    let earliestTimestamp = Number.POSITIVE_INFINITY;
    let latestTimestamp = 0;
    let codexMetadata: Record<string, any> | undefined;

    for (const entry of entries) {
      if (!sessionId) {
        if (entry?.type === "session_meta" && entry.payload?.id) {
          sessionId = entry.payload.id;
        } else if (entry?.id) {
          sessionId = entry.id;
        }
      }

      if (!workspacePath && entry?.type === "session_meta") {
        const cwd = entry.payload?.cwd;
        if (typeof cwd === "string" && cwd.length > 0) {
          workspacePath = cwd;
          workspaceName = path.basename(cwd);
        }

        const gitInfo = entry.payload?.git;
        const cliVersion = entry.payload?.cli_version;
        const originator = entry.payload?.originator;

        if (gitInfo || cliVersion || originator) {
          codexMetadata = {
            ...(codexMetadata || {}),
            git: gitInfo || codexMetadata?.git,
            cliVersion: cliVersion || codexMetadata?.cliVersion,
            originator: originator || codexMetadata?.originator,
          };
        }
      }

      const timestamp = this.extractTimestamp(entry);
      if (typeof timestamp === "number") {
        earliestTimestamp = Math.min(earliestTimestamp, timestamp);
        latestTimestamp = Math.max(latestTimestamp, timestamp);
      }

      const userMessage = this.extractUserMessage(entry);
      if (userMessage) {
        messageCount++;
        if (!firstUserMessage && userMessage.preview) {
          firstUserMessage = userMessage.preview.substring(0, 60);
        }
      }
    }

    if (messageCount === 0) {
      return null;
    }

    const creationDate = Number.isFinite(earliestTimestamp)
      ? earliestTimestamp
      : latestTimestamp || Date.now();
    const lastMessageDate = latestTimestamp || creationDate;

    const metadata = codexMetadata ? { codex: codexMetadata } : undefined;
    const resolvedSessionId = sessionId || path.basename(filePath, ".jsonl");
    const stateTitle = this.readThreadTitleFromSQLite(resolvedSessionId);

    return {
      sessionId: resolvedSessionId,
      creationDate,
      lastMessageDate,
      title: stateTitle || firstUserMessage || "Codex Chat",
      requestCount: messageCount,
      filePath,
      source: this.id,
      workspaceName,
      workspacePath,
      metadata,
    };
  }

  private readThreadTitleFromSQLite(threadId: string): string | undefined {
    const stateDbPath =
      process.env.ATHRD_CODEX_STATE_SQLITE ||
      path.join(os.homedir(), ".codex", "state.sqlite");

    if (!fs.existsSync(stateDbPath)) {
      return undefined;
    }

    let db: Database | undefined;

    try {
      db = new Database(stateDbPath, { readonly: true, create: false });
      const row = db
        .query(
          "SELECT title FROM threads WHERE id = ? AND title IS NOT NULL LIMIT 1",
        )
        .get(threadId) as { title?: unknown } | null;

      if (typeof row?.title !== "string") {
        return undefined;
      }

      const title = row.title.trim();
      return title || undefined;
    } catch {
      // Codex state is best-effort metadata. Keep session discovery working.
      return undefined;
    } finally {
      db?.close();
    }
  }

  private extractTimestamp(entry: any): number | undefined {
    const raw =
      entry?.timestamp ||
      entry?.payload?.timestamp ||
      entry?.ts ||
      entry?.message?.timestamp;

    if (!raw) {
      return undefined;
    }

    const value = new Date(raw).getTime();
    return Number.isNaN(value) ? undefined : value;
  }

  private extractUserMessage(entry: any): { preview?: string } | null {
    if (!entry) {
      return null;
    }

    if (
      entry.type === "event_msg" &&
      entry.payload?.type === "user_message" &&
      entry.payload?.kind !== "environment_context"
    ) {
      const preview = this.normalizePreview(entry.payload.message);
      return preview ? { preview } : null;
    }

    if (
      entry.type === "response_item" &&
      entry.payload?.type === "message" &&
      entry.payload.role === "user"
    ) {
      const preview = this.extractTextFromContent(entry.payload.content);
      return preview ? { preview } : null;
    }

    if (entry.type === "message" && entry.role === "user") {
      const preview = this.extractTextFromContent(entry.content);
      return preview ? { preview } : null;
    }

    if (entry.type === "user") {
      if (typeof entry.message === "string") {
        const preview = this.normalizePreview(entry.message);
        return preview ? { preview } : null;
      }

      if (entry.message?.content) {
        const preview = this.extractTextFromContent(entry.message.content);
        return preview ? { preview } : null;
      }
    }

    return null;
  }

  private extractTextFromContent(content: any): string | undefined {
    if (!content) {
      return undefined;
    }

    if (typeof content === "string") {
      return this.normalizePreview(content);
    }

    if (Array.isArray(content)) {
      const previews: string[] = [];
      for (const item of content) {
        if (typeof item === "string") {
          const preview = this.normalizePreview(item);
          if (preview) {
            previews.push(preview);
          }
        } else if (item && typeof item === "object") {
          const preview = this.extractTextFromContent(
            item.text ?? item.content,
          );
          if (preview) {
            previews.push(preview);
          }
        }
      }
      return previews.length > 0 ? previews.join("\n") : undefined;
    }

    if (typeof content === "object") {
      const previews: string[] = [];
      if (typeof content.text === "string") {
        const preview = this.normalizePreview(content.text);
        if (preview) {
          previews.push(preview);
        }
      }
      if (typeof content.message === "string") {
        const preview = this.normalizePreview(content.message);
        if (preview) {
          previews.push(preview);
        }
      }
      if (Array.isArray(content.content)) {
        const nested = this.extractTextFromContent(content.content);
        if (nested) {
          previews.push(nested);
        }
      }
      return previews.length > 0 ? previews.join("\n") : undefined;
    }

    return undefined;
  }

  private normalizePreview(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("<environment_context>")) {
      return undefined;
    }

    return trimmed;
  }

  private isAthrdCodexHook(hook: unknown): boolean {
    if (
      !this.isRecord(hook) ||
      hook.type !== "command" ||
      typeof hook.command !== "string"
    ) {
      return false;
    }

    return (
      hook.command.includes("hook.sh") &&
      /(^|[\s"'])codex($|[\s"'])/.test(hook.command)
    );
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
