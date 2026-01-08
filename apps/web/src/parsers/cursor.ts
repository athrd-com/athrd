import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdToolCall,
  AthrdUserMessage,
} from "@/types/athrd";
import type {
  CursorThread,
  CursorToolCall,
  ReadFileToolCallParams,
  TodosToolCallResult,
} from "@/types/cursor";
import { IDE } from "@/types/ide";
import type { Parser } from "./base";
import {
  createReadFileToolCall,
  createTerminalCommandToolCall,
  createUnknownToolCall,
  createUpdatePlanToolCall,
  createWriteFileToolCall,
  generateId,
  mapToolName,
  normalizeTimestamp,
} from "./utils";

/**
 * Message types in Cursor
 * 0 = METADATA
 * 1 = USER
 * 2 = ASSISTANT
 */
const CURSOR_MESSAGE_TYPES = {
  METADATA: 0,
  USER: 1,
  ASSISTANT: 2,
} as const;

/**
 * Parser for Cursor threads.
 * Cursor uses a message-based structure with tool data stored in JSON string fields.
 */
export const cursorParser: Parser<CursorThread> = {
  id: IDE.CURSOR,

  canParse(rawThread: unknown): rawThread is CursorThread {
    if (!rawThread || typeof rawThread !== "object") return false;
    const thread = rawThread as Record<string, unknown>;

    // Check for Cursor-specific structure
    if (thread.composerId && Array.isArray(thread.messages)) {
      return true;
    }

    // Also check for metadata structure
    if (thread.metadata && typeof thread.metadata === "object") {
      const metadata = thread.metadata as Record<string, unknown>;
      return (
        metadata.name !== undefined &&
        metadata.createdAt !== undefined &&
        Array.isArray(thread.messages)
      );
    }

    return false;
  },

  parse(rawThread: CursorThread): AThrd {
    const messages: (AthrdUserMessage | AthrdAssistantMessage)[] = [];

    // Track current assistant message being built
    let currentAssistant: {
      id: string;
      content: string[];
      toolCalls: AthrdToolCall[];
      timestamp: string;
    } | null = null;

    const flushAssistant = () => {
      if (currentAssistant) {
        messages.push({
          id: currentAssistant.id,
          type: "assistant",
          content: currentAssistant.content.join("\n\n"),
          timestamp: currentAssistant.timestamp,
          toolCalls:
            currentAssistant.toolCalls.length > 0
              ? currentAssistant.toolCalls
              : undefined,
          model: "cursor",
        });
        currentAssistant = null;
      }
    };

    for (const msg of rawThread.messages) {
      // Skip metadata messages
      if (msg.type === CURSOR_MESSAGE_TYPES.METADATA) {
        continue;
      }

      if (msg.type === CURSOR_MESSAGE_TYPES.USER) {
        // Flush any pending assistant message
        flushAssistant();

        if (msg.text?.trim()) {
          messages.push({
            id: msg.bubbleId || generateId(),
            type: "user",
            content: msg.text,
          });
        }
      } else if (msg.type === CURSOR_MESSAGE_TYPES.ASSISTANT) {
        const timestamp = normalizeTimestamp(msg.createdAt);

        // Initialize or continue building assistant message
        if (!currentAssistant) {
          currentAssistant = {
            id: msg.bubbleId || generateId(),
            content: [],
            toolCalls: [],
            timestamp,
          };
        }

        if (!msg.text?.trim() && !msg.toolCall) {
          continue;
        }

        // Add text content
        if (msg.text?.trim()) {
          currentAssistant.content.push(msg.text);
        }

        // Parse tool call if present
        if (msg.toolCall) {
          const toolCall = parseToolCall(msg.toolCall, timestamp);
          if (toolCall) {
            currentAssistant.toolCalls.push(toolCall);
          }
        }
      }
    }

    // Flush any remaining assistant message
    flushAssistant();

    return { messages };
  },
};

/**
 * Parse a Cursor tool call into an AthrdToolCall
 */
function parseToolCall(
  tc: CursorToolCall,
  timestamp: string
): AthrdToolCall | null {
  const toolName = tc.tool || "";
  if (!toolName) return null;

  const canonicalName = mapToolName(IDE.CURSOR, toolName);
  const toolId = tc.toolId?.toString() || generateId();

  // Extract params and result
  const params = tc.params || {};
  const resultData = tc.result || {};

  // Build result array
  const result =
    Object.keys(resultData).length > 0
      ? [
          {
            id: generateId(),
            name: toolName,
            output: JSON.stringify(resultData),
          },
        ]
      : [];

  switch (canonicalName) {
    case "todos":
      const todosResult = resultData as TodosToolCallResult;
      return createUpdatePlanToolCall({
        id: toolId,
        timestamp,
        plan:
          todosResult.finalTodos.map((todo) => ({
            id: todo.id,
            step: todo.content,
            status: todo.status,
          })) || [],
        result,
      });
    case "read_file":
      const fileParams = tc.params as ReadFileToolCallParams;

      return createReadFileToolCall({
        id: toolId,
        timestamp,
        filePath: fileParams.targetFile,
        result,
      });

    case "write_file":
      return createWriteFileToolCall({
        id: toolId,
        timestamp,
        filePath:
          (params.path as string) ||
          (params.filePath as string) ||
          (params.file_path as string) ||
          "",
        content: (params.content as string) || "",
        result,
      });

    case "terminal_command":
      return createTerminalCommandToolCall({
        id: toolId,
        timestamp,
        command: (params.command as string) || (params.cmd as string) || "",
        cwd: params.cwd as string | undefined,
        result,
      });

    default:
      return createUnknownToolCall({
        id: toolId,
        timestamp,
        name: toolName,
        args: params as Record<string, unknown>,
        result,
      });
  }
}

export default cursorParser;
