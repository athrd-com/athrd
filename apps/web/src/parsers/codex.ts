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
  CodexFunctionCallOutputPayload,
  CodexFunctionCallPayload,
  CodexMessage,
  CodexReasoningPayload,
  CodexResponseItem,
  CodexResponseMessagePayload,
  CodexThread,
  CodexTurnContextMessage,
} from "@/types/codex";
import { IDE } from "@/types/ide";
import type { Parser } from "./base";
import {
  createMCPToolCall,
  createTerminalCommandToolCall,
  createUnknownToolCall,
  createUpdatePlanToolCall,
  generateId,
  mapToolName,
  normalizeTimestamp,
  safeJsonParse,
} from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AssistantState {
  content: string[];
  thoughts: AthrdThinking[];
  toolCalls: AthrdToolCall[];
  timestamp: string;
  id: string;
}

interface ParseContext {
  messages: (AthrdUserMessage | AthrdAssistantMessage)[];
  functionOutputs: Map<string, CodexFunctionCallOutputPayload["output"]>;
  model: string;
  assistant: AssistantState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assistant State Management
// ─────────────────────────────────────────────────────────────────────────────

function createEmptyAssistantState(): AssistantState {
  return { content: [], thoughts: [], toolCalls: [], timestamp: "", id: "" };
}

function hasAssistantContent(state: AssistantState): boolean {
  return (
    state.content.length > 0 ||
    state.thoughts.length > 0 ||
    state.toolCalls.length > 0
  );
}

function flushAssistant(ctx: ParseContext): void {
  if (!hasAssistantContent(ctx.assistant)) return;

  ctx.messages.push({
    id: ctx.assistant.id || generateId(),
    type: "assistant",
    content: ctx.assistant.content.join("\n\n"),
    timestamp: ctx.assistant.timestamp || new Date().toISOString(),
    thoughts:
      ctx.assistant.thoughts.length > 0 ? ctx.assistant.thoughts : undefined,
    toolCalls:
      ctx.assistant.toolCalls.length > 0 ? ctx.assistant.toolCalls : undefined,
    model: ctx.model,
  });

  ctx.assistant = createEmptyAssistantState();
}

function ensureAssistantId(state: AssistantState): void {
  if (!state.id) state.id = generateId();
}
// ─────────────────────────────────────────────────────────────────────────────
// Response Item Handlers
// ─────────────────────────────────────────────────────────────────────────────

function extractTextContent(
  content: Array<{ type: string; text: string }>,
  textType: string
): string {
  return content
    .filter((c) => c.type === textType)
    .map((c) => c.text)
    .join("\n");
}

function handleResponseMessage(
  ctx: ParseContext,
  payload: CodexResponseMessagePayload,
  timestamp: string
): void {
  if (payload.role === "user") {
    flushAssistant(ctx);
    const textContent = extractTextContent(payload.content, "input_text");
    if (!textContent.trim()) return;

    // Skip environment context messages
    if (textContent.startsWith("<environment_context>")) return;

    ctx.messages.push({
      id: generateId(),
      type: "user",
      content: textContent,
    });
    return;
  }

  if (payload.role === "assistant") {
    const textContent = extractTextContent(payload.content, "output_text");
    if (!textContent.trim()) return;

    ctx.assistant.content.push(textContent);
    ctx.assistant.timestamp = normalizeTimestamp(timestamp);
    ensureAssistantId(ctx.assistant);
  }
}

function handleFunctionCall(
  ctx: ParseContext,
  payload: CodexFunctionCallPayload,
  timestamp: string
): void {
  const toolCall = parseFunctionCall(payload, timestamp, ctx.functionOutputs);
  ctx.assistant.toolCalls.push(toolCall);
  ctx.assistant.timestamp = normalizeTimestamp(timestamp);
  ensureAssistantId(ctx.assistant);
}

function handleReasoning(
  ctx: ParseContext,
  payload: CodexReasoningPayload,
  timestamp: string
): void {
  const normalizedTimestamp = normalizeTimestamp(timestamp);

  for (const summary of payload.summary ?? []) {
    const text = summary.text;
    let subject = "Reasoning";
    let description = text;

    if (text.startsWith("**")) {
      const endIndex = text.indexOf("**", 2);
      if (endIndex !== -1) {
        subject = text.substring(2, endIndex);
        const remaining = text.substring(endIndex + 2).trim();
        description = remaining || text;
      }
    }

    ctx.assistant.thoughts.push({
      subject,
      description,
      timestamp: normalizedTimestamp,
    });
  }

  // Add content if present (can be null)
  if (payload.content) {
    ctx.assistant.thoughts.push({
      subject: "Thinking",
      description: payload.content,
      timestamp: normalizedTimestamp,
    });
  }

  ensureAssistantId(ctx.assistant);
}

function processResponseItem(ctx: ParseContext, msg: CodexResponseItem): void {
  const { payload, timestamp } = msg;

  switch (payload.type) {
    case "message":
      handleResponseMessage(
        ctx,
        payload as CodexResponseMessagePayload,
        timestamp
      );
      break;
    case "function_call":
      handleFunctionCall(ctx, payload as CodexFunctionCallPayload, timestamp);
      break;
    case "reasoning":
      handleReasoning(ctx, payload as CodexReasoningPayload, timestamp);
      break;
    // Skip ghost_snapshot and function_call_output (handled via map)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Processing
// ─────────────────────────────────────────────────────────────────────────────

function processMessage(ctx: ParseContext, msg: CodexMessage): void {
  switch (msg.type) {
    case "turn_context": {
      const turnContext = msg as CodexTurnContextMessage;
      ctx.model = turnContext.payload.model || ctx.model;
      break;
    }
    case "response_item":
      processResponseItem(ctx, msg as CodexResponseItem);
      break;
    // Skip event_msg - user messages come from response_item
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser Validation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_MESSAGE_TYPES = new Set([
  "message",
  "event_msg",
  "response_item",
  "turn_context",
]);

function hasValidMessageStructure(thread: Record<string, unknown>): boolean {
  if (!thread.sessionId || !Array.isArray(thread.messages)) return false;
  if (thread.messages.length === 0) return true;

  const firstMessage = thread.messages[0] as Record<string, unknown>;
  return VALID_MESSAGE_TYPES.has(firstMessage.type as string);
}

function hasValidPayloadStructure(thread: Record<string, unknown>): boolean {
  if (!thread.payload || typeof thread.payload !== "object") return false;

  const payload = thread.payload as Record<string, unknown>;
  return payload.originator !== undefined || payload.cli_version !== undefined;
}

/**
 * Build a map of call_id -> output from function_call_output entries
 */
function buildFunctionOutputMap(
  messages: CodexMessage[]
): Map<string, CodexFunctionCallOutputPayload["output"]> {
  const outputMap = new Map<string, CodexFunctionCallOutputPayload["output"]>();

  for (const msg of messages) {
    if (msg.type === "response_item") {
      const responseItem = msg as CodexResponseItem;
      if (responseItem.payload.type === "function_call_output") {
        const outputPayload =
          responseItem.payload as CodexFunctionCallOutputPayload;
        outputMap.set(outputPayload.call_id, outputPayload.output);
      }
    }
  }

  return outputMap;
}

/**
 * Parse a function call into an AthrdToolCall
 */
function parseFunctionCall(
  payload: CodexFunctionCallPayload,
  timestamp: string,
  functionOutputs: Map<string, CodexFunctionCallOutputPayload["output"]>
): AthrdToolCall {
  const canonicalName = mapToolName(IDE.CODEX, payload.name);
  const toolTimestamp = normalizeTimestamp(timestamp);
  const toolId = payload.call_id || generateId();

  // Parse arguments from JSON string
  const args = safeJsonParse<Record<string, unknown>>(payload.arguments, {});

  // Get the output for this call
  const output = functionOutputs.get(payload.call_id);
  const result: BaseToolResponse[] = [];

  if (Array.isArray(output)) {
    result.push(
      ...output
        .map((r): BaseToolResponse | null => {
          if (r.type === "input_text") {
            // Try to parse as JSON first, fallback to raw text
            const parsedText = safeJsonParse<string>(r.text, r.text);

            return {
              id: generateId(),
              name: payload.name,
              output: { type: "text", text: parsedText },
            };
          }
          if (r.type === "input_image") {
            const match = r.image_url.match(/^data:([^;]+);base64,(.+)$/);
            const mimeType = match?.[1] || "image/png";
            const data = match?.[2] || r.image_url;

            return {
              id: generateId(),
              name: payload.name,
              output: { type: "image", mimeType, data },
            };
          }

          return null;
        })
        .filter((item): item is BaseToolResponse => item !== null)
    );
  } else {
    const json = safeJsonParse<string>(output || "", output || "");
    result.push({
      id: generateId(),
      name: payload.name,
      output: {
        type: "text",
        text: Array.isArray(json) ? json.map((j) => j.text).join("\n") : json,
      },
    });
  }

  switch (canonicalName) {
    case "terminal_command":
      return createTerminalCommandToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        command: (args.command as string) || (args.cmd as string) || "",
        cwd: args.cwd as string | undefined,
        result,
      });
    case "todos":
      return createUpdatePlanToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        plan: (args.plan as TodoStep[]) || [],
        result,
      });
    case "mcp_tool_call":
      const [_mcp, serverName, toolName] = payload.name.split("__");

      return createMCPToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        serverName: serverName ?? "Unknown Server",
        toolName: toolName ?? "Unknown Tool",
        input: (args.input as string) || "",
        cacheType:
          (args.cache_type as "ephemeral" | "persistent") || "ephemeral",
        result,
      });
    default:
      return createUnknownToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        name: payload.name,
        args,
        result,
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parser for Codex CLI threads.
 * Codex uses JSONL format with event_msg, response_item, and turn_context message types.
 * Function outputs are separate entries matched by call_id.
 */
export const codexParser: Parser<CodexThread> = {
  id: IDE.CODEX,

  canParse(rawThread: unknown): rawThread is CodexThread {
    if (!rawThread || typeof rawThread !== "object") return false;

    const thread = rawThread as Record<string, unknown>;
    return hasValidMessageStructure(thread) || hasValidPayloadStructure(thread);
  },

  parse(rawThread: CodexThread): AThrd {
    const ctx: ParseContext = {
      messages: [],
      functionOutputs: buildFunctionOutputMap(rawThread.messages),
      model: "codex",
      assistant: createEmptyAssistantState(),
    };

    for (const msg of rawThread.messages) {
      processMessage(ctx, msg);
      flushAssistant(ctx);
    }

    return { messages: ctx.messages };
  },
};

export default codexParser;
