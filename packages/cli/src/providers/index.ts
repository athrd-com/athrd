import { ChatProvider } from "./base.js";
import { VSCodeProvider } from "./vscode.js";
import { ClaudeCodeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import { CursorProvider } from "./cursor.js";
import { GeminiProvider } from "./gemini.js";
import { OpenCodeProvider } from "./opencode.js";
import { PiProvider } from "./pi.js";

export const providers: ChatProvider[] = [
	new VSCodeProvider(),
	new ClaudeCodeProvider(),
	new CodexProvider(),
	new CursorProvider(),
	new GeminiProvider(),
	new OpenCodeProvider(),
	new PiProvider(),
];

export function getProvider(id: string): ChatProvider | undefined {
	return providers.find((p) => p.id === id);
}

export * from "./base.js";
export * from "./vscode.js";
export * from "./claude.js";
export * from "./codex.js";
export * from "./cursor.js";
export * from "./gemini.js";
export * from "./opencode.js";
export * from "./pi.js";
