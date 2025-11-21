import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatProvider } from "./base.js";
import { ChatSession } from "../types/index.js";

export class ClaudeCodeProvider implements ChatProvider {
    readonly id = "claude";
    readonly name = "Claude";

    async findSessions(): Promise<ChatSession[]> {
        const claudeProjectsPath = path.join(os.homedir(), ".claude", "projects");

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
                    if (file.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i)) {
                        const filePath = path.join(projectPath, file);

                        try {
                            const fileContent = fs.readFileSync(filePath, "utf-8");
                            const lines = fileContent.split("\n");

                            // Parse JSONL to find session metadata
                            let summary: string | undefined;
                            let lastMessageDate: number = 0;
                            let messageCount = 0;
                            let firstUserMessage: string | undefined;

                            for (const line of lines) {
                                if (line.trim()) {
                                    try {
                                        const entry = JSON.parse(line);

                                        // Get summary if available
                                        if (entry.type === "summary" && !summary) {
                                            summary = entry.summary;
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
                                    } catch (e) {
                                        // Skip invalid JSON lines
                                        continue;
                                    }
                                }
                            }

                            // Skip sessions with no messages
                            if (messageCount === 0) {
                                continue;
                            }

                            // Use the project directory name as workspace
                            const workspaceName = projectDir
                                .split("-")
                                .slice(-1)[0]
                                .split("/")
                                .pop();

                            // Use summary if available, otherwise use first user message, otherwise default
                            const title = summary || firstUserMessage || "Claude Chat";

                            sessions.push({
                                sessionId: file.replace(".jsonl", ""),
                                creationDate: lastMessageDate,
                                lastMessageDate,
                                customTitle: title,
                                requestCount: messageCount,
                                filePath,
                                source: this.id,
                                workspaceName,
                                metadata: {
                                    agentFiles: agentFiles.get(file.replace(".jsonl", "")) || [],
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
                            const fileContent = fs.readFileSync(filePath, "utf-8");
                            const lines = fileContent.split("\n");

                            // Find which session this agent belongs to
                            for (const line of lines) {
                                if (line.trim()) {
                                    try {
                                        const entry = JSON.parse(line);
                                        if (entry.sessionId) {
                                            if (!agentFiles.has(entry.sessionId)) {
                                                agentFiles.set(entry.sessionId, []);
                                            }
                                            agentFiles.get(entry.sessionId)!.push(filePath);
                                            break; // Only need first entry to get sessionId
                                        }
                                    } catch (e) {
                                        continue;
                                    }
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

    async parseSession(session: ChatSession): Promise<any> {
        const fileContent = fs.readFileSync(session.filePath, "utf-8");
        const jsonlEntries = this.parseJSONL(fileContent);
        let sessionData = this.parseClaudeCodeSession(jsonlEntries);

        // Merge agent files into the session data
        if (session.metadata?.agentFiles) {
            sessionData = await this.mergeAgentFilesIntoSession(
                sessionData,
                session.metadata.agentFiles
            );
        }
        return sessionData;
    }

    private parseJSONL(fileContent: string): any[] {
        const lines = fileContent.split("\n");
        const result: any[] = [];

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const entry = JSON.parse(line);
                    result.push(entry);
                } catch (e) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        }

        return result;
    }

    private parseClaudeCodeSession(jsonlEntries: any[]): any {
        const requests: any[] = [];
        let sessionId = "unknown";

        // Extract user and assistant messages
        for (const entry of jsonlEntries) {
            if (entry.type === "user" || entry.type === "assistant") {
                if (!sessionId || sessionId === "unknown") {
                    sessionId = entry.sessionId || "unknown";
                }
                requests.push({
                    id: entry.uuid || entry.id,
                    type: entry.type,
                    message: entry.message,
                    timestamp: entry.timestamp,
                });
            }
        }

        return {
            sessionId,
            requests,
        };
    }

    private async mergeAgentFilesIntoSession(
        sessionData: any,
        agentFilePaths: string[] | undefined
    ): Promise<any> {
        if (!agentFilePaths || agentFilePaths.length === 0) {
            return sessionData;
        }

        const agents: { [agentId: string]: any[] } = {};

        // Parse each agent file and organize by agent ID
        for (const agentFilePath of agentFilePaths) {
            try {
                const fileContent = fs.readFileSync(agentFilePath, "utf-8");
                const entries = this.parseJSONL(fileContent);
                const fileName = path.basename(agentFilePath);
                const agentId = fileName.replace("agent-", "").replace(".jsonl", "");

                agents[agentId] = entries;
            } catch (error) {
                // Skip files that can't be read
                continue;
            }
        }

        // Return merged data
        return {
            ...sessionData,
            __agents: agents,
        };
    }
}
