import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdThinking,
  AthrdToolCall,
  AthrdUserMessage,
} from "@/types/athrd";
import type {
  ClaudeRequest,
  ClaudeThread,
  MessageContent,
  RequestAssistantMessage,
  ThinkingContent,
  ToolCallContent,
  ToolResultContent,
} from "@/types/claude";
import { IDE } from "@/types/ide";
import type { Parser } from "./base";
import {
  createReadFileToolCall,
  createReplaceToolCall,
  createTerminalCommandToolCall,
  createUnknownToolCall,
  createWriteFileToolCall,
  generateId,
  mapToolName,
  normalizeTimestamp,
} from "./utils";

/**
 * Parser for Claude Code CLI threads.
 * Claude uses a request-based structure where tool results come in subsequent user messages.
 */
export const claudeParser: Parser<ClaudeThread> = {
  id: IDE.CLAUDE_CODE,

  canParse(rawThread: unknown): rawThread is ClaudeThread {
    if (!rawThread || typeof rawThread !== "object") return false;
    const thread = rawThread as Record<string, unknown>;

    // Check for Claude-specific structure: requests array with message.role
    if (!Array.isArray(thread.requests)) return false;
    if (thread.requests.length === 0) return true;

    const firstRequest = thread.requests[0] as Record<string, unknown>;
    return (
      firstRequest.message !== undefined &&
      typeof (firstRequest.message as Record<string, unknown>).role === "string"
    );
  },

  parse(rawThread: ClaudeThread): AThrd {
    const messages: (AthrdUserMessage | AthrdAssistantMessage)[] = [];
    const requests = rawThread.requests;

    // Group consecutive assistant messages
    const groupedRequests = groupRequests(requests);

    for (const item of groupedRequests) {
      if (Array.isArray(item)) {
        // Group of assistant messages - merge them into one
        const assistantMessage = parseAssistantGroup(item, requests);
        if (assistantMessage) {
          messages.push(assistantMessage);
        }
      } else {
        // Single request
        const msg = parseSingleRequest(item, requests);
        if (msg) {
          messages.push(msg);
        }
      }
    }

    return { messages };
  },
};

/**
 * Check if content is a tool result array
 */
function isToolResult(content: unknown): content is ToolResultContent[] {
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    (content[0] as Record<string, unknown>).type === "tool_result"
  );
}

/**
 * Group consecutive assistant messages together
 */
function groupRequests(
  requests: ClaudeRequest[]
): (ClaudeRequest | ClaudeRequest[])[] {
  const groupedRequests: (ClaudeRequest | ClaudeRequest[])[] = [];
  let currentAssistantGroup: ClaudeRequest[] = [];

  for (const request of requests) {
    if (request.message.role === "assistant") {
      currentAssistantGroup.push(request);
    } else if (
      request.message.role === "user" &&
      isToolResult(request.message.content)
    ) {
      // Tool result messages are absorbed by the tool use rendering
      if (currentAssistantGroup.length === 0) {
        groupedRequests.push(request);
      }
    } else {
      // Normal user message
      if (currentAssistantGroup.length > 0) {
        groupedRequests.push([...currentAssistantGroup]);
        currentAssistantGroup = [];
      }
      groupedRequests.push(request);
    }
  }

  if (currentAssistantGroup.length > 0) {
    groupedRequests.push([...currentAssistantGroup]);
  }

  return groupedRequests;
}

/**
 * Find tool result in subsequent requests
 */
function findToolResult(
  toolUseId: string,
  requests: ClaudeRequest[],
  startIndex: number
): string | undefined {
  for (let i = startIndex; i < requests.length; i++) {
    const req = requests[i]!;
    if (req.message.role === "user" && isToolResult(req.message.content)) {
      const result = req.message.content.find(
        (r) => r.tool_use_id === toolUseId
      );
      if (result) return result.content;
    }
    if (req.message.role === "user" && !isToolResult(req.message.content)) {
      break;
    }
  }
  return undefined;
}

/**
 * Parse a single request (user message or orphan tool result)
 */
function parseSingleRequest(
  request: ClaudeRequest,
  _requests: ClaudeRequest[]
): AthrdUserMessage | null {
  if (request.message.role === "user") {
    const content = request.message.content;

    // Skip tool result messages (they're handled in assistant parsing)
    if (isToolResult(content)) {
      return null;
    }

    // Handle string content
    if (typeof content === "string") {
      return {
        id: request.id || generateId(),
        type: "user",
        content,
      };
    }

    // Handle MessageContent array
    if (Array.isArray(content)) {
      const textParts = content
        .filter((c): c is MessageContent => c.type === "text")
        .map((c) => c.text);

      return {
        id: request.id || generateId(),
        type: "user",
        content: textParts.join("\n"),
      };
    }
  }

  return null;
}

/**
 * Parse a group of assistant messages into a single AthrdAssistantMessage
 */
function parseAssistantGroup(
  group: ClaudeRequest[],
  allRequests: ClaudeRequest[]
): AthrdAssistantMessage | null {
  if (group.length === 0) return null;

  const firstRequest = group[0]!;
  const assistantMsg = firstRequest.message as RequestAssistantMessage;

  // Collect all content, thoughts, and tool calls from the group
  const allThoughts: AthrdThinking[] = [];
  const allToolCalls: AthrdToolCall[] = [];
  const textContent: string[] = [];

  for (const request of group) {
    const msg = request.message as RequestAssistantMessage;

    for (const content of msg.content) {
      if (content.type === "thinking") {
        const thinkingContent = content as ThinkingContent;
        allThoughts.push({
          subject: "Thinking",
          description: thinkingContent.thinking,
          timestamp: normalizeTimestamp(request.timestamp),
        });
      } else if (content.type === "text") {
        const textMsg = content as MessageContent;
        if (textMsg.text.trim()) {
          textContent.push(textMsg.text);
        }
      } else if (content.type === "tool_use") {
        const toolCall = parseToolCall(
          content as ToolCallContent,
          request,
          allRequests
        );
        allToolCalls.push(toolCall);
      }
    }
  }

  return {
    id: assistantMsg.id || generateId(),
    type: "assistant",
    content: textContent.join("\n\n"),
    timestamp: normalizeTimestamp(firstRequest.timestamp),
    thoughts: allThoughts.length > 0 ? allThoughts : undefined,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    model: assistantMsg.model,
  };
}

/**
 * Parse a tool call content into an AthrdToolCall
 */
function parseToolCall(
  tc: ToolCallContent,
  request: ClaudeRequest,
  allRequests: ClaudeRequest[]
): AthrdToolCall {
  const canonicalName = mapToolName(IDE.CLAUDE_CODE, tc.name);
  const toolTimestamp = normalizeTimestamp(request.timestamp);
  const toolId = tc.id || generateId();

  // Find the tool result from subsequent messages
  const requestIndex = allRequests.indexOf(request);
  const resultContent = findToolResult(tc.id, allRequests, requestIndex + 1);

  const result = resultContent
    ? [
        {
          id: generateId(),
          name: tc.name,
          output: resultContent,
        },
      ]
    : [];

  switch (canonicalName) {
    case "read_file":
      return createReadFileToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        filePath: tc.input.file_path as string,
        result,
      });

    case "write_file":
      return createWriteFileToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        filePath: tc.input.file_path as string,
        content: tc.input.content as string,
        result,
      });

    case "replace":
      return createReplaceToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        filePath: tc.input.file_path as string,
        oldString: tc.input.old_string as string,
        newString: tc.input.new_string as string,
        result,
      });

    case "terminal_command":
      return createTerminalCommandToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        command: tc.input.command as string,
        result,
      });

    default:
      return createUnknownToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        name: tc.name,
        args: tc.input as Record<string, unknown>,
        result,
      });
  }
}

export default claudeParser;
