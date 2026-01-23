import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdThinking,
  AthrdToolCall,
  AthrdUserMessage,
  AthrdUserMessageFileVariable,
  AthrdUserMessageImageVariable,
} from "@/types/athrd";
import { IDE } from "@/types/ide";
import type {
  MCPResultDetails,
  MCPToolSource,
  Request,
  ResponseItem,
  TextResponse,
  ThinkingToolResponse,
  ToolCallRound,
  ToolInvocationSerialized,
  VSCodeThread,
  VSCODEURI,
} from "@/types/vscode";
import type { Parser } from "./base";
import {
  createListDirectoryToolCall,
  createMCPToolCall,
  createReadFileToolCall,
  createReplaceToolCall,
  createTerminalCommandToolCall,
  createUnknownToolCall,
  createWriteFileToolCall,
  generateId,
  isMCPTool,
  mapToolName,
  normalizeTimestamp,
  safeJsonParse,
} from "./utils";

/**
 * Parser for VS Code Copilot Chat threads.
 * VS Code has a complex nested structure with requests containing response arrays.
 */
export const vscodeParser: Parser<VSCodeThread> = {
  id: IDE.VSCODE,

  canParse(rawThread: unknown): rawThread is VSCodeThread {
    if (!rawThread || typeof rawThread !== "object") return false;
    const thread = rawThread as Record<string, unknown>;

    // Check for VS Code-specific structure
    if (
      thread.sessionId &&
      Array.isArray(thread.requests) &&
      thread.requesterUsername !== undefined
    ) {
      return true;
    }

    // Check for requests with VS Code structure
    if (Array.isArray(thread.requests) && thread.requests.length > 0) {
      const firstRequest = thread.requests[0] as Record<string, unknown>;
      return (
        firstRequest.requestId !== undefined &&
        firstRequest.message !== undefined &&
        firstRequest.response !== undefined
      );
    }

    return false;
  },

  parse(rawThread: VSCodeThread): AThrd {
    const messages: (AthrdUserMessage | AthrdAssistantMessage)[] = [];

    for (const request of rawThread.requests) {
      const userMessage = parseUserRequest(request);
      if (userMessage) {
        messages.push(userMessage);
      }

      // Parse assistant response
      const assistantMessage = parseAssistantResponse(request);
      if (assistantMessage) {
        messages.push(assistantMessage);
      }
    }

    return { messages };
  },
};

/**
 * Parse the user request portion
 */
function parseUserRequest(request: Request): AthrdUserMessage | null {
  const content = request.message?.text?.trim();
  if (!content) return null;

  if (request.variableData) {
    const variables: Array<
      AthrdUserMessageFileVariable | AthrdUserMessageImageVariable
    > = [];

    for (const varData of request.variableData.variables!) {
      if (varData.kind === "file" && varData.value && "path" in varData.value) {
        variables.push({
          type: "file",
          path: varData.value.path,
        });
      }
    }
  }

  return {
    id: request.requestId || generateId(),
    type: "user",
    content,
  };
}

/**
 * Parse the assistant response portion
 */
function parseAssistantResponse(
  request: Request,
): AthrdAssistantMessage | null {
  const response = request.response;
  if (!response || response.length === 0) return null;

  const thoughts: AthrdThinking[] = [];
  const toolCalls: AthrdToolCall[] = [];
  const textContent: string[] = [];
  const timestamp = normalizeTimestamp(request.timestamp);

  // Process response items
  for (const item of response) {
    const responseItem = item as ResponseItem;

    // Handle text responses
    if ("value" in responseItem && typeof responseItem.value === "string") {
      const textResponse = responseItem as TextResponse;
      if (textResponse.value?.trim()) {
        textContent.push(textResponse.value);
      }
    }

    // Handle thinking
    if ("kind" in responseItem && responseItem.kind === "thinking") {
      const thinkingResponse = responseItem as ThinkingToolResponse;
      thoughts.push({
        subject: "Thinking",
        description: thinkingResponse.value,
        timestamp,
      });
    }

    // Handle tool invocations
    if (
      "kind" in responseItem &&
      responseItem.kind === "toolInvocationSerialized"
    ) {
      const toolInvocation = responseItem as ToolInvocationSerialized;
      const toolCall = parseToolInvocation(toolInvocation, timestamp);
      toolCalls.push(toolCall);
    }
  }

  // Also process tool calls from result metadata (for tool call rounds)
  if (request.result?.metadata?.toolCallRounds) {
    for (const round of request.result.metadata.toolCallRounds) {
      const roundTools = parseToolCallRound(
        round,
        timestamp,
        request.result.metadata.toolCallResults,
      );
      toolCalls.push(...roundTools);

      // Add thinking from round
      if (round.thinking) {
        thoughts.push({
          subject: "Thinking",
          description: round.thinking.text,
          timestamp,
        });
      }
    }
  }

  // Skip if there's no content
  if (
    textContent.length === 0 &&
    thoughts.length === 0 &&
    toolCalls.length === 0
  ) {
    return null;
  }

  return {
    id: request.responseId || generateId(),
    type: "assistant",
    content: textContent.join("\n\n"),
    timestamp,
    thoughts: thoughts.length > 0 ? thoughts : undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    model: request.modelId || "copilot",
  };
}

/**
 * Parse a tool invocation serialized response
 */
function parseToolInvocation(
  invocation: ToolInvocationSerialized,
  timestamp: string,
): AthrdToolCall {
  const toolId = invocation.toolCallId || generateId();
  const toolName = invocation.toolId || "";

  // Check if this is an MCP tool
  if (invocation.source?.type === "mcp") {
    const mcpSource = invocation.source as MCPToolSource;
    const resultDetails = invocation.resultDetails as
      | MCPResultDetails
      | undefined;

    return createMCPToolCall({
      id: toolId,
      timestamp,
      serverName: mcpSource.serverLabel || mcpSource.label || "mcp",
      toolName: resultDetails?.toolName || toolName,
      input: resultDetails?.input || "",
      result: resultDetails?.output
        ? [
            {
              id: generateId(),
              name: toolName,
              output: {
                type: "text",
                text: resultDetails.output.map((o) => o.value).join("\n"),
              },
            },
          ]
        : [],
    });
  }

  // Map to canonical name
  const canonicalName = mapToolName(IDE.VSCODE, toolName);

  // Extract file path from tool specific data
  const fileData = invocation.toolSpecificData as
    | { kind: string; file?: { uri?: VSCODEURI } }
    | undefined;
  const filePath =
    fileData?.kind === "file" && fileData.file?.uri
      ? extractPathFromUri(fileData.file.uri)
      : undefined;

  // Parse result from invocation message or result details
  const resultOutput = extractResultOutput(invocation);
  const result = resultOutput
    ? [
        {
          id: generateId(),
          name: toolName,
          output: {
            type: "text" as const,
            text: resultOutput,
          },
        },
      ]
    : [];

  switch (canonicalName) {
    case "read_file":
      return createReadFileToolCall({
        id: toolId,
        timestamp,
        filePath: filePath || "",
        result,
      });

    case "write_file":
      return createWriteFileToolCall({
        id: toolId,
        timestamp,
        filePath: filePath || "",
        content: "", // Content not always available in serialized form
        result,
      });

    case "replace":
      return createReplaceToolCall({
        id: toolId,
        timestamp,
        filePath: filePath || "",
        oldString: "",
        newString: "",
        result,
      });

    case "ls":
      return createListDirectoryToolCall({
        id: toolId,
        timestamp,
        dirPath: filePath || "",
        result,
      });

    case "terminal_command":
      const terminalData = invocation.toolSpecificData as
        | { kind: string; commandLine?: { original?: string } }
        | undefined;
      const command =
        terminalData?.kind === "terminal" && terminalData.commandLine?.original
          ? terminalData.commandLine.original
          : "";
      return createTerminalCommandToolCall({
        id: toolId,
        timestamp,
        command,
        result,
      });

    default:
      return createUnknownToolCall({
        id: toolId,
        timestamp,
        name: toolName,
        args: {
          toolSpecificData: invocation.toolSpecificData,
        },
        result,
      });
  }
}

/**
 * Parse tool calls from a tool call round (from result metadata)
 */
function parseToolCallRound(
  round: ToolCallRound,
  timestamp: string,
  toolCallResults?: Record<string, unknown>,
): AthrdToolCall[] {
  const toolCalls: AthrdToolCall[] = [];

  for (const tc of round.toolCalls) {
    const toolId = tc.id || generateId();
    const toolName = tc.name || "";
    const canonicalName = mapToolName(IDE.VSCODE, toolName);

    // Check if it's an MCP tool
    if (isMCPTool(toolName, IDE.VSCODE)) {
      const args = safeJsonParse<Record<string, unknown>>(tc.arguments, {});
      toolCalls.push(
        createMCPToolCall({
          id: toolId,
          timestamp,
          serverName: (args.serverName as string) || "mcp",
          toolName: toolName,
          input: tc.arguments,
          result: [],
        }),
      );
      continue;
    }

    // Parse arguments
    const args = safeJsonParse<Record<string, unknown>>(tc.arguments, {});

    // Get result if available
    const resultData = toolCallResults?.[tc.id];
    const resultOutput = extractToolCallResult(resultData);
    const result = resultOutput
      ? [
          {
            id: generateId(),
            name: toolName,
            output: {
              type: "text" as const,
              text: resultOutput,
            },
          },
        ]
      : [];

    switch (canonicalName) {
      case "read_file":
        toolCalls.push(
          createReadFileToolCall({
            id: toolId,
            timestamp,
            filePath: (args.filePath as string) || (args.path as string) || "",
            result,
          }),
        );
        break;

      case "write_file":
        toolCalls.push(
          createWriteFileToolCall({
            id: toolId,
            timestamp,
            filePath: (args.filePath as string) || (args.path as string) || "",
            content: (args.content as string) || "",
            result,
          }),
        );
        break;

      case "replace":
        toolCalls.push(
          createReplaceToolCall({
            id: toolId,
            timestamp,
            filePath: (args.filePath as string) || (args.path as string) || "",
            oldString: (args.oldString as string) || "",
            newString: (args.newString as string) || "",
            result,
          }),
        );
        break;

      case "ls":
        toolCalls.push(
          createListDirectoryToolCall({
            id: toolId,
            timestamp,
            dirPath: (args.path as string) || (args.dirPath as string) || "",
            result,
          }),
        );
        break;

      case "terminal_command":
        toolCalls.push(
          createTerminalCommandToolCall({
            id: toolId,
            timestamp,
            command: (args.command as string) || "",
            cwd: args.cwd as string | undefined,
            result,
          }),
        );
        break;

      default:
        toolCalls.push(
          createUnknownToolCall({
            id: toolId,
            timestamp,
            name: toolName,
            args,
            result,
          }),
        );
    }
  }

  return toolCalls;
}

/**
 * Extract path from VS Code URI
 */
function extractPathFromUri(uri: VSCODEURI | undefined): string {
  if (!uri) return "";
  return uri.path || "";
}

/**
 * Extract result output from tool invocation
 */
function extractResultOutput(
  invocation: ToolInvocationSerialized,
): string | undefined {
  // Try to get from result details
  if (invocation.resultDetails) {
    if (Array.isArray(invocation.resultDetails)) {
      return invocation.resultDetails
        .map((r) => (typeof r === "string" ? r : JSON.stringify(r)))
        .join("\n");
    }
    if (typeof invocation.resultDetails === "object") {
      const details = invocation.resultDetails as Record<string, unknown>;
      if (details.output) {
        return String(details.output);
      }
    }
  }

  // Try to get from invocation message
  if (invocation.invocationMessage?.value) {
    return invocation.invocationMessage.value;
  }

  return undefined;
}

/**
 * Extract output from tool call result
 */
function extractToolCallResult(resultData: unknown): string | undefined {
  if (!resultData) return undefined;

  if (typeof resultData === "string") {
    return resultData;
  }

  if (typeof resultData === "object") {
    const result = resultData as Record<string, unknown>;

    // Check for content array
    if (Array.isArray(result.content)) {
      return result.content
        .map((c) => {
          if (typeof c === "string") return c;
          if (typeof c === "object" && c !== null) {
            const content = c as Record<string, unknown>;
            if (content.value) return String(content.value);
          }
          return JSON.stringify(c);
        })
        .join("\n");
    }

    // Check for value
    if (result.value) {
      return String(result.value);
    }
  }

  return undefined;
}

export default vscodeParser;
