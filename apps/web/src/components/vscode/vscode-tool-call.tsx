import type { ToolCallRound, ToolInvocationSerialized } from "@/types/vscode";
import ToolEditBlock from "../thread/tool-edit-block";
import VSCodeToolUse from "./vscode-tool-use";

interface ToolCallProps {
  tool: ToolInvocationSerialized;
  toolCallRound?: ToolCallRound;
}

export default function VSCodeToolCall({ toolCallRound, tool }: ToolCallProps) {
  // Handle file edits (legacy/specific handling for replace_string_in_file)
  const fileDiffs = (toolCallRound?.toolCalls ?? [])
    .filter((call) => call.name === "replace_string_in_file")
    .map((round) => {
      try {
        const args = JSON.parse(round.arguments);
        return (
          <ToolEditBlock
            key={round.id}
            filePath={args.filePath}
            oldString={args.oldString}
            newString={args.newString}
          />
        );
      } catch (e) {
        console.error("Failed to parse tool arguments", e);
        return null;
      }
    });

  return (
    <div className="">
      <div>{fileDiffs}</div>
      <VSCodeToolUse tool={tool} result={toolCallRound?.response} />
    </div>
  );
}
