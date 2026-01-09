import type {
  BaseToolResponse,
  ListDirectoryToolCall,
  MCPToolCall,
  ReadFileToolCall,
  ReplaceToolCall,
  RunShellCommandToolCall,
  SkillToolCall,
  TodoStep,
  UnknownToolCall,
  UpdatePlanToolCall,
  WebSearchToolCall,
  WriteFileToolCall,
} from "@/types/athrd";
import { IDE } from "@/types/ide";

/**
 * Generate a unique ID for messages/tool calls.
 * Uses crypto.randomUUID if available, falls back to timestamp-based ID.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Normalize a timestamp to ISO 8601 format.
 * Handles various input formats: ISO strings, Unix timestamps (ms and s), Date objects.
 */
export function normalizeTimestamp(ts: string | number | Date): string {
  if (ts instanceof Date) {
    return ts.toISOString();
  }

  if (typeof ts === "number") {
    // Assume seconds if timestamp is too small for milliseconds (before year 2001)
    const msTimestamp = ts < 1000000000000 ? ts * 1000 : ts;
    return new Date(msTimestamp).toISOString();
  }

  // Already a string, validate and return
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    // If invalid, return current time
    return new Date().toISOString();
  }
  return date.toISOString();
}

/**
 * Canonical tool names used in AThrd format
 */
export type CanonicalToolName =
  | "read_file"
  | "write_file"
  | "replace"
  | "ls"
  | "terminal_command"
  | "mcp_tool_call"
  | "skill"
  | "todos"
  | "web_search"
  | "grep_search";

/**
 * Tool name mapping from various CLI tools to canonical AThrd names.
 * Each IDE has its own mapping table.
 */
const TOOL_NAME_MAPPINGS: Record<IDE, Record<string, CanonicalToolName>> = {
  [IDE.CLAUDE_CODE]: {
    Read: "read_file",
    Write: "write_file",
    Edit: "replace",
    Bash: "terminal_command",
    Skill: "skill",
    Glob: "ls",
    run_command: "terminal_command",
    TodoWrite: "todos",
    WebSearch: "web_search",
    // MCP tools are detected separately
  },
  // IDE.CLAUDE is an alias for IDE.CLAUDE_CODE with same value
  [IDE.CODEX]: {
    bash: "terminal_command",
    shell: "terminal_command",
    shell_command: "terminal_command",
    update_plan: "todos",
    // Codex uses generic function_call with name field
  },
  [IDE.GEMINI]: {
    read_file: "read_file",
    write_file: "write_file",
    replace: "replace",
    list_directory: "ls",
    run_shell_command: "terminal_command",
    write_todos: "todos",
  },
  [IDE.VSCODE]: {
    copilot_readFile: "read_file",
    read_file: "read_file",
    copilot_createFile: "write_file",
    vscode_editFile_internal: "write_file",
    copilot_applyPatch: "replace",
    copilot_replaceString: "replace",
    replace_string_in_file: "replace",
    copilot_insertEdit: "replace",
    copilot_listDirectory: "ls",
    run_in_terminal: "terminal_command",
    // MCP tools are detected separately
  },
  [IDE.CURSOR]: {
    read_file: "read_file",
    write_file: "write_file",
    edit_file: "write_file",
    apply_patch: "replace",
    list_dir: "ls",
    grep: "grep_search",
    run_terminal_command: "terminal_command",
    todo_write: "todos",
  },
};

/**
 * Check if a tool name indicates an MCP tool call.
 */
export function isMCPTool(toolName: string, ide: IDE): boolean {
  // Common MCP tool patterns
  if (toolName.startsWith("mcp_")) return true;

  // IDE-specific MCP detection
  if (ide === IDE.VSCODE) {
    // VS Code MCP tools often have server prefix
    return toolName.includes("__mcp") || toolName.startsWith("mcp");
  }

  return false;
}

/**
 * Map a tool name from a specific IDE to the canonical AThrd tool name.
 * Returns the original name if no mapping is found (will be handled as UnknownToolCall).
 */
export function mapToolName(
  ide: IDE,
  originalName: string
): CanonicalToolName | string {
  const mapping = TOOL_NAME_MAPPINGS[ide];
  if (mapping && originalName in mapping) {
    return mapping[originalName] as CanonicalToolName;
  }

  if (ide === IDE.CODEX || ide === IDE.CLAUDE_CODE) {
    if (originalName.startsWith("mcp__")) {
      return "mcp_tool_call";
    }
  }

  return originalName;
}

/**
 * Create a ReadFileToolCall
 */
export function createReadFileToolCall(params: {
  id: string;
  timestamp: string;
  filePath: string;
  from?: number;
  to?: number;
  result: BaseToolResponse[];
}): ReadFileToolCall {
  return {
    id: params.id,
    name: "read_file",
    timestamp: params.timestamp,
    args: {
      file_path: params.filePath,
      from: params.from,
      to: params.to,
    },
    result: params.result,
  };
}

export function createSkillToolCall(params: {
  id: string;
  timestamp: string;
  skillName: string;
  parameters: Record<string, unknown>;
}): SkillToolCall {
  return {
    id: params.id,
    name: "skill",
    timestamp: params.timestamp,
    args: {
      skill_name: params.skillName,
      parameters: params.parameters,
    },
    result: [],
  };
}

/**
 * Create a WriteFileToolCall
 */
export function createWriteFileToolCall(params: {
  id: string;
  timestamp: string;
  filePath: string;
  content: string;
  result: BaseToolResponse[];
}): WriteFileToolCall {
  return {
    id: params.id,
    name: "write_file",
    timestamp: params.timestamp,
    args: {
      file_path: params.filePath,
      content: params.content,
    },
    result: [
      {
        id: generateId(),
        output: { type: "text", text: params.content },
        name: "",
      },
      ...params.result,
    ],
  };
}

/**
 * Create a ListDirectoryToolCall
 */
export function createListDirectoryToolCall(params: {
  id: string;
  timestamp: string;
  dirPath: string;
  result: BaseToolResponse[];
}): ListDirectoryToolCall {
  return {
    id: params.id,
    name: "ls",
    timestamp: params.timestamp,
    args: {
      dir_path: params.dirPath,
    },
    result: params.result,
  };
}

/**
 * Create a ReplaceToolCall
 */
export function createReplaceToolCall(params: {
  id: string;
  timestamp: string;
  filePath: string;
  oldString: string;
  newString: string;
  result: BaseToolResponse[];
}): ReplaceToolCall {
  return {
    id: params.id,
    name: "replace",
    timestamp: params.timestamp,
    args: {
      file_path: params.filePath,
      old_string: params.oldString,
      new_string: params.newString,
    },
    result: params.result,
  };
}

/**
 * Create a RunShellCommandToolCall
 */
export function createTerminalCommandToolCall(params: {
  id: string;
  timestamp: string;
  command: string;
  cwd?: string;
  result: BaseToolResponse[];
}): RunShellCommandToolCall {
  return {
    id: params.id,
    name: "terminal_command",
    timestamp: params.timestamp,
    args: {
      command: params.command,
      cwd: params.cwd,
    },
    result: params.result,
  };
}

/**
 * Create an MCPToolCall
 */
export function createMCPToolCall(params: {
  id: string;
  timestamp: string;
  serverName: string;
  toolName: string;
  input: string;
  cacheType?: "ephemeral" | "persistent";
  result: BaseToolResponse[];
}): MCPToolCall {
  return {
    id: params.id,
    name: "mcp_tool_call",
    timestamp: params.timestamp,
    args: {
      server_name: params.serverName,
      tool_name: params.toolName,
      input: params.input,
      cache_type: params.cacheType ?? "ephemeral",
    },
    result: params.result,
  };
}

/**
 * Create an UpdatePlanToolCall (todos)
 */
export function createWebSearchToolCall(params: {
  id: string;
  timestamp: string;
  query: string;
  result: BaseToolResponse[];
}): WebSearchToolCall {
  return {
    id: params.id,
    name: "web_search",
    timestamp: params.timestamp,
    args: {
      query: params.query,
    },
    result: params.result,
  };
}

/**
 * Create an UpdatePlanToolCall (todos)
 */
export function createUpdatePlanToolCall(params: {
  id: string;
  timestamp: string;
  plan: TodoStep[];
  result: BaseToolResponse[];
}): UpdatePlanToolCall {
  return {
    id: params.id,
    name: "todos",
    timestamp: params.timestamp,
    args: {
      plan: params.plan,
    },
    result: params.result,
  };
}

/**
 * Create an UnknownToolCall for unrecognized tools
 */
export function createUnknownToolCall(params: {
  id: string;
  timestamp: string;
  name: string;
  args: Record<string, unknown>;
  result: BaseToolResponse[];
}): UnknownToolCall {
  return {
    id: params.id,
    name: params.name,
    timestamp: params.timestamp,
    args: params.args,
    result: params.result,
  };
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
