import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatSession } from "../types/index.js";
import { ChatProvider } from "./base.js";

export class CodexProvider implements ChatProvider {
  readonly id = "codex";
  readonly name = "Codex";

  async findSessions(): Promise<ChatSession[]> {
    const sessionsDir = path.join(os.homedir(), ".codex", "sessions");
    if (!fs.existsSync(sessionsDir)) {
      return [];
    }

    const sessions: ChatSession[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          walk(fullPath);
        } else if (entry.endsWith(".jsonl")) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const entries = this.parseJSONL(content);
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

    walk(sessionsDir);
    return sessions;
  }

  async parseSession(session: ChatSession): Promise<any> {
    const content = fs.readFileSync(session.filePath, "utf-8");
    const entries = this.parseJSONL(content);
    const [first, ...rest] = entries;
    return { sessionId: session.sessionId, ...first, messages: rest };
  }

  private createSessionFromEntries(
    entries: any[],
    filePath: string
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

    return {
      sessionId: sessionId || path.basename(filePath, ".jsonl"),
      creationDate,
      lastMessageDate,
      customTitle: firstUserMessage || "Codex Chat",
      requestCount: messageCount,
      filePath,
      source: this.id,
      workspaceName,
      workspacePath,
      metadata,
    };
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

  private extractUserMessage(
    entry: any
  ): { preview?: string } | null {
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
      for (const item of content) {
        if (typeof item === "string") {
          const preview = this.normalizePreview(item);
          if (preview) {
            return preview;
          }
        } else if (item && typeof item === "object") {
          const preview = this.extractTextFromContent(item.text ?? item.content);
          if (preview) {
            return preview;
          }
        }
      }
      return undefined;
    }

    if (typeof content === "object") {
      if (typeof content.text === "string") {
        return this.normalizePreview(content.text);
      }
      if (typeof content.message === "string") {
        return this.normalizePreview(content.message);
      }
      if (Array.isArray(content.content)) {
        return this.extractTextFromContent(content.content);
      }
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

  private parseJSONL(content: string): any[] {
    return content
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((e): e is any => e !== null);
  }
}
