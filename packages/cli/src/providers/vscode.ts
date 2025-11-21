import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatProvider } from "./base.js";
import { ChatSession } from "../types/index.js";

interface VSCodeChatSessionFile {
    version: number;
    sessionId: string;
    creationDate: number;
    lastMessageDate: number;
    customTitle?: string;
    requests: any[];
}

export class VSCodeProvider implements ChatProvider {
    readonly id = "vscode";
    readonly name = "VS Code";

    async findSessions(): Promise<ChatSession[]> {
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
                    const workspaceJson = JSON.parse(
                        fs.readFileSync(workspaceJsonPath, "utf-8")
                    );
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
                            const content = fs.readFileSync(filePath, "utf-8");
                            const session: VSCodeChatSessionFile = JSON.parse(content);

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

    async parseSession(session: ChatSession): Promise<any> {
        const fileContent = await fs.promises.readFile(session.filePath, "utf-8");
        return JSON.parse(fileContent);
    }
}
