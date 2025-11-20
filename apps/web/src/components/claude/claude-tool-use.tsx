import type { ToolCallContent } from "@/types/claude";
import ShellBlock from "../thread/sheel-block";
import ToolEditBlock from "../thread/tool-edit-block";
import ToolReadBlock from "../thread/tool-read-block";
import ToolTodosBlock from "../thread/tool-todos-block";

type ClaudeToolUseProps = {
  block: ToolCallContent;
  result?: string;
};

export default function ClaudeToolUse({ block, result }: ClaudeToolUseProps) {
  // Check if it's a shell command
  if (block.name === "Bash" || (block.input && "command" in block.input)) {
    const command =
      "command" in block.input
        ? (block.input as { command: string }).command
        : undefined;
    return <ShellBlock command={command ?? ""} result={result} />;
  }

  if (block.name === "Read") {
    return (
      <ToolReadBlock filePath={block.input.file_path} content={result ?? ""} />
    );
  }

  if (block.name === "Edit") {
    return (
      <ToolEditBlock
        filePath={block.input.file_path}
        oldString={block.input.old_string}
        newString={block.input.new_string}
      />
    );
  }

  if (block.name === "TodoWrite") {
    return (
      <ToolTodosBlock
        todos={(block.input.todos ?? []).map(
          (todo: { content: any; status: any }) => ({
            content: todo.content,
            status: todo.status,
          })
        )}
      />
    );
  }

  if (block.name === "Grep") {
    return (
      <ShellBlock command={`grep ${block.input.pattern}`} result={result} />
    );
  }

  return (
    <div className="space-y-2">
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-3">
        <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
          Tool Use: {block.name}
        </div>
        <pre className="text-xs font-mono overflow-x-auto">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      </div>
      {result && (
        <div className="bg-black/5 dark:bg-white/5 p-3 rounded-md font-mono text-xs overflow-x-auto whitespace-pre-wrap text-gray-600 dark:text-gray-300 border border-black/5 dark:border-white/5 ml-4">
          {result}
        </div>
      )}
    </div>
  );
}
