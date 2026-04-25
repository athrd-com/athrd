export interface PiThread {
  sessionId: string;
  id?: string;
  type: "session";
  version?: number;
  timestamp: string;
  cwd?: string;
  parentSession?: string;
  customTitle?: string;
  updatedAt?: string;
  entries?: PiEntry[];
  messages?: PiEntry[];
}

interface PiEntryBase {
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface PiSessionInfoEntry extends PiEntryBase {
  type: "session_info";
  name?: string;
}

export interface PiModelChangeEntry extends PiEntryBase {
  type: "model_change";
  provider?: string;
  modelId?: string;
}

export interface PiThinkingLevelChangeEntry extends PiEntryBase {
  type: "thinking_level_change";
  thinkingLevel?: string;
}

export interface PiCompactionEntry extends PiEntryBase {
  type: "compaction";
  summary: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
  details?: unknown;
}

export interface PiBranchSummaryEntry extends PiEntryBase {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: unknown;
}

export interface PiCustomEntry extends PiEntryBase {
  type: "custom";
  customType: string;
  data?: unknown;
}

export interface PiCustomMessageEntry extends PiEntryBase {
  type: "custom_message";
  customType: string;
  content: PiUserMessage["content"];
  display?: boolean;
  details?: unknown;
}

export interface PiLabelEntry extends PiEntryBase {
  type: "label";
  targetId: string;
  label?: string;
}

export interface PiMessageEntry extends PiEntryBase {
  type: "message";
  message: PiAgentMessage;
}

export type PiEntry =
  | PiSessionInfoEntry
  | PiModelChangeEntry
  | PiThinkingLevelChangeEntry
  | PiCompactionEntry
  | PiBranchSummaryEntry
  | PiCustomEntry
  | PiCustomMessageEntry
  | PiLabelEntry
  | PiMessageEntry
  | (PiEntryBase & Record<string, unknown>);

export interface PiTextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

export interface PiImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface PiThinkingContent {
  type: "thinking";
  thinking: string;
}

export interface PiToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type PiUserContent = PiTextContent | PiImageContent;
export type PiAssistantContent =
  | PiTextContent
  | PiImageContent
  | PiThinkingContent
  | PiToolCallContent;
export type PiToolResultContent = PiTextContent | PiImageContent;

export interface PiUserMessage {
  role: "user";
  content: string | PiUserContent[];
  timestamp?: number;
}

export interface PiAssistantMessage {
  role: "assistant";
  content: PiAssistantContent[];
  api?: string;
  provider?: string;
  model?: string;
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp?: number;
}

export interface PiToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: PiToolResultContent[];
  details?: unknown;
  isError?: boolean;
  timestamp?: number;
}

export interface PiBashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp?: number;
}

export interface PiCustomMessage {
  role: "custom";
  customType: string;
  content: string | PiUserContent[];
  display?: boolean;
  details?: unknown;
  timestamp?: number;
}

export interface PiBranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp?: number;
}

export interface PiCompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore?: number;
  timestamp?: number;
}

export type PiAgentMessage =
  | PiUserMessage
  | PiAssistantMessage
  | PiToolResultMessage
  | PiBashExecutionMessage
  | PiCustomMessage
  | PiBranchSummaryMessage
  | PiCompactionSummaryMessage;
