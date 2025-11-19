export interface ClaudeThread {
  requests: ClaudeRequest[];
}

export interface RequestUserMessage {
  role: "user";
  content: string | ToolResultContent[];
}

export interface RequestAssistantMessage {
  role: "assistant";
  content: (ThinkingContent | MessageContent | ToolCallContent)[];
  usage: MessageUsage;
  id: string;
  model: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

export interface MessageContent {
  type: "text";
  text: string;
}

export interface ToolInputBash {
  command: string;
  description?: string;
}

export interface ToolCallBash {
  type: "tool_use";
  name: "Bash" | "run_command";
  id: string;
  input: ToolInputBash;
}

export interface ToolInputRead {
  file_path: string;
}

export interface ToolCallRead {
  type: "tool_use";
  name: "Read";
  id: string;
  input: ToolInputRead;
}

export interface ToolInputEdit {
  file_path: string;
  old_string: string;
  new_string: string;
}

export interface ToolCallEdit {
  type: "tool_use";
  name: "Edit";
  id: string;
  input: ToolInputEdit;
}

export interface ToolInputTodo {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ToolInputTodoWrite {
  todos: ToolInputTodo[];
}

export interface ToolCallTodoWrite {
  type: "tool_use";
  name: "TodoWrite";
  id: string;
  input: ToolInputTodoWrite;
}

export interface ToolInputGrep {
  pattern: string;
  type: string;
  output_mode: string;
}

export interface ToolCallGrep {
  type: "tool_use";
  name: "Grep";
  id: string;
  input: ToolInputGrep;
}

export interface ToolCallOther {
  type: "tool_use";
  name: string;
  id: string;
  input: any;
}

export type ToolCallContent =
  | ToolCallBash
  | ToolCallRead
  | ToolCallEdit
  | ToolCallTodoWrite
  | ToolCallGrep
  | ToolCallOther;

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export interface MessageUsage {
  cache_creation: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  input_tokens: number;
  output_tokens: number;
  service_tier: string;
}

export interface ClaudeRequest {
  id: string;
  message: RequestUserMessage | RequestAssistantMessage;
  timestamp: string;
  type: string;
}
