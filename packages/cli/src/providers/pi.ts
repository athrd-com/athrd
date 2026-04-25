import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatSession } from "../types/index.js";
import { ChatProvider } from "./base.js";

export class PiProvider implements ChatProvider {
  readonly id = "pi";
  readonly name = "Pi";

  async findSessions(): Promise<ChatSession[]> {
    const sessionsDir = this.getSessionsDir();
    if (!fs.existsSync(sessionsDir)) {
      return [];
    }

    const sessions: ChatSession[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
          continue;
        }

        if (!entry.endsWith(".jsonl")) {
          continue;
        }

        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const entries = this.parseJSONL(content);
          const session = this.createSessionFromEntries(entries, fullPath);
          if (session) {
            sessions.push(session);
          }
        } catch {
          // Skip unreadable or malformed session files.
        }
      }
    };

    walk(sessionsDir);
    return sessions;
  }

  async parseSession(session: ChatSession): Promise<any> {
    const content = fs.readFileSync(session.filePath, "utf-8");
    const entries = this.parseJSONL(content);
    const header = entries.find((entry) => entry?.type === "session") || {};
    const bodyEntries = entries.filter((entry) => entry?.type !== "session");

    return {
      sessionId: session.sessionId,
      ...header,
      customTitle: session.customTitle,
      updatedAt: new Date(session.lastMessageDate).toISOString(),
      entries: bodyEntries,
    };
  }

  private getSessionsDir(): string {
    const agentDir =
      process.env.PI_CODING_AGENT_DIR ||
      path.join(os.homedir(), ".pi", "agent");

    return path.join(agentDir, "sessions");
  }

  private createSessionFromEntries(
    entries: any[],
    filePath: string
  ): ChatSession | null {
    const header = entries.find((entry) => entry?.type === "session");
    if (!header) {
      return null;
    }

    let firstUserMessage: string | undefined;
    let sessionName: string | undefined;
    let requestCount = 0;
    let earliestTimestamp = this.extractTimestamp(header);
    let latestTimestamp = earliestTimestamp || 0;

    for (const entry of entries) {
      const timestamp = this.extractTimestamp(entry);
      if (typeof timestamp === "number") {
        earliestTimestamp =
          typeof earliestTimestamp === "number"
            ? Math.min(earliestTimestamp, timestamp)
            : timestamp;
        latestTimestamp = Math.max(latestTimestamp, timestamp);
      }

      if (entry?.type === "session_info" && typeof entry.name === "string") {
        sessionName = entry.name;
      }

      if (entry?.type !== "message") {
        continue;
      }

      const message = entry.message;
      if (message?.role !== "user") {
        continue;
      }

      const preview = this.extractTextFromContent(message.content);
      if (!preview) {
        continue;
      }

      requestCount++;
      if (!firstUserMessage) {
        firstUserMessage = preview.substring(0, 60);
      }
    }

    if (requestCount === 0) {
      return null;
    }

    const workspacePath =
      typeof header.cwd === "string" && header.cwd.length > 0
        ? header.cwd
        : this.decodeWorkspacePath(filePath);
    const workspaceName = workspacePath ? path.basename(workspacePath) : "Pi";
    const creationDate = earliestTimestamp || latestTimestamp || Date.now();
    const lastMessageDate = latestTimestamp || creationDate;

    return {
      sessionId: this.extractSessionId(header, filePath),
      creationDate,
      lastMessageDate,
      customTitle: sessionName || firstUserMessage || "Pi Chat",
      requestCount,
      filePath,
      source: this.id,
      workspaceName,
      workspacePath,
      metadata: {
        pi: {
          version: header.version,
          parentSession: header.parentSession,
        },
      },
    };
  }

  private extractSessionId(header: any, filePath: string): string {
    if (typeof header.id === "string" && header.id.length > 0) {
      return header.id;
    }

    const basename = path.basename(filePath, ".jsonl");
    const underscoreIndex = basename.lastIndexOf("_");
    return underscoreIndex === -1
      ? basename
      : basename.substring(underscoreIndex + 1);
  }

  private extractTimestamp(entry: any): number | undefined {
    const raw = entry?.message?.timestamp ?? entry?.timestamp;
    if (!raw) {
      return undefined;
    }

    const value =
      typeof raw === "number"
        ? raw < 1000000000000
          ? raw * 1000
          : raw
        : new Date(raw).getTime();

    return Number.isNaN(value) ? undefined : value;
  }

  private extractTextFromContent(content: unknown): string | undefined {
    if (typeof content === "string") {
      return this.normalizePreview(content);
    }

    if (!Array.isArray(content)) {
      return undefined;
    }

    const text = content
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "type" in item &&
          (item as { type?: unknown }).type === "text" &&
          "text" in item &&
          typeof (item as { text?: unknown }).text === "string"
        ) {
          return (item as { text: string }).text;
        }

        if (
          item &&
          typeof item === "object" &&
          "type" in item &&
          (item as { type?: unknown }).type === "image"
        ) {
          return "[image]";
        }

        return null;
      })
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .join("\n");

    return this.normalizePreview(text);
  }

  private normalizePreview(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private decodeWorkspacePath(filePath: string): string | undefined {
    const projectDir = path.basename(path.dirname(filePath));
    if (!projectDir.startsWith("--") || !projectDir.endsWith("--")) {
      return undefined;
    }

    const encoded = projectDir.slice(2, -2);
    if (!encoded) {
      return undefined;
    }

    return `/${encoded.replace(/-/g, "/")}`;
  }

  private parseJSONL(content: string): any[] {
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((entry): entry is any => entry !== null);
  }
}
