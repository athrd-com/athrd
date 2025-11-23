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
                            if (!chatFile.endsWith(".json")) {
                                continue;
                            }

                            if (chatFile === "logs.json") {
                                continue;
                            }

                            const filePath = path.join(chatsPath, chatFile);
                            try {
                                const fileContent = fs.readFileSync(filePath, "utf-8");
                                const sessionData = JSON.parse(fileContent);

                                if (!sessionData.messages || !Array.isArray(sessionData.messages)) {
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

                                    if (msg.type === "user" && firstUserMessage === "Gemini Chat") {
                                        if (msg.content) {
                                            firstUserMessage = msg.content.substring(0, 60);
                                        }
                                    }
                                }

                                sessions.push({
                                    sessionId: sessionData.sessionId || chatFile.replace(".json", ""),
                                    creationDate: sessionData.startTime ? new Date(sessionData.startTime).getTime() : lastMessageDate,
                                    lastMessageDate,
                                    customTitle: firstUserMessage,
                                    requestCount: messages.length,
                                    filePath: filePath,
                                    source: this.id,
                                    workspaceName: "Gemini",
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

    async parseSession(session: ChatSession): Promise<any> {
        const fileContent = fs.readFileSync(session.filePath, "utf-8");
        return JSON.parse(fileContent);
    }
}
