import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdThinking,
  AthrdToolCall,
  AthrdUserMessage,
  BaseToolResponse,
} from "@/types/athrd";
import { IDE } from "@/types/ide";
import type {
  PiAgentMessage,
  PiAssistantContent,
  PiAssistantMessage,
  PiBashExecutionMessage,
  PiCompactionEntry,
  PiCompactionSummaryMessage,
  PiCustomMessage,
  PiCustomMessageEntry,
  PiEntry,
  PiImageContent,
  PiMessageEntry,
  PiTextContent,
  PiThread,
  PiToolCallContent,
  PiToolResultContent,
  PiToolResultMessage,
  PiUserContent,
  PiUserMessage,
} from "@/types/pi";
import type { Parser } from "./base";
import {
  createListDirectoryToolCall,
  createReadFileToolCall,
  createReplaceToolCall,
  createTerminalCommandToolCall,
  createUnknownToolCall,
  createWriteFileToolCall,
  generateId,
  mapToolName,
  normalizeTimestamp,
} from "./utils";

type ToolResultMap = Map<string, PiToolResultMessage[]>;

function getEntries(rawThread: PiThread): PiEntry[] {
  if (Array.isArray(rawThread.entries)) {
    return rawThread.entries;
  }

  if (Array.isArray(rawThread.messages)) {
    return rawThread.messages;
  }

  return [];
}

function hasEntryId(entry: PiEntry): entry is PiEntry & { id: string } {
  return typeof entry.id === "string" && entry.id.length > 0;
}

function selectCurrentBranch(entries: PiEntry[]): PiEntry[] {
  const entriesById = new Map<string, PiEntry>();
  for (const entry of entries) {
    if (hasEntryId(entry)) {
      entriesById.set(entry.id, entry);
    }
  }

  let leaf: (PiEntry & { id: string }) | undefined;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && hasEntryId(entry)) {
      leaf = entry;
      break;
    }
  }
  if (!leaf) {
    return entries;
  }

  const branch: PiEntry[] = [];
  const seen = new Set<string>();
  let current: PiEntry | undefined = leaf;

  while (current && hasEntryId(current) && !seen.has(current.id)) {
    seen.add(current.id);
    branch.push(current);

    const parentId: string | undefined =
      typeof current.parentId === "string" && current.parentId.length > 0
        ? current.parentId
        : undefined;
    current = parentId ? entriesById.get(parentId) : undefined;
  }

  return branch.reverse();
}

function buildToolResultMap(entries: PiEntry[]): ToolResultMap {
  const resultMap: ToolResultMap = new Map();

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = (entry as PiMessageEntry).message;
    if (message.role !== "toolResult") continue;

    const result = message as PiToolResultMessage;
    const existing = resultMap.get(result.toolCallId) || [];
    resultMap.set(result.toolCallId, [...existing, result]);
  }

  return resultMap;
}

function isTextContent(
  content: PiUserContent | PiAssistantContent | PiToolResultContent
): content is PiTextContent {
  return content.type === "text";
}

function isImageContent(
  content: PiUserContent | PiAssistantContent | PiToolResultContent
): content is PiImageContent {
  return content.type === "image";
}

function imageMarkdown(content: PiImageContent, index: number): string {
  return `![Image ${index}](data:${content.mimeType};base64,${content.data})`;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractDisplayContent(content: string | PiUserContent[]): string {
  if (typeof content === "string") {
    return content;
  }

  let imageIndex = 0;
  return content
    .map((item) => {
      if (isTextContent(item)) {
        return item.text;
      }

      if (isImageContent(item)) {
        imageIndex += 1;
        return imageMarkdown(item, imageIndex);
      }

      return null;
    })
    .filter((item): item is string => item !== null && item.length > 0)
    .join("\n");
}

function getMessageTimestamp(
  entry: PiMessageEntry,
  message: PiAgentMessage
): string | number {
  return message.timestamp ?? entry.timestamp;
}

function parseUserMessage(entry: PiMessageEntry): AthrdUserMessage | null {
  const userMessage = entry.message as PiUserMessage;
  const content = extractDisplayContent(userMessage.content);
  if (!content.trim()) {
    return null;
  }

  return {
    id: entry.id || generateId(),
    type: "user",
    content,
  };
}

function parseCustomMessage(
  entry: PiMessageEntry,
  message: PiCustomMessage
): AthrdUserMessage | null {
  if (message.display === false) {
    return null;
  }

  const content = extractDisplayContent(message.content);
  if (!content.trim()) {
    return null;
  }

  return {
    id: entry.id || generateId(),
    type: "user",
    content,
  };
}

function parseCustomMessageEntry(
  entry: PiCustomMessageEntry
): AthrdUserMessage | null {
  if (entry.display === false) {
    return null;
  }

  const content = extractDisplayContent(entry.content);
  if (!content.trim()) {
    return null;
  }

  return {
    id: entry.id || generateId(),
    type: "user",
    content,
  };
}

function parseSummaryMessage(
  id: string,
  timestamp: string | number,
  subject: string,
  summary: string,
  model?: string
): AthrdAssistantMessage | null {
  if (!summary.trim()) {
    return null;
  }

  const normalizedTimestamp = normalizeTimestamp(timestamp);
  return {
    id,
    type: "assistant",
    timestamp: normalizedTimestamp,
    thoughts: [
      {
        subject,
        description: summary,
        timestamp: normalizedTimestamp,
      },
    ],
    model,
  };
}

function parseAssistantMessage(
  entry: PiMessageEntry,
  message: PiAssistantMessage,
  toolResults: ToolResultMap,
  currentModel?: string
): AthrdAssistantMessage | null {
  const textContent: string[] = [];
  const thoughts: AthrdThinking[] = [];
  const toolCalls: AthrdToolCall[] = [];
  const timestamp = getMessageTimestamp(entry, message);
  const normalizedTimestamp = normalizeTimestamp(timestamp);

  for (const content of message.content) {
    if (content.type === "text" && content.text.trim()) {
      textContent.push(content.text);
    } else if (content.type === "image") {
      textContent.push(imageMarkdown(content, textContent.length + 1));
    } else if (content.type === "thinking" && content.thinking.trim()) {
      thoughts.push({
        subject: "Thinking",
        description: content.thinking,
        timestamp: normalizedTimestamp,
      });
    } else if (content.type === "toolCall") {
      toolCalls.push(parseToolCall(content, normalizedTimestamp, toolResults));
    }
  }

  if (
    textContent.length === 0 &&
    thoughts.length === 0 &&
    toolCalls.length === 0 &&
    !message.errorMessage
  ) {
    return null;
  }

  if (message.errorMessage) {
    thoughts.push({
      subject: "Error",
      description: message.errorMessage,
      timestamp: normalizedTimestamp,
    });
  }

  return {
    id: entry.id || generateId(),
    type: "assistant",
    content: textContent.join("\n\n"),
    timestamp: normalizedTimestamp,
    thoughts: thoughts.length > 0 ? thoughts : undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    model: message.model || currentModel,
  };
}

function parseBashExecutionMessage(
  entry: PiMessageEntry,
  message: PiBashExecutionMessage
): AthrdAssistantMessage {
  const timestamp = normalizeTimestamp(getMessageTimestamp(entry, message));
  const outputText = message.output || "";
  const result: BaseToolResponse[] = [
    {
      id: generateId(),
      name: "bash",
      ...(message.exitCode && message.exitCode !== 0
        ? { error: outputText }
        : { output: { type: "text" as const, text: outputText } }),
    },
  ];

  return {
    id: entry.id || generateId(),
    type: "assistant",
    timestamp,
    toolCalls: [
      createTerminalCommandToolCall({
        id: entry.id || generateId(),
        timestamp,
        command: message.command,
        result,
      }),
    ],
  };
}

function parseToolResultResponses(
  toolName: string,
  results: PiToolResultMessage[]
): BaseToolResponse[] {
  const responses: BaseToolResponse[] = [];

  for (const result of results) {
    let hasContent = false;

    for (const content of result.content || []) {
      hasContent = true;

      if (isTextContent(content)) {
        responses.push({
          id: generateId(),
          name: result.toolName || toolName,
          ...(result.isError
            ? { error: content.text }
            : { output: { type: "text" as const, text: content.text } }),
        });
      } else if (isImageContent(content)) {
        responses.push({
          id: generateId(),
          name: result.toolName || toolName,
          output: {
            type: "image",
            data: content.data,
            mimeType: content.mimeType,
          },
        });
      }
    }

    if (!hasContent && result.details !== undefined) {
      responses.push({
        id: generateId(),
        name: result.toolName || toolName,
        ...(result.isError
          ? { error: stringifyValue(result.details) }
          : {
              output: {
                type: "text" as const,
                text: stringifyValue(result.details),
              },
            }),
      });
    }
  }

  return responses;
}

function getStringArg(
  args: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

function parseToolCall(
  toolCall: PiToolCallContent,
  timestamp: string,
  toolResults: ToolResultMap
): AthrdToolCall {
  const canonicalName = mapToolName(IDE.PI, toolCall.name);
  const args = toolCall.arguments || {};
  const result = parseToolResultResponses(
    toolCall.name,
    toolResults.get(toolCall.id) || []
  );

  switch (canonicalName) {
    case "read_file":
      return createReadFileToolCall({
        id: toolCall.id || generateId(),
        timestamp,
        filePath:
          getStringArg(args, ["file_path", "filePath", "path", "file"]) || "",
        result,
      });
    case "write_file":
      return createWriteFileToolCall({
        id: toolCall.id || generateId(),
        timestamp,
        filePath:
          getStringArg(args, ["file_path", "filePath", "path", "file"]) || "",
        content: getStringArg(args, ["content", "text"]) || "",
        result,
      });
    case "replace":
      return createReplaceToolCall({
        id: toolCall.id || generateId(),
        timestamp,
        filePath:
          getStringArg(args, ["file_path", "filePath", "path", "file"]) || "",
        oldString:
          getStringArg(args, ["old_string", "oldString", "oldText"]) || "",
        newString:
          getStringArg(args, ["new_string", "newString", "newText"]) || "",
        result,
      });
    case "terminal_command":
      return createTerminalCommandToolCall({
        id: toolCall.id || generateId(),
        timestamp,
        command: getStringArg(args, ["command", "cmd", "shell"]) || "",
        cwd: getStringArg(args, ["cwd"]),
        result,
      });
    case "ls":
      return createListDirectoryToolCall({
        id: toolCall.id || generateId(),
        timestamp,
        dirPath: getStringArg(args, ["dir_path", "dirPath", "path", "dir"]) || "",
        result,
      });
    default:
      return createUnknownToolCall({
        id: toolCall.id || generateId(),
        timestamp,
        name: toolCall.name,
        args,
        result,
      });
  }
}

function isPiThreadShape(thread: Record<string, unknown>): boolean {
  const entries = Array.isArray(thread.entries)
    ? thread.entries
    : thread.messages;

  return (
    thread.type === "session" &&
    Array.isArray(entries) &&
    (typeof thread.sessionId === "string" ||
      typeof thread.id === "string" ||
      typeof thread.cwd === "string" ||
      typeof thread.version === "number")
  );
}

export const piParser: Parser<PiThread> = {
  id: IDE.PI,

  canParse(rawThread: unknown): rawThread is PiThread {
    if (!rawThread || typeof rawThread !== "object") return false;
    return isPiThreadShape(rawThread as Record<string, unknown>);
  },

  parse(rawThread: PiThread): AThrd {
    const branchEntries = selectCurrentBranch(getEntries(rawThread));
    const toolResults = buildToolResultMap(branchEntries);
    const messages: (AthrdUserMessage | AthrdAssistantMessage)[] = [];
    let currentModel: string | undefined;

    for (const entry of branchEntries) {
      if (entry.type === "model_change") {
        const modelId = (entry as { modelId?: string }).modelId;
        if (typeof modelId === "string" && modelId.length > 0) {
          currentModel = modelId;
        }
        continue;
      }

      if (entry.type === "custom_message") {
        const message = parseCustomMessageEntry(entry as PiCustomMessageEntry);
        if (message) {
          messages.push(message);
        }
        continue;
      }

      if (entry.type === "compaction") {
        const compaction = entry as PiCompactionEntry;
        const message = parseSummaryMessage(
          compaction.id,
          compaction.timestamp,
          "Compaction",
          compaction.summary,
          currentModel
        );
        if (message) {
          messages.push(message);
        }
        continue;
      }

      if (entry.type === "branch_summary") {
        const branchSummary = entry as { id: string; timestamp: string; summary: string };
        const message = parseSummaryMessage(
          branchSummary.id,
          branchSummary.timestamp,
          "Branch summary",
          branchSummary.summary,
          currentModel
        );
        if (message) {
          messages.push(message);
        }
        continue;
      }

      if (entry.type !== "message") {
        continue;
      }

      const messageEntry = entry as PiMessageEntry;
      const agentMessage = messageEntry.message;

      switch (agentMessage.role) {
        case "user": {
          const parsedMessage = parseUserMessage(messageEntry);
          if (parsedMessage) {
            messages.push(parsedMessage);
          }
          break;
        }
        case "assistant": {
          const parsedMessage = parseAssistantMessage(
            messageEntry,
            agentMessage,
            toolResults,
            currentModel
          );
          if (parsedMessage) {
            messages.push(parsedMessage);
          }
          break;
        }
        case "toolResult":
          break;
        case "bashExecution":
          messages.push(parseBashExecutionMessage(messageEntry, agentMessage));
          break;
        case "custom": {
          const parsedMessage = parseCustomMessage(messageEntry, agentMessage);
          if (parsedMessage) {
            messages.push(parsedMessage);
          }
          break;
        }
        case "branchSummary": {
          const parsedMessage = parseSummaryMessage(
            messageEntry.id,
            getMessageTimestamp(messageEntry, agentMessage),
            "Branch summary",
            agentMessage.summary,
            currentModel
          );
          if (parsedMessage) {
            messages.push(parsedMessage);
          }
          break;
        }
        case "compactionSummary": {
          const compaction = agentMessage as PiCompactionSummaryMessage;
          const parsedMessage = parseSummaryMessage(
            messageEntry.id,
            getMessageTimestamp(messageEntry, compaction),
            "Compaction",
            compaction.summary,
            currentModel
          );
          if (parsedMessage) {
            messages.push(parsedMessage);
          }
          break;
        }
      }
    }

    return { messages };
  },
};

export default piParser;
