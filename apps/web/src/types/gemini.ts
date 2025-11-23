import type { TodoStatus } from "@/components/thread/tool-todos-block";

export interface GeminiThread {
  messages: (GeminiUserMessage | GeminiAssistantMessage)[];
}

export interface GeminiUserMessage {
  id: string;
  type: "user";
  content: string;
}

export interface GeminiAssistantMessage {
  id: string;
  type: "gemini";
  content: string;
  timestamp: string;
  thoughts?: GeminiThinking[];
  toolCalls?: GeminiToolCall[];
  model: string;
}

export interface GeminiThinking {
  subject: string;
  description: string;
  timestamp: string;
}

interface BaseToolCall {
  id: string;
  status: string;
  timestamp: string;
  displayName: string;
  description: string;
  renderOutputAsMarkdown: boolean;
  result: Array<{
    functionResponse: {
      id: string;
      name: string;
      response: {
        output?: string;
        error?: string;
      };
    };
  }>;
}

export interface WriteFileToolCall extends BaseToolCall {
  name: "write_file";
  args: {
    file_path: string;
    content: string;
  };
}

export interface ListDirectoryToolCall extends BaseToolCall {
  name: "list_directory";
  args: {
    dir_path: string;
  };
}

export interface ReadFileToolCall extends BaseToolCall {
  name: "read_file";
  args: {
    file_path: string;
  };
}

export interface WriteTodosToolCall extends BaseToolCall {
  name: "write_todos";
  args: {
    todos: Array<{
      description: string;
      status: TodoStatus;
    }>;
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
  name: "run_shell_command";
  args: {
    command: string;
    description: string;
  };
}

export interface UnknownToolCall extends BaseToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type GeminiToolCall =
  | WriteFileToolCall
  | ListDirectoryToolCall
  | ReadFileToolCall
  | WriteTodosToolCall
  | ReplaceToolCall
  | RunShellCommandToolCall
  | UnknownToolCall;
