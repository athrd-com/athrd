import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdThinking,
  AthrdToolCall,
  AthrdUserMessage,
  BaseToolResponse,
  TodoStep,
} from "@/types/athrd";
import type {
  GeminiAssistantMessage,
  GeminiThread,
  GeminiToolCall,
  GeminiUserMessage,
} from "@/types/gemini";
import { IDE } from "@/types/ide";
import type { Parser } from "./base";
import {
  createListDirectoryToolCall,
  createReadFileToolCall,
  createReplaceToolCall,
  createTerminalCommandToolCall,
  createUnknownToolCall,
  createUpdatePlanToolCall,
  createWriteFileToolCall,
  generateId,
  mapToolName,
  normalizeTimestamp,
} from "./utils";

/**
 * Parser for Gemini CLI threads.
 * Gemini's format is already very close to AThrd, requiring minimal transformation.
 */
export const geminiParser: Parser<GeminiThread> = {
  id: IDE.GEMINI,

  canParse(rawThread: unknown): rawThread is GeminiThread {
    if (!rawThread || typeof rawThread !== "object") return false;
    const thread = rawThread as Record<string, unknown>;

    // Check for Gemini-specific structure: messages array with type: "gemini" or type: "user"
    if (!Array.isArray(thread.messages)) return false;
    if (thread.messages.length === 0) return true;

    const firstMessage = thread.messages[0] as Record<string, unknown>;
    return (
      firstMessage.type === "gemini" ||
      firstMessage.type === "user" ||
      // Also check for Gemini-specific fields
      ("thoughts" in firstMessage && "toolCalls" in firstMessage)
    );
  },

  parse(rawThread: GeminiThread): AThrd {
    const messages: (AthrdUserMessage | AthrdAssistantMessage)[] = [];

    for (const msg of rawThread.messages) {
      if (msg.type === "user") {
        messages.push(parseUserMessage(msg));
      } else {
        messages.push(parseAssistantMessage(msg));
      }
    }

    return { messages };
  },
};

function parseUserMessage(msg: GeminiUserMessage): AthrdUserMessage {
  return {
    id: msg.id || generateId(),
    type: "user",
    content: msg.content,
  };
}

function parseAssistantMessage(
  msg: GeminiAssistantMessage
): AthrdAssistantMessage {
  const thoughts: AthrdThinking[] | undefined = msg.thoughts?.map(
    (thought) => ({
      subject: thought.subject,
      description: thought.description,
      timestamp: normalizeTimestamp(thought.timestamp),
    })
  );

  const toolCalls: AthrdToolCall[] | undefined = msg.toolCalls?.map((tc) =>
    parseToolCall(tc, msg.timestamp)
  );

  return {
    id: msg.id || generateId(),
    type: "assistant",
    content: msg.content,
    timestamp: normalizeTimestamp(msg.timestamp),
    thoughts: thoughts?.length ? thoughts : undefined,
    toolCalls: toolCalls?.length ? toolCalls : undefined,
    model: msg.model,
  };
}

function parseToolCall(tc: GeminiToolCall, timestamp: string): AthrdToolCall {
  const canonicalName = mapToolName(IDE.GEMINI, tc.name);
  const toolTimestamp = normalizeTimestamp(tc.timestamp || timestamp);
  const toolId = tc.id || generateId();

  // Convert Gemini result format to AThrd result format
  const result: Array<BaseToolResponse> =
    tc.result?.map((r) => ({
      id: r.functionResponse.id || generateId(),
      name: r.functionResponse.name,
      output: { type: "text", text: r.functionResponse.response?.output ?? "" },
      error: r.functionResponse.response?.error,
    })) ?? [];

  switch (canonicalName) {
    case "read_file":
      return createReadFileToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        filePath: (tc.args as { file_path: string }).file_path,
        result,
      });

    case "write_file":
      return createWriteFileToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        filePath: (tc.args as { file_path: string; content: string }).file_path,
        content: (tc.args as { file_path: string; content: string }).content,
        result,
      });

    case "ls":
      return createListDirectoryToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        dirPath: (tc.args as { dir_path: string }).dir_path,
        result,
      });

    case "replace":
      return createReplaceToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        filePath: (
          tc.args as {
            file_path: string;
            old_string: string;
            new_string: string;
          }
        ).file_path,
        oldString: (
          tc.args as {
            file_path: string;
            old_string: string;
            new_string: string;
          }
        ).old_string,
        newString: (
          tc.args as {
            file_path: string;
            old_string: string;
            new_string: string;
          }
        ).new_string,
        result,
      });

    case "todos":
      return createUpdatePlanToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        plan: ((tc.args as { todos: Array<{ description: string; status: string }> }).todos ?? []).map(
          (todo: { description: string; status: string }) => ({
            step: todo.description,
            status: todo.status as TodoStep["status"],
          })
        ),
        result,
      });

    case "terminal_command":
      return createTerminalCommandToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        command: (tc.args as { command: string; description?: string }).command,
        result,
      });

    default:
      return createUnknownToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        name: tc.name,
        args: tc.args as Record<string, unknown>,
        result,
      });
  }
}

export default geminiParser;
