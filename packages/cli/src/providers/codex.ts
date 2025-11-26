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

            let lastMessageDate = 0;
            let messageCount = 0;
            let firstUser: string | undefined;
            let sessionId: string | undefined;

            for (const e of entries) {
              // Extract session ID from session_meta or from first entry
              if (e.type === "session_meta" && e.payload?.id) {
                sessionId = e.payload.id;
              } else if (e.id && !sessionId) {
                // Older format: first entry has the session ID and timestamp
                sessionId = e.id;
                if (e.timestamp && lastMessageDate === 0) {
                  lastMessageDate = new Date(e.timestamp).getTime();
                }
              }

              // Prefer event_msg type for user messages (has the actual user query)
              // But skip environment_context messages
              if (
                e.type === "event_msg" &&
                e.payload?.type === "user_message" &&
                e.payload?.kind !== "environment_context"
              ) {
                if (!firstUser && e.payload.message) {
                  firstUser = e.payload.message.substring(0, 60);
                }
              }

              // Look for user messages in response_item payloads (newer format)
              if (e.type === "response_item" && e.payload) {
                const payload = e.payload;
                if (payload.type === "message" && payload.role === "user") {
                  messageCount++;

                  if (e.timestamp) {
                    const t = new Date(e.timestamp).getTime();
                    lastMessageDate = Math.max(lastMessageDate, t);
                  }

                  // Extract first user message text for title (skip environment_context) as fallback
                  if (
                    !firstUser &&
                    payload.content &&
                    Array.isArray(payload.content)
                  ) {
                    for (const contentItem of payload.content) {
                      if (
                        contentItem.type === "input_text" &&
                        contentItem.text
                      ) {
                        const text = contentItem.text.trim();
                        // Skip environment context messages
                        if (!text.startsWith("<environment_context>")) {
                          firstUser = text.substring(0, 60);
                          break;
                        }
                      }
                    }
                  }
                }
              }

              // Look for direct message format (older format: {"type":"message","role":"user",...})
              if (e.type === "message" && e.role === "user") {
                messageCount++;

                if (e.timestamp) {
                  const t = new Date(e.timestamp).getTime();
                  lastMessageDate = Math.max(lastMessageDate, t);
                }

                // Extract first user message text for title
                if (!firstUser && e.content && Array.isArray(e.content)) {
                  for (const contentItem of e.content) {
                    if (contentItem.type === "input_text" && contentItem.text) {
                      const text = contentItem.text.trim();
                      // Skip environment context messages
                      if (!text.startsWith("<environment_context>")) {
                        firstUser = text.substring(0, 60);
                        break;
                      }
                    }
                  }
                }
              }
            }

            if (messageCount === 0) {
              continue;
            }

            sessions.push({
              sessionId: sessionId || path.basename(fullPath, ".jsonl"),
              creationDate: lastMessageDate,
              lastMessageDate,
              customTitle: firstUser || "Codex Chat",
              requestCount: messageCount,
              filePath: fullPath,
              source: this.id,
            });
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
