import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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

interface VSCodeChatSessionFile {
    version: number;
    sessionId: string;
    creationDate: number;
    lastMessageDate: number;
    title?: string;
    requests: any[];
}

export class VSCodeProvider implements ChatProvider {
    readonly id = "vscode";
    readonly name = "VS Code";

    async install(_context: ProviderInstallContext): Promise<ProviderActionResult> {
        return unsupportedHooks(this.name);
    }

    async uninstall(_context: ProviderInstallContext): Promise<ProviderActionResult> {
        return unsupportedHooks(this.name);
    }

    async list(_context?: ProviderListContext): Promise<ChatSession[]> {
        const workspaceStoragePath = path.join(
            os.homedir(),
            "Library/Application Support/Code/User/workspaceStorage"
        );

        if (!fs.existsSync(workspaceStoragePath)) {
            return [];
        }

        const sessions: ChatSession[] = [];
        const workspaceDirs = fs.readdirSync(workspaceStoragePath);

        for (const workspaceDir of workspaceDirs) {
            const workspaceStorageDir = path.join(workspaceStoragePath, workspaceDir);
            const chatSessionsPath = path.join(workspaceStorageDir, "chatSessions");

            // Try to read workspace name from workspace.json
            let workspaceName: string | undefined;
            let workspacePath: string | undefined;
            try {
                const workspaceJsonPath = path.join(
                    workspaceStorageDir,
                    "workspace.json"
                );
                if (fs.existsSync(workspaceJsonPath)) {
                    const workspaceJson = await readJsonFile<any>(workspaceJsonPath);
                    if (workspaceJson.folder) {
                        // Extract folder name from URI like "file:///Users/user/code/project-name"
                        const folderUri = workspaceJson.folder;
                        const folderPath = folderUri.replace(/^file:\/\//, "");
                        workspaceName = path.basename(folderPath);
                        workspacePath = folderPath;
                    }
                }
            } catch (error) {
                // Ignore errors reading workspace.json
            }

            if (
                fs.existsSync(chatSessionsPath) &&
                fs.statSync(chatSessionsPath).isDirectory()
            ) {
                const chatFiles = fs.readdirSync(chatSessionsPath);

                for (const chatFile of chatFiles) {
                    if (chatFile.endsWith(".json")) {
                        try {
                            const filePath = path.join(chatSessionsPath, chatFile);
                            const session = await readJsonFile<VSCodeChatSessionFile>(
                                filePath
                            );

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
                            });
                        } catch (error) {
                            // Skip invalid JSON files
                            continue;
                        }
                    }
                }
            }
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
}
