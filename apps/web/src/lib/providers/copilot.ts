import type { IFile } from ".";

// Top-level JSON structure
export interface AthrdSessionLog {
  version: number;
  requesterUsername: string;
  requesterAvatarIconUri: UriLike;
  responderUsername: string;
  responderAvatarIconUri: ResponderAvatar;
  initialLocation: string;
  requests: CopilotRequest[];
}

// --- Common subtypes ---

export interface UriLike {
  $mid: number;
  path: string;
  scheme: string;
  authority?: string;
  query?: string;
  fsPath?: string;
  external?: string;
  fragment?: string;
}

export interface ResponderAvatar {
  id: string;
}

// --- Requests ---

export interface FileVariable extends IFile {
  id: string;
  kind: "file";
  name: string;
  value: UriLike;
}

export interface CopilotRequest {
  requestId: string;
  message: CopilotMessage;
  variableData: {
    variables: FileVariable[];
  };
  response: CopilotResponseItem[];
  responseId: string;
  result: CopilotResult;
}

export interface CopilotMessage {
  parts: CopilotMessagePart[];
  text: string;
}

export interface CopilotMessagePart {
  range: {
    start: number;
    endExclusive: number;
  };
  editorRange: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  text: string;
  kind: string; // e.g. "text"
}

// --- Response items (discriminated union-ish) ---

export type CopilotResponseItem =
  | ToolCall
  | InlineReferenceItem
  | SimpleTextItem
  | UndoStopItem
  | CodeblockUriItem
  | TextEditGroupItem;

export interface ToolCall {
  invocationMessage?: SimpleMessageLike;
  pastTenseMessage?: SimpleMessageLike;
  isConfirmed?: { type: number };
  isComplete?: boolean;
  source?: {
    type: string;
    label: string;
  };
  toolCallId?: string;
  toolId?: string;
  presentation?: string;
  toolSpecificData?: any;
}

// Inline text-y messages that just have `value` + flags
export interface SimpleTextItem extends SimpleMessageLike {
  // no `kind` – these are the plain objects with just `value` etc.
}

export interface SimpleMessageLike {
  value: string;
  supportThemeIcons: boolean;
  supportHtml: boolean;
  supportAlertSyntax?: boolean;
  baseUri?: UriLike;
  uris?: Record<string, UriLike>;
}

// Inline reference (file, etc.)
export interface InlineReferenceItem {
  kind: "inlineReference";
  inlineReference: UriLike;
}

export interface UndoStopItem {
  kind: "undoStop";
  id: string;
}

export interface CodeblockUriItem {
  kind: "codeblockUri";
  uri: UriLike;
  isEdit: boolean;
}

export interface TextEditGroupItem {
  kind: "textEditGroup";
  uri: UriLike;
  edits: TextEditNestedArray;
  done: boolean;
}

// Edits are nested arrays in the JSON: [ [ {text, range}, ... ], [] ]
export type TextEditNestedArray = Array<Array<TextEdit>>;

export interface TextEdit {
  text: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
}

// --- Result metadata ---

export interface CopilotResult {
  timings: {
    firstProgress: number;
    totalElapsed: number;
  };
  metadata: CopilotResultMetadata;
}

export interface CopilotResultMetadata {
  codeBlocks: any[];
  renderedUserMessage: RenderedUserMessagePart[];
  toolCallRounds: ToolCallRound[];
}

export interface RenderedUserMessagePart {
  type: number;
  text?: string;
  cacheType?: string; // e.g. "ephemeral"
}

export interface ToolCallRound {
  response: string;
  toolCalls: ToolCall[];
  toolInputRetry: number;
  id: string;
}

export interface ToolCall {
  name: string; // e.g. "replace_string_in_file", "run_in_terminal"
  arguments: string; // JSON string in the log
  id: string;
}
