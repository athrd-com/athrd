import type {
  AthrdSessionLog,
  CodeblockUriItem,
  CopilotResponseItem,
  ToolCall as CopilotToolCall,
  FileVariable,
  InlineReferenceItem,
  SimpleTextItem,
  TextEditGroupItem,
  UriLike,
} from "./providers/copilot";

// ============================================================================
// Types
// ============================================================================

export interface ParsedThread {
  id?: string;
  title?: string;
  createdAt?: number | string;
  sessionId?: string;
  requesterUsername?: string;
  responderUsername?: string;
  messages: NormalizedMessage[];
  metadata?: Record<string, unknown>;
}

export interface NormalizedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text?: string;
  html?: string;
  parts?: Array<{
    text?: string;
    range?: unknown;
  }>;
  attachments?: Attachment[];
  edits?: EditGroup[];
  toolCalls?: ToolCallData[];
  createdAt?: number | string;
  metadata?: Record<string, unknown>;
}

export interface Attachment {
  type: "file" | "image" | "uri" | "code";
  path?: string;
  url?: string;
  language?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface EditGroup {
  filePath: string;
  edits: Array<{
    range: {
      startLineNumber: number;
      endLineNumber: number;
    };
    oldText?: string;
    newText?: string;
  }>;
}

export interface ToolCallData {
  toolId?: string;
  toolName?: string;
  invocationMessage?: string;
  pastTenseMessage?: string;
  kind?: string;
  terminalCommand?: string;
  status?: "running" | "completed" | "failed";
  metadata?: Record<string, unknown>;
}

export class ThreadParseError extends Error {
  constructor(
    message: string,
    public formatAttempted?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = "ThreadParseError";
  }
}

// ============================================================================
// Format Detection
// ============================================================================

export type ThreadFormat = "vscode" | "custor" | "claude" | null;

export function detectFormat(payload: unknown): ThreadFormat {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const obj = payload as Record<string, unknown>;

  // VSCode: has session structure with requests array
  if (
    "requests" in obj &&
    Array.isArray(obj.requests) &&
    ("sessionId" in obj || "version" in obj)
  ) {
    return "vscode";
  }

  // Custor: has conversations or items array
  if ("conversations" in obj || ("items" in obj && Array.isArray(obj.items))) {
    return "custor";
  }

  // Claude: has messages array with author/role
  if ("messages" in obj && Array.isArray(obj.messages)) {
    const firstMsg = obj.messages[0] as Record<string, unknown>;
    if (firstMsg && ("author" in firstMsg || "role" in firstMsg)) {
      return "claude";
    }
  }

  return null;
}

// ============================================================================
// VSCode Parser
// ============================================================================

// Helper to extract file path from UriLike
function extractFilePath(uri: UriLike | undefined): string {
  if (!uri) return "Unknown file";
  return uri.fsPath || uri.path || "Unknown file";
}

// Helper to extract message value from SimpleMessageLike
function extractMessageValue(
  message: string | { value: string } | undefined
): string | undefined {
  if (!message) return undefined;
  if (typeof message === "string") return message;
  return message.value;
}

export function parseVSCode(payload: unknown): ParsedThread {
  if (!payload || typeof payload !== "object") {
    throw new ThreadParseError(
      "Invalid VSCode payload: not an object",
      "vscode"
    );
  }

  const session = payload as AthrdSessionLog;

  if (!session.requests || !Array.isArray(session.requests)) {
    throw new ThreadParseError(
      "Invalid VSCode payload: missing requests array",
      "vscode"
    );
  }

  const messages: NormalizedMessage[] = [];

  session.requests.forEach((request) => {
    // Add user message
    const userMessage: NormalizedMessage = {
      id: `${request.requestId}-user`,
      role: "user",
      text: request.message.text,
      parts: request.message.parts?.map((part) => ({
        text: part.text,
        range: part.range,
      })),
      metadata: {
        requestId: request.requestId,
      },
    };

    // Add file variables as attachments
    if (
      request.variableData?.variables &&
      request.variableData.variables.length > 0
    ) {
      userMessage.attachments = request.variableData.variables.map(
        (variable: FileVariable) => ({
          type: "file" as const,
          path: extractFilePath(variable.value),
          metadata: {
            id: variable.id,
            name: variable.name,
          },
        })
      );
    }

    messages.push(userMessage);

    // Process response items
    if (request.response && Array.isArray(request.response)) {
      const responseMessages = parseVSCodeResponse(
        request.response,
        request.requestId
      );
      messages.push(...responseMessages);
    }
  });

  return {
    id: session.initialLocation,
    title: undefined,
    createdAt: undefined,
    sessionId: session.initialLocation,
    requesterUsername: session.requesterUsername,
    responderUsername: session.responderUsername,
    messages,
    metadata: {
      version: session.version,
      requesterAvatarIconUri: session.requesterAvatarIconUri,
      responderAvatarIconUri: session.responderAvatarIconUri,
      initialLocation: session.initialLocation,
    },
  };
}

function parseVSCodeResponse(
  responseItems: CopilotResponseItem[],
  requestId: string
): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];
  let textParts: string[] = [];
  let currentEdits: EditGroup[] = [];
  let currentToolCalls: ToolCallData[] = [];
  let currentAttachments: Attachment[] = [];

  const flushMessage = (index: number) => {
    if (
      textParts.length > 0 ||
      currentEdits.length > 0 ||
      currentToolCalls.length > 0 ||
      currentAttachments.length > 0
    ) {
      messages.push({
        id: `${requestId}-assistant-${index}`,
        role: "assistant",
        text: textParts.join("\n"),
        edits: currentEdits.length > 0 ? currentEdits : undefined,
        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
        attachments:
          currentAttachments.length > 0 ? currentAttachments : undefined,
      });
      textParts = [];
      currentEdits = [];
      currentToolCalls = [];
      currentAttachments = [];
    }
  };

  responseItems.forEach((item, itemIndex) => {
    // Text edit groups (file diffs)
    if ("kind" in item && item.kind === "textEditGroup") {
      const editItem = item as TextEditGroupItem;
      const filePath = extractFilePath(editItem.uri);

      const editGroup: EditGroup = {
        filePath,
        edits: [],
      };

      // Process nested array structure
      if (editItem.edits && Array.isArray(editItem.edits)) {
        editItem.edits.forEach((editGroupArray) => {
          if (Array.isArray(editGroupArray)) {
            editGroupArray.forEach((edit) => {
              if (edit.range) {
                editGroup.edits.push({
                  range: {
                    startLineNumber: edit.range.startLineNumber,
                    endLineNumber: edit.range.endLineNumber,
                  },
                  newText: edit.text,
                });
              }
            });
          }
        });
      }

      if (editGroup.edits.length > 0) {
        currentEdits.push(editGroup);
      }
      return;
    }

    // Codeblock URIs (file references)
    if ("kind" in item && item.kind === "codeblockUri") {
      const codeblockItem = item as CodeblockUriItem;
      const filePath = extractFilePath(codeblockItem.uri);

      currentAttachments.push({
        type: "file",
        path: filePath,
        metadata: { isEdit: codeblockItem.isEdit },
      });
      return;
    }

    // Inline references
    if ("kind" in item && item.kind === "inlineReference") {
      const refItem = item as InlineReferenceItem;
      const filePath = extractFilePath(refItem.inlineReference);

      currentAttachments.push({
        type: "uri",
        path: filePath,
      });
      return;
    }

    // Tool calls
    if ("toolCallId" in item || "toolId" in item) {
      const toolCall = item as CopilotToolCall;

      const invocationMsg = extractMessageValue(toolCall.invocationMessage);
      const pastTenseMsg = extractMessageValue(toolCall.pastTenseMessage);

      currentToolCalls.push({
        toolId: toolCall.toolCallId || toolCall.toolId,
        toolName: toolCall.toolId,
        invocationMessage: invocationMsg,
        pastTenseMessage: pastTenseMsg,
        status: toolCall.isComplete ? "completed" : "running",
        metadata: {
          presentation: toolCall.presentation,
          source: toolCall.source,
          toolSpecificData: toolCall.toolSpecificData,
        },
      });
      return;
    }

    // Undo stop markers - skip these
    if ("kind" in item && item.kind === "undoStop") {
      return;
    }

    // Simple text items
    if ("value" in item && typeof item.value === "string") {
      const textItem = item as SimpleTextItem;
      textParts.push(textItem.value);
      return;
    }
  });

  // Flush remaining content
  flushMessage(responseItems.length);

  return messages;
}

// ============================================================================
// Main Entry Point
// ============================================================================

export function normalizeThread(payload: unknown): ParsedThread {
  const format = detectFormat(payload);

  if (!format) {
    throw new ThreadParseError("Unable to detect thread format");
  }

  try {
    switch (format) {
      case "vscode":
        return parseVSCode(payload);
      case "custor":
        // TODO: Implement Custor parser
        throw new ThreadParseError(
          "Custor format not yet implemented",
          "custor"
        );
      case "claude":
        // TODO: Implement Claude parser
        throw new ThreadParseError(
          "Claude format not yet implemented",
          "claude"
        );
      default:
        throw new ThreadParseError(`Unsupported format: ${format}`);
    }
  } catch (error) {
    if (error instanceof ThreadParseError) {
      throw error;
    }
    throw new ThreadParseError(
      `Failed to parse ${format} format`,
      format,
      error
    );
  }
}
