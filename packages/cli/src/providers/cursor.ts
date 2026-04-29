import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Database from "better-sqlite3";
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
    unsupportedHooks,
} from "./base.js";

interface ComposerMetadata {
    composerId: string;
    name: string;
    createdAt: number;
    lastUpdatedAt: number;
    contextUsagePercent?: number;
    filesChangedCount?: number;
}

interface ChatSessionFile {
    version: number;
    sessionId: string;
    creationDate: number;
    lastMessageDate: number;
    title?: string;
    requests: any[];
}

export class CursorProvider implements ChatProvider {
    readonly id = "cursor";
    readonly name = "Cursor";

    async install(_context: ProviderInstallContext): Promise<ProviderActionResult> {
        return unsupportedHooks(this.name);
    }

    async uninstall(_context: ProviderInstallContext): Promise<ProviderActionResult> {
        return unsupportedHooks(this.name);
    }

    async list(_context?: ProviderListContext): Promise<ChatSession[]> {
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
                    const workspaceJson = await readJsonFile<any>(workspaceJsonPath);
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
                        const session = await readJsonFile<ChatSessionFile>(filePath);

                        const requestCount = session.requests?.length || 0;

                        // Skip chats with zero messages
                        if (requestCount === 0) {
                            continue;
                        }

                        sessions.push({
                            sessionId: session.sessionId,
                            creationDate: session.creationDate,
                            lastMessageDate: session.lastMessageDate,
                            title: session.title,
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
                        title: composer.name,
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

    async parse(session: ChatSession): Promise<ProviderParseResult> {
        if (session.metadata?.sessionType === "composer") {
            return {
                kind: "skip",
                reason: "Cursor composer sessions are stored in SQLite, not a single raw file.",
            };
        }

        return parseRawSessionFile(session);
    }

    async getMetadata(
        session: ChatSession,
        _context: ProviderMetadataContext,
    ): Promise<ProviderThreadMetadata> {
        return getDefaultProviderThreadMetadata(this, session);
    }

}
