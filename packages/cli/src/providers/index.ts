import { ChatProvider } from "./base.js";
import { VSCodeProvider } from "./vscode.js";
import { ClaudeCodeProvider } from "./claude.js";
import { CursorProvider } from "./cursor.js";
import { GeminiProvider } from "./gemini.js";

export const providers: ChatProvider[] = [
    new VSCodeProvider(),
    new ClaudeCodeProvider(),
    new CursorProvider(),
    new GeminiProvider(),
];

export function getProvider(id: string): ChatProvider | undefined {
    return providers.find((p) => p.id === id);
}

export * from "./base.js";
export * from "./vscode.js";
export * from "./claude.js";
export * from "./cursor.js";
export * from "./gemini.js";
