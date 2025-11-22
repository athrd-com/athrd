/**
 * TypeScript interfaces for VS Code AI thread (GitHub Copilot Chat) JSON structure
 * Represents the complete structure of AI conversation logs exported from VS Code extensions
 */

/** VS Code URI representation with mid identifier for serialization */
export interface VSCODEURI {
  $mid: number;
  path: string;
  scheme: string;
  authority?: string;
  query?: string;
  fragment?: string;
}

/** Simple URI object with just an id (used for avatar icons) */
export interface SimpleURI {
  id: string;
}

/** Editor range for tracking line and column positions */
export interface EditorRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** Simple range with start and endExclusive positions */
export interface Range {
  start: number;
  endExclusive: number;
}

/** Part of a message that can contain text with range information */
export interface MessagePart {
  range: Range;
  editorRange: EditorRange;
  text: string;
  kind: string;
}

/** Message structure containing parts and aggregated text */
export interface Message {
  parts: MessagePart[];
  text: string;
}

export interface VariableFile {
  kind: "file";
  id: string;
  name: string;
  range: Range;
  value: InlineReference;
}

export interface VariableImage {
  kind: "image";
  id: string;
  name: string;
  fullName: string;
  value: Record<string, number>;
}

/** Variable data associated with a request */
export interface VariableData {
  variables: unknown[] | VariableFile[];
}

/** Cache information for rendered content */
export interface CacheInfo {
  type: number;
  cacheType?: "ephemeral" | "persistent";
}

/** Rendered message part with metadata */
export interface RenderedMessagePart {
  type: number;
  text?: string;
  cacheType?: "ephemeral" | "persistent";
}

/** Base tool call structure */
export interface ToolCall {
  name: string;
  arguments: string;
  id: string;
  result: ToolCallResult | undefined;
}

/** Tool call round containing response, tool calls, and retry info */
export interface ToolCallRound {
  response: string;
  toolCalls: ToolCall[];
  toolInputRetry: number;
  id: string;
  thinking?: {
    id: string;
    text: string;
  };
}

/** Tool invocation message with URI references */
export interface ToolInvocationMessage {
  value: string;
  supportThemeIcons: boolean;
  supportHtml: boolean;
  supportAlertSyntax?: boolean;
  uris?: Record<string, VSCODEURI>;
}

/** Inline reference in content */
export interface InlineReference {
  $mid: number;
  fsPath: string;
  external: string;
  path: string;
  scheme: string;
  name: string;
  location: {
    range: EditorRange;
    uri: VSCODEURI;
  };
}

/** Text node in rendered content tree */
export interface TextNode {
  type: 2;
  priority: number;
  text: string;
  lineBreakBefore: boolean;
  references?: InlineReference[];
}

/** Container node in rendered content tree */
export interface ContainerNode {
  type: 1;
  ctor: number;
  ctorName: string;
  children: (TextNode | ContainerNode)[];
  props: Record<string, unknown>;
  references: unknown[];
}

/** Rendered content value with nested node structure */
export interface RenderedContentValue {
  node: ContainerNode;
}

/** Tool result content item */
export interface ToolResultContent {
  $mid: number;
  value: string | RenderedContentValue;
}

/** Tool call result from execution */
export interface ToolCallResult {
  $mid: number;
  content: ToolResultContent[];
}

export interface MCPResultDetails {
  input: string;
  output: {
    type: "embed";
    isText: boolean;
    value: string;
  }[];
  serverName: string;
  toolName: string;
}

/** Cache type definition */
export type CacheType = "ephemeral" | "persistent";

/** Source information for tool execution */

export interface TerminalToolData {
  kind: "terminal";
  language: string;
  commandLine: {
    toolEdited?: string;
    original: string;
  };
}

export interface TodoListToolData {
  kind: "todoList";
  toolId: "manage_todo_list";
  todoList: {
    id: string;
    title: string;
    description: string;
    status: "in-progress" | "completed" | "not-started";
  }[];
}

export type ToolId =
  | "copilot_createFile"
  | "copilot_readFile"
  | "copilot_listDirectory"
  | "copilot_getErrors"
  | "vscode_fetchWebPage_internal"
  | "run_in_terminal"
  | "replace_string_in_file"
  | "copilot_applyPatch"
  | "copilot_findTextInFiles"
  | "copilot_insertEdit"
  | "copilot_replaceString"
  | "vscode_editFile_internal"
  | "copilot_findFiles"
  | string;

export interface FileToolData {
  kind: "file";
  toolId: ToolId;
  file: {
    uri: VSCODEURI;
    range?: Range;
  };
}

export interface MCPToolSource {
  type: "mcp";
  label: string;
  serverLabel: string;
  collectionId: string;
  definitionId: string;
  instructions?: string;
}

export interface GenericToolSource {
  type: string;
  label: string;
}

export type ToolSource = MCPToolSource | GenericToolSource;

/** Tool invocation with serialized details */
export interface ToolInvocationSerialized {
  kind: "toolInvocationSerialized";
  invocationMessage: ToolInvocationMessage;
  pastTenseMessage?: ToolInvocationMessage;
  presentation?: string;
  isConfirmed: { type: number };
  isComplete: boolean;
  source: ToolSource;
  toolCallId: string;
  toolId: string;
  toolSpecificData?:
    | TerminalToolData
    | TodoListToolData
    | FileToolData
    | { kind: string; [key: string]: unknown };
  resultDetails?: MCPResultDetails | Record<string, unknown> | any[];
}

// {
//     type: "embed";
//     isText: boolean;
//     value: string;
//   }[]
// |

/** Response item representing text content */
export interface TextResponse {
  value: string;
  supportThemeIcons: boolean;
  supportHtml: boolean;
  baseUri?: VSCODEURI;
}

/** Response item for MCP servers starting */
export interface MCPServersStartingResponse {
  kind: "mcpServersStarting";
  didStartServerIds: unknown[];
}

/** Response item for prepare tool invocation */
export interface ThinkingToolResponse {
  kind: "thinking";
  value: string;
  id: string;
}

/** Response item for prepare tool invocation */
export interface PrepareToolInvocationResponse {
  kind: "prepareToolInvocation";
  toolName: string;
}

export interface TextEditGroupResponse {
  kind: "textEditGroup";
  uri: VSCODEURI;
  edits: {
    range: EditorRange;
    text: string;
  }[];
}

/** Response item for inline reference */
export interface InlineReferenceResponse {
  kind: "inlineReference";
  inlineReference: InlineReference;
}

/** Response markdown info */
export interface ResponseMarkdownInfo {
  [key: string]: unknown;
}

/** Slice command definition */
export interface SlashCommand {
  name: string;
}

/** Theme icon definition */
export interface ThemeIcon {
  id: string;
}

/** Agent metadata */
export interface AgentMetadata {
  themeIcon?: ThemeIcon;
  hasFollowups?: boolean;
  supportIssueReporting?: boolean;
  [key: string]: unknown;
}

/** Extension identifier with case variants */
export interface ExtensionId {
  value: string;
  _lower: string;
}

/** Agent information for the response */
export interface Agent {
  extensionId: ExtensionId;
  extensionVersion: string;
  publisherDisplayName: string;
  extensionPublisherId: string;
  extensionDisplayName: string;
  id: string;
  description: string;
  when?: string;
  metadata: AgentMetadata;
  name: string;
  fullName: string;
  isDefault: boolean;
  locations: string[];
  modes: string[];
  slashCommands: SlashCommand[];
  disambiguation: unknown[];
}

/** Content reference */
export interface ContentReference {
  [key: string]: unknown;
}

/** Code citation */
export interface CodeCitation {
  [key: string]: unknown;
}

/** Timing information */
export interface Timings {
  firstProgress: number;
  totalElapsed: number;
}

/** Result metadata containing execution details and tool call history */
export interface ResultMetadata {
  codeBlocks: unknown[];
  renderedUserMessage: RenderedMessagePart[];
  renderedGlobalContext: RenderedMessagePart[];
  cacheKey?: string;
  toolCallRounds?: ToolCallRound[];
  toolCallResults?: Record<string, ToolCallResult>;
  modelMessageId?: string;
  responseId?: string;
  sessionId?: string;
  agentId?: string;
  [key: string]: unknown;
}

/** Response result structure */
export interface Result {
  timings: Timings;
  metadata: ResultMetadata;
  details?: string;
}

/** Union type for all possible response item types */
export type ResponseItem =
  | TextResponse
  | MCPServersStartingResponse
  | PrepareToolInvocationResponse
  | ToolInvocationSerialized
  | InlineReferenceResponse
  | TextEditGroupResponse
  | ThinkingToolResponse
  | { kind: string; [key: string]: unknown }; // fallback for unknown response types

/** Request from user/requester with message and response */
export interface Request {
  requestId: string;
  message: Message;
  variableData: VariableData;
  response: ResponseItem[];
  responseMarkdownInfo: ResponseMarkdownInfo[];
  followups: unknown[];
  isCanceled: boolean;
  agent: Agent;
  contentReferences: ContentReference[];
  codeCitations: CodeCitation[];
  timestamp: number;
  modelId: string;
  result?: Result;
  responseId?: string;
}

/** Root interface for the entire VS Code AI thread */
export interface VSCodeThread {
  version: number;
  requesterUsername: string;
  requesterAvatarIconUri: VSCODEURI;
  responderUsername: string;
  responderAvatarIconUri: SimpleURI;
  initialLocation: string;
  requests: Request[];
  sessionId: string;
  creationDate: number;
  isImported: boolean;
  lastMessageDate: number;
  customTitle?: string;
}
