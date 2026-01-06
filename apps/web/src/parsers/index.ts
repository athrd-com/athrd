import type { AThrd } from "@/types/athrd";
import { IDE } from "@/types/ide";
import type { Parser } from "./base";

// Import all parsers
import { claudeParser } from "./claude";
import { codexParser } from "./codex";
import { cursorParser } from "./cursor";
import { geminiParser } from "./gemini";
import { vscodeParser } from "./vscode";

// Export individual parsers
export { claudeParser } from "./claude";
export { codexParser } from "./codex";
export { cursorParser } from "./cursor";
export { geminiParser } from "./gemini";
export { vscodeParser } from "./vscode";

// Export base types and utilities
export type { Parser } from "./base";
export {
  createListDirectoryToolCall,
  createMCPToolCall,
  createReadFileToolCall,
  createReplaceToolCall,
  createTerminalCommandToolCall,
  createUnknownToolCall,
  createWriteFileToolCall,
  generateId,
  mapToolName,
  normalizeTimestamp,
  safeJsonParse,
} from "./utils";

/**
 * All available parsers, indexed by IDE
 * Note: IDE.CLAUDE and IDE.CLAUDE_CODE have the same value ("claude")
 */
export const parsers: Record<IDE, Parser> = {
  [IDE.GEMINI]: geminiParser,
  [IDE.CLAUDE_CODE]: claudeParser,
  // IDE.CLAUDE is same as IDE.CLAUDE_CODE
  [IDE.CODEX]: codexParser,
  [IDE.VSCODE]: vscodeParser,
  [IDE.CURSOR]: cursorParser,
};

/**
 * List of all parsers for auto-detection
 */
const parserList: Parser[] = [
  geminiParser,
  claudeParser,
  codexParser,
  vscodeParser,
  cursorParser,
];

/**
 * Parse a raw thread into the unified AThrd format.
 *
 * @param rawThread - The raw thread data from any CLI tool
 * @param ide - Optional IDE identifier. If provided, uses the specific parser.
 *              If not provided, attempts to auto-detect the format.
 * @returns The parsed AThrd thread
 * @throws Error if the thread format cannot be detected or parsed
 */
export function parseThread(rawThread: unknown, ide?: IDE): AThrd {
  // If IDE is specified, use that parser directly
  if (ide) {
    const parser = parsers[ide];
    if (!parser) {
      throw new Error(`No parser available for IDE: ${ide}`);
    }
    return parser.parse(rawThread);
  }

  // Try to auto-detect the format
  for (const parser of parserList) {
    if (parser.canParse(rawThread)) {
      return parser.parse(rawThread);
    }
  }

  throw new Error(
    "Unable to detect thread format. Please specify the IDE explicitly."
  );
}

/**
 * Detect the IDE from a raw thread.
 *
 * @param rawThread - The raw thread data
 * @returns The detected IDE, or undefined if cannot be detected
 */
export function detectIDE(rawThread: unknown): IDE | undefined {
  for (const parser of parserList) {
    if (parser.canParse(rawThread)) {
      return parser.id;
    }
  }
  return undefined;
}

/**
 * Check if a raw thread can be parsed by any parser.
 *
 * @param rawThread - The raw thread data
 * @returns true if the thread can be parsed
 */
export function canParseThread(rawThread: unknown): boolean {
  return parserList.some((parser) => parser.canParse(rawThread));
}
