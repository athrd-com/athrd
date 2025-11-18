import type { ToolCallRound, ToolInvocationSerialized } from "@/types/vscode";
import { FileIcon, Search, TerminalIcon, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import FileDiff from "./file-diff";

interface ToolCallProps {
  icon?: LucideIcon;
  tool: ToolInvocationSerialized;
  toolCallRound?: ToolCallRound;
  text: string;
}

export default function ToolCall({
  toolCallRound,
  tool,
  icon: Icon,
  text,
}: ToolCallProps) {
  let ToolIcon = Icon;

  switch (tool.toolId) {
    case "copilot_getErrors":
    case "copilot_readFile":
      ToolIcon = FileIcon;
      break;
    case "copilot_findTextInFiles":
      ToolIcon = Search;
      break;
    case "run_in_terminal":
      ToolIcon = TerminalIcon;
  }

  let parsed: string | React.ReactElement = text;
  switch (tool.toolId) {
    case "run_in_terminal":
      parsed = tool.toolSpecificData?.commandLine.original ?? "";
      break;
    case "copilot_getErrors":
    case "copilot_readFile": {
      const keys = Object.keys(tool.pastTenseMessage.uris ?? {});
      const key = keys[0];
      const uri = tool.pastTenseMessage.uris?.[key];
      const path = typeof uri?.path === "string" ? uri.path : "";
      const fileName = path ? path.split("/").pop() : undefined;
      const rest = text.match(/\)(, .+)/);

      parsed = (
        <>
          Read{" "}
          <Badge
            variant={"outline"}
            className="text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 transition-colors px-2 py-0.5 rounded-md mx-1 align-middle font-mono text-xs"
          >
            {fileName ?? key ?? "unknown"}
          </Badge>
          {rest && rest[1]}
        </>
      );
      break;
    }
  }

  return (
    <div className="">
      <div>
        {(toolCallRound?.toolCalls ?? [])
          .filter((call) => call.name === "replace_string_in_file")
          .map((round) => (
            <FileDiff key={round.id} toolCall={round} />
          ))}
      </div>

      <div className="flex items-center text-sm my-4">
        {ToolIcon && <ToolIcon className="h-4 w-4 text-gray-400 mr-2" />}
        <span className={"text-gray-400"}>{parsed}</span>
      </div>
    </div>
  );
}
