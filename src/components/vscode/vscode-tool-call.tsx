import type { ToolCallRound, ToolInvocationSerialized } from "@/types/vscode";
import { Search, TerminalIcon, type LucideIcon } from "lucide-react";
import ToolEditBlock from "../thread/tool-edit-block";
import ToolReadBlock from "../thread/tool-read-block";


interface ToolCallProps {
  icon?: LucideIcon;
  tool: ToolInvocationSerialized;
  toolCallRound?: ToolCallRound;
  text: string;
}

export default function VSCodeToolCall({
  toolCallRound,
  tool,
  icon: Icon,
  text,
}: ToolCallProps) {
  const fileDiffs = (toolCallRound?.toolCalls ?? [])
    .filter((call) => call.name === "replace_string_in_file")
    .map((round) => {
      const args = JSON.parse(round.arguments);
      return (
        <ToolEditBlock
          key={round.id}
          filePath={args.filePath}
          oldString={args.oldString}
          newString={args.newString}
        />
      );
    });

  if (
    tool.toolId === "copilot_readFile" ||
    tool.toolId === "copilot_getErrors"
  ) {
    const keys = Object.keys(tool.pastTenseMessage.uris ?? {});
    const key = keys[0];
    const uri = tool.pastTenseMessage.uris?.[key ?? ""];
    const path = typeof uri?.path === "string" ? uri.path : "";
    const rest = text.match(/\)(, .+)/);

    return (
      <div className="">
        <div>{fileDiffs}</div>
        <ToolReadBlock
          filePath={path || key || "unknown"}
          extra={rest ? rest[1] : undefined}
        />
      </div>
    );
  }

  let ToolIcon = Icon;

  switch (tool.toolId) {
    case "copilot_findTextInFiles":
      ToolIcon = Search;
      break;
    case "run_in_terminal":
      ToolIcon = TerminalIcon;
  }

  let parsed: string | React.ReactElement = text;
  switch (tool.toolId) {
    case "run_in_terminal":
      if (tool.toolSpecificData?.kind === "terminal") {
        parsed = tool.toolSpecificData.commandLine.original ?? "";
      }
      break;
  }

  return (
    <div className="">
      <div>{fileDiffs}</div>

      <div className="flex items-center text-sm my-4">
        {ToolIcon && <ToolIcon className="h-4 w-4 text-gray-400 mr-2" />}
        <span className={"text-gray-400"}>{parsed}</span>
      </div>
    </div>
  );
}
