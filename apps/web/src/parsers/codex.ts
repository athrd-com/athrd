import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdThinking,
  AthrdToolCall,
  AthrdUserMessage,
  BaseToolResponse,
  RequestUserInputQuestion,
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
  createRequestUserInputToolCall,
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
  sessionId: string;
  messages: (AthrdUserMessage | AthrdAssistantMessage)[];
  functionOutputs: Map<string, CodexFunctionCallOutputPayload["output"]>;
  model: string;
  assistant: AssistantState;
  hasTaskStarted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assistant State Management
// ─────────────────────────────────────────────────────────────────────────────

function createEmptyAssistantState(): AssistantState {
  return { content: [], thoughts: [], toolCalls: [], timestamp: "", id: "" };
}

function createStableCodexMessageId(
  sessionId: string,
  role: "user" | "assistant",
  sourceIndex: number
): string {
  const input = `${sessionId}:${role}:${sourceIndex}`;
  let hashA = 0xdeadbeef ^ input.length;
  let hashB = 0x41c6ce57 ^ input.length;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 2654435761);
    hashB = Math.imul(hashB ^ code, 1597334677);
  }

  hashA =
    Math.imul(hashA ^ (hashA >>> 16), 2246822507) ^
    Math.imul(hashB ^ (hashB >>> 13), 3266489909);
  hashB =
    Math.imul(hashB ^ (hashB >>> 16), 2246822507) ^
    Math.imul(hashA ^ (hashA >>> 13), 3266489909);

  const stableHash = (
    4294967296 * (2097151 & hashB) +
    (hashA >>> 0)
  ).toString(36);

  return `codex-${role}-${stableHash}`;
}

function hasAssistantContent(state: AssistantState): boolean {
  return (
    state.content.length > 0 ||
    state.thoughts.length > 0 ||
    state.toolCalls.length > 0
  );
}

function hasAssistantText(state: AssistantState): boolean {
  return state.content.length > 0;
}

function flushAssistant(ctx: ParseContext): void {
  if (!hasAssistantContent(ctx.assistant)) return;

  ctx.messages.push({
    id:
      ctx.assistant.id ||
      createStableCodexMessageId(
        ctx.sessionId,
        "assistant",
        ctx.messages.length
      ),
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

function ensureAssistantId(
  ctx: ParseContext,
  state: AssistantState,
  sourceIndex: number
): void {
  if (!state.id) {
    state.id = createStableCodexMessageId(
      ctx.sessionId,
      "assistant",
      sourceIndex
    );
  }
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
  timestamp: string,
  sourceIndex: number
): void {
  if (!ctx.hasTaskStarted) return;

  if (payload.role === "user") {
    flushAssistant(ctx);
    const textContent = extractTextContent(payload.content, "input_text");
    if (!textContent.trim()) return;

    // Skip environment context messages
    if (textContent.startsWith("<environment_context>")) return;

    ctx.messages.push({
      id: createStableCodexMessageId(ctx.sessionId, "user", sourceIndex),
      type: "user",
      content: textContent,
    });
    return;
  }

  if (payload.role === "assistant") {
    const textContent = extractTextContent(payload.content, "output_text");
    if (!textContent.trim()) return;

    // Preserve event ordering by separating text blocks from reasoning/tool blocks.
    // When text arrives after non-text assistant events, flush first.
    if (hasAssistantContent(ctx.assistant) && !hasAssistantText(ctx.assistant)) {
      flushAssistant(ctx);
    }

    ctx.assistant.content.push(textContent);
    ctx.assistant.timestamp = normalizeTimestamp(timestamp);
    ensureAssistantId(ctx, ctx.assistant, sourceIndex);
  }
}

function handleFunctionCall(
  ctx: ParseContext,
  payload: CodexFunctionCallPayload,
  timestamp: string,
  sourceIndex: number
): void {
  // Preserve event ordering by separating text blocks from reasoning/tool blocks.
  if (hasAssistantText(ctx.assistant)) {
    flushAssistant(ctx);
  }

  const toolCall = parseFunctionCall(payload, timestamp, ctx.functionOutputs);
  ctx.assistant.toolCalls.push(toolCall);
  ctx.assistant.timestamp = normalizeTimestamp(timestamp);
  ensureAssistantId(ctx, ctx.assistant, sourceIndex);
}

function handleReasoning(
  ctx: ParseContext,
  payload: CodexReasoningPayload,
  timestamp: string,
  sourceIndex: number
): void {
  // Preserve event ordering by separating text blocks from reasoning/tool blocks.
  if (hasAssistantText(ctx.assistant)) {
    flushAssistant(ctx);
  }

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

  ensureAssistantId(ctx, ctx.assistant, sourceIndex);
}

function processResponseItem(
  ctx: ParseContext,
  msg: CodexResponseItem,
  sourceIndex: number
): void {
  const { payload, timestamp } = msg;

  switch (payload.type) {
    case "message":
      handleResponseMessage(
        ctx,
        payload as CodexResponseMessagePayload,
        timestamp,
        sourceIndex
      );
      break;
    case "function_call":
      handleFunctionCall(
        ctx,
        payload as CodexFunctionCallPayload,
        timestamp,
        sourceIndex
      );
      break;
    case "reasoning":
      handleReasoning(
        ctx,
        payload as CodexReasoningPayload,
        timestamp,
        sourceIndex
      );
      break;
    // Skip ghost_snapshot and function_call_output (handled via map)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Processing
// ─────────────────────────────────────────────────────────────────────────────

function processMessage(
  ctx: ParseContext,
  msg: CodexMessage,
  sourceIndex: number
): void {
  switch (msg.type) {
    case "event_msg": {
      const payload = (msg as { payload?: { type?: string } }).payload;
      if (payload?.type === "task_started") {
        ctx.hasTaskStarted = true;
      }
      break;
    }
    case "turn_context": {
      const turnContext = msg as CodexTurnContextMessage;
      ctx.model = turnContext.payload.model || ctx.model;
      break;
    }
    case "response_item":
      processResponseItem(ctx, msg as CodexResponseItem, sourceIndex);
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

function extractAnswersByQuestionId(
  output: CodexFunctionCallOutputPayload["output"] | undefined
): Map<string, string[]> {
  const answersByQuestionId = new Map<string, string[]>();

  const collectFromAnswersMap = (value: unknown) => {
    if (!value || typeof value !== "object") return;

    const answerMap = (value as { answers?: unknown }).answers;
    if (!answerMap || typeof answerMap !== "object") return;

    const answersRecord = answerMap as Record<string, { answers?: string[] }>;
    for (const [questionId, answer] of Object.entries(answersRecord)) {
      if (!Array.isArray(answer?.answers)) continue;
      const labels = answer.answers.filter(
        (label): label is string => typeof label === "string" && label.length > 0
      );
      if (labels.length === 0) continue;

      const existing = answersByQuestionId.get(questionId) || [];
      answersByQuestionId.set(questionId, [...existing, ...labels]);
    }
  };

  if (typeof output === "string") {
    const parsedOutput = safeJsonParse<unknown>(output, null);
    if (Array.isArray(parsedOutput)) {
      for (const item of parsedOutput) {
        const outputText = (item as { output?: { text?: unknown } })?.output
          ?.text;
        collectFromAnswersMap(outputText);
      }
    } else {
      collectFromAnswersMap(parsedOutput);
    }
    return answersByQuestionId;
  }

  if (Array.isArray(output)) {
    for (const entry of output) {
      if (entry.type !== "input_text") continue;
      const parsedText = safeJsonParse<unknown>(entry.text, entry.text);
      collectFromAnswersMap(parsedText);
    }
  }

  return answersByQuestionId;
}

type RawRequestUserInputQuestion = {
  id?: string;
  header?: string;
  question?: string;
  options?: Array<{ label?: string; description?: string }>;
};

function buildRequestUserInputQuestions(
  args: Record<string, unknown>,
  output: CodexFunctionCallOutputPayload["output"] | undefined
): RequestUserInputQuestion[] {
  const questions = Array.isArray(args.questions)
    ? (args.questions as RawRequestUserInputQuestion[])
    : [];
  if (questions.length === 0) return [];

  const answersByQuestionId = extractAnswersByQuestionId(output);

  return questions.map((question, index) => {
    const questionId = question.id || `question-${index + 1}`;
    const options = Array.isArray(question.options) ? question.options : [];
    const selectedLabels = new Set(answersByQuestionId.get(questionId) || []);
    const optionMap = options
      .map((option) => ({
        label: option?.label || "",
        description: option?.description,
      }))
      .filter((option) => option.label.length > 0);
    const knownLabels = new Set(optionMap.map((option) => option.label));
    const customSelectedLabels = [...selectedLabels].filter(
      (label) => !knownLabels.has(label)
    );

    return {
      id: questionId,
      header: question.header,
      question: question.question || question.header || "Question",
      options: [
        ...optionMap.map((option) => ({
          label: option.label,
          description: option.description,
          type: selectedLabels.has(option.label) ? ("selected" as const) : undefined,
        })),
        ...customSelectedLabels.map((label) => ({
          label,
          type: "other" as const,
        })),
      ],
    };
  });
}

function normalizeToolTextOutput(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";

  if (Array.isArray(value)) {
    const textItems = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof (item as { text?: unknown }).text === "string"
        ) {
          return (item as { text: string }).text;
        }
        return null;
      })
      .filter((item): item is string => item !== null);

    if (textItems.length > 0) return textItems.join("\n");
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
            // Try to parse as JSON first, then normalize to display-safe text
            const parsedText = safeJsonParse<unknown>(r.text, r.text);

            return {
              id: generateId(),
              name: payload.name,
              output: {
                type: "text",
                text: normalizeToolTextOutput(parsedText),
              },
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
    const json = safeJsonParse<unknown>(output || "", output || "");
    result.push({
      id: generateId(),
      name: payload.name,
      output: {
        type: "text",
        text: normalizeToolTextOutput(json),
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
    case "request_user_input":
      return createRequestUserInputToolCall({
        id: toolId,
        timestamp: toolTimestamp,
        questions: buildRequestUserInputQuestions(args, output),
        result,
      });
    case "mcp_tool_call": {
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
    }
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
      sessionId: rawThread.sessionId,
      messages: [],
      functionOutputs: buildFunctionOutputMap(rawThread.messages),
      model: "codex",
      assistant: createEmptyAssistantState(),
      hasTaskStarted: false,
    };

    for (const [sourceIndex, msg] of rawThread.messages.entries()) {
      processMessage(ctx, msg, sourceIndex);
    }

    // Flush any remaining assistant content
    flushAssistant(ctx);

    return { messages: ctx.messages };
  },
};

export default codexParser;
