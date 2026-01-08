import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdThinking,
  AthrdToolCall,
  AthrdUserMessage,
  BaseToolResponse,
} from "@/types/athrd";
import type {
  ClaudeRequest,
  ClaudeThread,
  ImageToolResultContent,
  MessageContent,
  RequestAssistantMessage,
  ThinkingContent,
  ToolCallContent,
  ToolCallTodoWrite,
  ToolCallWebSearch,
  ToolCallWrite,
  ToolResultContent,
} from "@/types/claude";
import { IDE } from "@/types/ide";
import type { Parser } from "./base";
import {
  createReadFileToolCall,
  createReplaceToolCall,
  createSkillToolCall,
  createTerminalCommandToolCall,
  createUnknownToolCall,
  createUpdatePlanToolCall,
  createWebSearchToolCall,
  createWriteFileToolCall,
  generateId,
  mapToolName,
  normalizeTimestamp,
} from "./utils";

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
 * Filter requests, skipping tool result messages (they're handled in assistant parsing)
 */
function filterRequests(requests: ClaudeRequest[]): ClaudeRequest[] {
  return requests.filter((request) => {
    // Skip tool result messages as they're incorporated into tool calls
    if (
      request.message.role === "user" &&
      isToolResult(request.message.content)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Find tool result in subsequent requests
 */
function findToolResult(
  toolUseId: string,
  requests: ClaudeRequest[],
  startIndex: number
): string | Array<ImageToolResultContent> | undefined {
  for (let i = startIndex; i < requests.length; i++) {
    const req = requests[i]!;
    if (req.message.role === "user" && isToolResult(req.message.content)) {
      const result = req.message.content.find(
        (r) => r.tool_use_id === toolUseId
      );
      if (result && typeof result.content === "string") return result.content;
      if (result && Array.isArray(result.content)) {
        return result.content as Array<ImageToolResultContent>;
      }
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
      // Extract command-name if present
      const commandNameMatch = content.match(
        /<command-name>(.*?)<\/command-name>/
      );
      const extractedContent = commandNameMatch
        ? commandNameMatch[1]!
        : content;

      return {
        id: request.id || generateId(),
        type: "user",
        content: extractedContent,
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
 * Parse a single assistant request into an AthrdAssistantMessage
 */
function parseAssistantRequest(
  request: ClaudeRequest,
  allRequests: ClaudeRequest[]
): AthrdAssistantMessage | null {
  const assistantMsg = request.message as RequestAssistantMessage;

  // Collect all content, thoughts, and tool calls from this message
  const allThoughts: AthrdThinking[] = [];
  const allToolCalls: AthrdToolCall[] = [];
  const textContent: string[] = [];

  for (const content of assistantMsg.content) {
    if (content.type === "thinking") {
      const thinkingContent = content as ThinkingContent;

      allThoughts.push({
        subject: thinkingContent.thinking || "Thinking",
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

  return {
    id: assistantMsg.id || generateId(),
    type: "assistant",
    content: textContent.join("\n\n"),
    timestamp: normalizeTimestamp(request.timestamp),
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

  const result: Array<BaseToolResponse> = [];
  (Array.isArray(resultContent) ? resultContent : [resultContent])
    .map((rc) => {
      if (typeof rc === "string") {
        result.push({
          id: generateId(),
          name: tc.name,
          output: {
            type: "text",
            text: rc,
          },
        });
      } else if (rc && typeof rc === "object" && rc.type === "image") {
        result.push({
          id: generateId(),
          name: tc.name,
          output: {
            type: "image",
            data: rc.source.data,
            mimeType: rc.source.media_type,
          },
        });
      }

      return null;
    })
    .filter(Boolean);

  switch (canonicalName) {
    case "web_search":
      const webSearchTool = tc as ToolCallWebSearch;
      return createWebSearchToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        query: webSearchTool.input.query,
        result,
      });
    case "todos":
      const todosTool = tc as ToolCallTodoWrite;
      return createUpdatePlanToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        plan: todosTool.input.todos.map((t) => ({
          step: t.content,
          status: t.status,
        })),
        result,
      });
    case "skill":
      return createSkillToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        skillName: tc.input.skill as string,
        parameters: tc.input.parameters as Record<string, unknown>,
      });
    case "read_file":
      return createReadFileToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        filePath: tc.input.file_path as string,
        result,
      });

    case "write_file":
      const writeTool = tc as ToolCallWrite;

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

    // Filter out tool result messages (they're handled in assistant parsing)
    const filteredRequests = filterRequests(requests);

    for (const request of filteredRequests) {
      if (request.message.role === "assistant") {
        const assistantMessage = parseAssistantRequest(request, requests);
        if (assistantMessage) {
          messages.push(assistantMessage);
        }
      } else {
        const msg = parseSingleRequest(request, requests);
        if (msg) {
          messages.push(msg);
        }
      }
    }

    return { messages };
  },
};

export default claudeParser;
