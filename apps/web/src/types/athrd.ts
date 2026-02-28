export interface AThrd {
  messages: (AthrdUserMessage | AthrdAssistantMessage)[];
}

export interface AthrdUserMessageFileVariable {
  type: "file";
  path: string;
}

export interface AthrdUserMessageImageVariable {
  type: "image";
  name: string;
  data: string;
}

export interface AthrdUserMessage {
  id: string;
  type: "user";
  content: string;
  variables?: Array<
    AthrdUserMessageFileVariable | AthrdUserMessageImageVariable
  >;
}

export interface AthrdAssistantMessage {
  id: string;
  type: "assistant";
  content?: string;
  timestamp: string;
  thoughts?: AthrdThinking[];
  toolCalls?: AthrdToolCall[];
  model?: string;
}

export interface AthrdThinking {
  subject: string;
  description: string;
  timestamp: string;
}

interface BaseToolCall {
  id: string;
  timestamp: string;
  result: Array<BaseToolResponse>;
}

interface TextToolOutput {
  type: "text";
  text: string;
}

interface ImageToolOutput {
  type: "image";
  data: string;
  mimeType: string;
}

export interface BaseToolResponse {
  id: string;
  name: string;
  output?: TextToolOutput | ImageToolOutput;
  error?: string;
}

export interface ReadFileToolCall extends BaseToolCall {
  name: "read_file";
  args: {
    file_path: string;
    from?: number;
    to?: number;
  };
}

export interface WriteFileToolCall extends BaseToolCall {
  name: "write_file";
  args: {
    file_path: string;
    content: string;
  };
}

export interface ListDirectoryToolCall extends BaseToolCall {
  name: "ls";
  args: {
    dir_path: string;
  };
}

export interface ReplaceToolCall extends BaseToolCall {
  name: "replace";
  args: {
    file_path: string;
    new_string: string;
    old_string: string;
  };
}

export interface RunShellCommandToolCall extends BaseToolCall {
  name: "terminal_command";
  args: {
    cwd?: string;
    command: string;
  };
}

export interface MCPToolCall extends BaseToolCall {
  name: "mcp_tool_call";
  args: {
    server_name: string;
    tool_name: string;
    input: string;
    cache_type: "ephemeral" | "persistent";
  };
}

export interface TodoStep {
  status: "pending" | "in_progress" | "completed" | "cancelled";
  step: string;
}

export interface UpdatePlanToolCall extends BaseToolCall {
  name: "todos";
  args: {
    plan: TodoStep[];
  };
}

export interface RequestUserInputOption {
  label: string;
  description?: string;
  type?: "selected" | "other";
}

export interface RequestUserInputQuestion {
  id: string;
  question: string;
  options: RequestUserInputOption[];
}

export interface RequestUserInputToolCall extends BaseToolCall {
  name: "request_user_input";
  args: {
    questions: RequestUserInputQuestion[];
  };
}
export interface WebSearchToolCall extends BaseToolCall {
  name: "web_search";
  args: {
    query: string;
  };
}

export interface SkillToolCall extends BaseToolCall {
  name: "skill";
  args: {
    skill_name: string;
    parameters: Record<string, unknown>;
  };
}

export interface UnknownToolCall extends BaseToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type AthrdToolCall =
  | ReadFileToolCall
  | WriteFileToolCall
  | ListDirectoryToolCall
  | ReplaceToolCall
  | RunShellCommandToolCall
  | MCPToolCall
  | UpdatePlanToolCall
  | RequestUserInputToolCall
  | SkillToolCall
  | UnknownToolCall;
