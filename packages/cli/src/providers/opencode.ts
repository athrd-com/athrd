import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatSession } from "../types/index.js";
import { ChatProvider } from "./base.js";

interface OpenCodeSession {
	id: string;
	projectID: string;
	directory: string;
	title: string;
	time: {
		created: number;
		updated: number;
	};
	summary?: {
		additions: number;
		deletions: number;
		files: number;
	};
}

interface OpenCodeProject {
	id: string;
	worktree: string;
}

interface OpenCodeMessage {
	id: string;
	sessionID: string;
	role: "user" | "assistant" | "system";
	time: {
		created: number;
	};
	summary?: {
		title: string;
	};
}

interface OpenCodePart {
	id: string;
	messageID: string;
	type: string;
	text?: string;
	state?: {
		input: {
			command: string;
			description: string;
		};
		output: string;
		exit: number;
	};
}

export class OpenCodeProvider implements ChatProvider {
	readonly id = "opencode";
	readonly name = "OpenCode";

	private getStoragePath(subDir: string): string {
		return path.join(os.homedir(), ".local/share/opencode/storage", subDir);
	}

	async findSessions(): Promise<ChatSession[]> {
		const sessionRoot = this.getStoragePath("session");
		const projectRoot = this.getStoragePath("project");

		if (!fs.existsSync(sessionRoot)) {
			return [];
		}

		const sessions: ChatSession[] = [];
		const projectDirs = fs.readdirSync(sessionRoot);

		for (const projectDir of projectDirs) {
			// projectDir is likely the projectID or 'global'
			const projectSessionPath = path.join(sessionRoot, projectDir);

			if (!fs.statSync(projectSessionPath).isDirectory()) {
				continue;
			}

			// Try to resolve workspace info
			let workspaceName: string | undefined;
			let workspacePath: string | undefined;

			if (projectDir !== "global") {
				try {
					const projectJsonPath = path.join(projectRoot, `${projectDir}.json`);
					if (fs.existsSync(projectJsonPath)) {
						const projectData: OpenCodeProject = JSON.parse(
							fs.readFileSync(projectJsonPath, "utf-8"),
						);
						workspacePath = projectData.worktree;
						workspaceName = path.basename(workspacePath);
					}
				} catch (e) {
					// Ignore missing project data
				}
			}

			const sessionFiles = fs.readdirSync(projectSessionPath);
			for (const file of sessionFiles) {
				if (!file.endsWith(".json")) continue;

				try {
					const filePath = path.join(projectSessionPath, file);
					const content = fs.readFileSync(filePath, "utf-8");
					const sessionData: OpenCodeSession = JSON.parse(content);

					const sessionMsgDir = path.join(
						this.getStoragePath("message"),
						sessionData.id,
					);
					let requestCount = 0;
					if (fs.existsSync(sessionMsgDir)) {
						requestCount = fs
							.readdirSync(sessionMsgDir)
							.filter((f) => f.endsWith(".json")).length;
					}

					if (requestCount === 0) {
						continue;
					}

					sessions.push({
						sessionId: sessionData.id,
						creationDate: sessionData.time.created,
						lastMessageDate: sessionData.time.updated,
						customTitle: sessionData.title,
						requestCount,
						filePath, // Point to the session metadata file
						source: this.id,
						workspaceName,
						workspacePath: workspacePath || sessionData.directory, // Fallback to directory in session
					});
				} catch (e) {
					continue;
				}
			}
		}

		return sessions;
	}

	async parseSession(session: ChatSession): Promise<any> {
		// session.filePath points to the session metadata file
		const sessionContent = fs.readFileSync(session.filePath, "utf-8");
		const sessionData: OpenCodeSession = JSON.parse(sessionContent);

		const messageRoot = this.getStoragePath("message");
		const partRoot = this.getStoragePath("part");
		const sessionMsgDir = path.join(messageRoot, sessionData.id);

		if (!fs.existsSync(sessionMsgDir)) {
			return {
				sessionId: sessionData.id,
				requests: [],
			};
		}

		const messages: any[] = [];
		const msgFiles = fs.readdirSync(sessionMsgDir);

		// Read all messages
		const loadedMessages: OpenCodeMessage[] = [];
		for (const msgFile of msgFiles) {
			if (!msgFile.endsWith(".json")) continue;
			try {
				const msgContent = fs.readFileSync(
					path.join(sessionMsgDir, msgFile),
					"utf-8",
				);
				loadedMessages.push(JSON.parse(msgContent));
			} catch (e) {
				continue;
			}
		}

		// Sort by creation time
		loadedMessages.sort((a, b) => a.time.created - b.time.created);

		// Load parts for each message
		for (const msg of loadedMessages) {
			const partDir = path.join(partRoot, msg.id);
			let fullText = "";

			if (fs.existsSync(partDir)) {
				const partFiles = fs
					.readdirSync(partDir)
					.filter((f) => f.endsWith(".json"));
				const parts: OpenCodePart[] = [];

				for (const partFile of partFiles) {
					try {
						const partContent = fs.readFileSync(
							path.join(partDir, partFile),
							"utf-8",
						);
						parts.push(JSON.parse(partContent));
					} catch (e) {
						continue;
					}
				}

				// Assuming parts don't need explicit sorting if we just concatenate text,
				// but usually they might be ordered by ID or implicit file order.
				// Let's sort by ID to be safe as they seem to have sequential IDs/hashes.
				parts.sort((a, b) => a.id.localeCompare(b.id));

				for (const part of parts) {
					if (part.type === "text" && part.text) {
						fullText += part.text;
					} else if (part.type === "tool" && part.state) {
						// Reconstruct tool call in a human-readable format
						fullText += `\n[Tool Call: ${part.state.input.command}]\n`;
						fullText += `Description: ${part.state.input.description}\n`;
						if (part.state.output) {
							fullText += `Output:\n${part.state.output}\n`;
						}
					}
				}
			}

			if (fullText) {
				messages.push({
					type: msg.role,
					timestamp: msg.time.created,
					message: fullText,
				});
			}
		}

		return {
			sessionId: sessionData.id,
			requests: messages,
		};
	}
}
