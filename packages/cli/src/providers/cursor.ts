import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Database from "better-sqlite3";
import { ChatProvider } from "./base.js";
import { ChatSession } from "../types/index.js";

interface ComposerMetadata {
    composerId: string;
    name: string;
    createdAt: number;
    lastUpdatedAt: number;
    contextUsagePercent?: number;
    filesChangedCount?: number;
}

interface Bubble {
    _v: number;
    type: 0 | 1 | 2; // 0=METADATA, 1=USER, 2=ASSISTANT
    bubbleId: string;
    text?: string;
    createdAt: string;
    toolFormerData?: {
        tool: number;
        toolIndex: number;
        name: string;
        status: string;
        params: string; // JSON string
        result: string; // JSON string
        additionalData?: any;
    };
    tokenCount?: {
        inputTokens: number;
        outputTokens: number;
    };
    supportedTools?: number[];
    codeBlocks?: any[];
    attachedCodeChunks?: any[];
    codebaseContextChunks?: any[];
    relevantFiles?: any[];
    capabilities?: any[];
    todos?: any[];
}

interface ChatSessionFile {
    version: number;
    sessionId: string;
    creationDate: number;
    lastMessageDate: number;
    customTitle?: string;
    requests: any[];
}

export class CursorProvider implements ChatProvider {
    readonly id = "cursor";
    readonly name = "Cursor";

    async findSessions(): Promise<ChatSession[]> {
        const workspaceStoragePath = path.join(
            os.homedir(),
            "Library/Application Support/Cursor/User/workspaceStorage"
        );

        if (!fs.existsSync(workspaceStoragePath)) {
            return [];
        }

        const sessions: ChatSession[] = [];
        const workspaceDirs = fs.readdirSync(workspaceStoragePath);

        for (const workspaceDir of workspaceDirs) {
            const workspaceStorageDir = path.join(workspaceStoragePath, workspaceDir);

            // Get workspace metadata
            let workspaceName: string | undefined;
            let workspacePath: string | undefined;
            try {
                const workspaceJsonPath = path.join(workspaceStorageDir, "workspace.json");
                if (fs.existsSync(workspaceJsonPath)) {
                    const workspaceJson = JSON.parse(
                        fs.readFileSync(workspaceJsonPath, "utf-8")
                    );
                    if (workspaceJson.folder) {
                        const folderUri = workspaceJson.folder;
                        const folderPath = folderUri.replace(/^file:\/\//, "");
                        workspaceName = path.basename(folderPath);
                        workspacePath = folderPath;
                    }
                }
            } catch (error) {
                // Ignore errors reading workspace.json
            }

            // Find Chat sessions (JSON files)
            const chatSessions = await this.findChatSessions(
                workspaceStorageDir,
                workspaceName,
                workspacePath
            );
            sessions.push(...chatSessions);

            // Find Composer sessions (from SQLite database)
            const composerSessions = await this.findComposerSessions(
                workspaceStorageDir,
                workspaceDir,
                workspaceName,
                workspacePath
            );
            sessions.push(...composerSessions);
        }

        return sessions;
    }

    private async findChatSessions(
        workspaceStorageDir: string,
        workspaceName?: string,
        workspacePath?: string
    ): Promise<ChatSession[]> {
        const sessions: ChatSession[] = [];
        const chatSessionsPath = path.join(workspaceStorageDir, "chatSessions");

        if (
            fs.existsSync(chatSessionsPath) &&
            fs.statSync(chatSessionsPath).isDirectory()
        ) {
            const chatFiles = fs.readdirSync(chatSessionsPath);

            for (const chatFile of chatFiles) {
                if (chatFile.endsWith(".json")) {
                    try {
                        const filePath = path.join(chatSessionsPath, chatFile);
                        const content = fs.readFileSync(filePath, "utf-8");
                        const session: ChatSessionFile = JSON.parse(content);

                        const requestCount = session.requests?.length || 0;

                        // Skip chats with zero messages
                        if (requestCount === 0) {
                            continue;
                        }

                        sessions.push({
                            sessionId: session.sessionId,
                            creationDate: session.creationDate,
                            lastMessageDate: session.lastMessageDate,
                            customTitle: session.customTitle,
                            requestCount,
                            filePath,
                            source: this.id,
                            workspaceName,
                            workspacePath,
                            metadata: {
                                sessionType: "chat",
                            },
                        });
                    } catch (error) {
                        // Skip invalid JSON files
                        continue;
                    }
                }
            }
        }

        return sessions;
    }

    private async findComposerSessions(
        workspaceStorageDir: string,
        workspaceId: string,
        workspaceName?: string,
        workspacePath?: string
    ): Promise<ChatSession[]> {
        const sessions: ChatSession[] = [];
        const stateDbPath = path.join(workspaceStorageDir, "state.vscdb");

        if (!fs.existsSync(stateDbPath)) {
            return sessions;
        }

        try {
            const db = new Database(stateDbPath, { readonly: true });

            // Get composer metadata
            const row = db
                .prepare("SELECT value FROM ItemTable WHERE key = ?")
                .get("composer.composerData") as { value: string } | undefined;

            if (!row) {
                db.close();
                return sessions;
            }

            const composerData = JSON.parse(row.value);
            const allComposers: ComposerMetadata[] = composerData.allComposers || [];

            db.close();

            // For each composer, count bubbles from global database
            const globalDbPath = path.join(
                os.homedir(),
                "Library/Application Support/Cursor/User/globalStorage/state.vscdb"
            );

            if (!fs.existsSync(globalDbPath)) {
                return sessions;
            }

            const globalDb = new Database(globalDbPath, { readonly: true });

            for (const composer of allComposers) {
                try {
                    // Count bubbles for this composer
                    const countRow = globalDb
                        .prepare(
                            "SELECT COUNT(*) as count FROM cursorDiskKV WHERE key LIKE ?"
                        )
                        .get(`bubbleId:${composer.composerId}:%`) as { count: number };

                    const bubbleCount = countRow?.count || 0;

                    // Skip composers with no bubbles
                    if (bubbleCount === 0) {
                        continue;
                    }

                    sessions.push({
                        sessionId: composer.composerId,
                        creationDate: composer.createdAt,
                        lastMessageDate: composer.lastUpdatedAt,
                        customTitle: composer.name,
                        requestCount: bubbleCount,
                        filePath: globalDbPath, // Points to global DB
                        source: this.id,
                        workspaceName,
                        workspacePath,
                        metadata: {
                            sessionType: "composer",
                            workspaceId,
                            contextUsagePercent: composer.contextUsagePercent,
                            filesChangedCount: composer.filesChangedCount,
                        },
                    });
                } catch (error) {
                    // Skip composers that can't be processed
                    continue;
                }
            }

            globalDb.close();
        } catch (error) {
            // Ignore database errors
        }

        return sessions;
    }

    async parseSession(session: ChatSession): Promise<any> {
        const sessionType = session.metadata?.sessionType;

        if (sessionType === "chat") {
            // Parse Chat session from JSON file
            const fileContent = await fs.promises.readFile(session.filePath, "utf-8");
            return JSON.parse(fileContent);
        } else if (sessionType === "composer") {
            // Parse Composer session from global database
            return this.parseComposerSession(session);
        } else {
            throw new Error(`Unknown session type: ${sessionType}`);
        }
    }

    private parseComposerSession(session: ChatSession): any {
        const globalDbPath = session.filePath;

        if (!fs.existsSync(globalDbPath)) {
            throw new Error(`Global database not found: ${globalDbPath}`);
        }

        const db = new Database(globalDbPath, { readonly: true });

        try {
            // Get all bubbles for this composer
            const rows = db
                .prepare(
                    "SELECT key, value FROM cursorDiskKV WHERE key LIKE ? ORDER BY key"
                )
                .all(`bubbleId:${session.sessionId}:%`) as Array<{
                    key: string;
                    value: string;
                }>;

            const bubbles: Bubble[] = rows.map((row) => JSON.parse(row.value));

            // Sort by creation date
            bubbles.sort(
                (a, b) =>
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

            // Reconstruct conversation
            const messages = bubbles.map((bubble) => {
                const message: any = {
                    type: bubble.type,
                    bubbleId: bubble.bubbleId,
                    text: bubble.text || "",
                    createdAt: bubble.createdAt,
                    tokenCount: bubble.tokenCount,
                };

                // Parse tool calls
                if (bubble.toolFormerData) {
                    const toolData = bubble.toolFormerData;
                    message.toolCall = {
                        tool: toolData.name, // Use the name directly from toolFormerData
                        toolId: toolData.tool,
                        toolIndex: toolData.toolIndex,
                        status: toolData.status,
                        params: this.safeJsonParse(toolData.params),
                        result: this.safeJsonParse(toolData.result),
                        additionalData: toolData.additionalData,
                    };
                }

                // Include additional context if present
                if (bubble.codeBlocks?.length) {
                    message.codeBlocks = bubble.codeBlocks;
                }
                if (bubble.attachedCodeChunks?.length) {
                    message.attachedCodeChunks = bubble.attachedCodeChunks;
                }
                if (bubble.relevantFiles?.length) {
                    message.relevantFiles = bubble.relevantFiles;
                }

                return message;
            });

            // Calculate statistics
            const statistics = {
                totalBubbles: bubbles.length,
                userMessages: bubbles.filter((b) => b.type === 1).length,
                assistantMessages: bubbles.filter((b) => b.type === 2).length,
                metadataMessages: bubbles.filter((b) => b.type === 0).length,
                totalTokens: bubbles.reduce(
                    (sum, b) =>
                        sum +
                        (b.tokenCount?.inputTokens || 0) +
                        (b.tokenCount?.outputTokens || 0),
                    0
                ),
                bubblesWithToolCalls: bubbles.filter((b) => b.toolFormerData).length,
            };

            db.close();

            return {
                composerId: session.sessionId,
                metadata: {
                    name: session.customTitle,
                    createdAt: session.creationDate,
                    lastUpdatedAt: session.lastMessageDate,
                    contextUsagePercent: session.metadata?.contextUsagePercent,
                    filesChangedCount: session.metadata?.filesChangedCount,
                    workspaceName: session.workspaceName,
                    workspacePath: session.workspacePath,
                },
                messages,
                statistics,
            };
        } catch (error) {
            db.close();
            throw error;
        }
    }

    private safeJsonParse(jsonString: string | undefined): any {
        if (!jsonString) return null;
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            return jsonString; // Return as-is if not valid JSON
        }
    }
}
