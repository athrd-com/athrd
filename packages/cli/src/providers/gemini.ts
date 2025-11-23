import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatProvider } from "./base.js";
import { ChatSession } from "../types/index.js";

export class GeminiProvider implements ChatProvider {
    readonly id = "gemini";
    readonly name = "Gemini";

    async findSessions(): Promise<ChatSession[]> {
        const geminiTmpPath = path.join(os.homedir(), ".gemini", "tmp");

        if (!fs.existsSync(geminiTmpPath)) {
            return [];
        }

        const sessions: ChatSession[] = [];

        try {
            const sessionDirs = fs.readdirSync(geminiTmpPath);

            for (const sessionDir of sessionDirs) {
                const sessionPath = path.join(geminiTmpPath, sessionDir);

                // Skip if not a directory
                if (!fs.statSync(sessionPath).isDirectory()) {
                    continue;
                }

                const logsPath = path.join(sessionPath, "logs.json");

                if (fs.existsSync(logsPath)) {
                    try {
                        const fileContent = fs.readFileSync(logsPath, "utf-8");
                        const entries = JSON.parse(fileContent);

                        if (!Array.isArray(entries) || entries.length === 0) {
                            continue;
                        }

                        // Find first user message for title
                        let firstUserMessage = "Gemini Chat";
                        let lastMessageDate = 0;
                        let messageCount = 0;
                        let sessionId = sessionDir; // Default to dir name if not found in logs

                        for (const entry of entries) {
                            if (entry.type === "user" || entry.type === "model") {
                                messageCount++;
                                if (entry.timestamp) {
                                    const timestamp = new Date(entry.timestamp).getTime();
                                    lastMessageDate = Math.max(lastMessageDate, timestamp);
                                }
                            }

                            if (entry.type === "user" && firstUserMessage === "Gemini Chat") {
                                if (entry.message) {
                                    firstUserMessage = entry.message.substring(0, 60);
                                }
                            }

                            if (entry.sessionId) {
                                sessionId = entry.sessionId;
                            }
                        }

                        if (messageCount === 0) {
                            continue;
                        }

                        sessions.push({
                            sessionId,
                            creationDate: lastMessageDate, // Approximation
                            lastMessageDate,
                            customTitle: firstUserMessage,
                            requestCount: messageCount,
                            filePath: logsPath,
                            source: this.id,
                            workspaceName: "Gemini", // Generic workspace for now
                        });

                    } catch (error) {
                        // Skip invalid JSON
                        continue;
                    }
                }
            }
        } catch (error) {
            // Ignore errors reading Gemini directory
        }

        return sessions;
    }

    async parseSession(session: ChatSession): Promise<any> {
        const fileContent = fs.readFileSync(session.filePath, "utf-8");
        const entries = JSON.parse(fileContent);

        const requests: any[] = [];

        for (const entry of entries) {
            if (entry.type === "user" || entry.type === "model") {
                requests.push({
                    // Use messageId as ID since UUID might not be present on all entries
                    id: entry.messageId?.toString() || Date.now().toString(),
                    type: entry.type === "model" ? "assistant" : "user",
                    message: entry.message,
                    timestamp: entry.timestamp,
                });
            }
        }

        return {
            sessionId: session.sessionId,
            requests,
        };
    }
}
