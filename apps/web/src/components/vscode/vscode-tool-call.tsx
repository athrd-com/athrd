import type { ToolCallRound, ToolInvocationSerialized } from "@/types/vscode";
import {
  FilePlusIcon,
  FolderPlusIcon,
  FolderTreeIcon,
  Globe,
  PencilRuler,
  Search,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";
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
    tool.toolId === "copilot_createFile" ||
    tool.toolId === "copilot_readFile" ||
    tool.toolId === "copilot_getErrors" ||
    tool.toolId === "copilot_listDirectory" ||
    tool.toolId === "vscode_fetchWebPage_internal"
  ) {
    const keys = Object.keys(tool.pastTenseMessage?.uris ?? {});
    const key = keys[0];
    const uri = tool.pastTenseMessage?.uris?.[key ?? ""];
    let path = typeof uri?.path === "string" ? uri.path : "";

    if (tool.toolId === "vscode_fetchWebPage_internal" && !path) {
      const call = toolCallRound?.toolCalls?.find(
        (c) => c.name === "vscode_fetchWebPage_internal"
      );
      if (call) {
        try {
          const args = JSON.parse(call.arguments);
          if (args.url) path = args.url;
          if (args.urls && Array.isArray(args.urls)) path = args.urls[0];
        } catch {}
      }
    }

    const rest = text.match(/\)(, .+)/);
    let label = "Read file";
    if (tool.toolId === "copilot_listDirectory") {
      label = "List directory";
    } else if (tool.toolId === "vscode_fetchWebPage_internal") {
      label = "Fetch webpage";
    } else if (tool.toolId === "copilot_createFile") {
      label = "Create file";
    }

    let icon = undefined;
    if (tool.toolId === "copilot_listDirectory") {
      icon = FolderTreeIcon;
    } else if (tool.toolId === "vscode_fetchWebPage_internal") {
      icon = Globe;
    } else if (tool.toolId === "copilot_createFile") {
      icon = FilePlusIcon;
    }

    return (
      <div className="">
        <div>{fileDiffs}</div>
        <ToolReadBlock
          filePath={path || key || "unknown"}
          extra={rest ? rest[1] : undefined}
          label={label}
          icon={icon}
        />
      </div>
    );
  }

  let ToolIcon = Icon;

  switch (tool.toolId) {
    case "copilot_createFile":
      ToolIcon = FolderPlusIcon;
      break;
    case "copilot_applyPatch":
      ToolIcon = PencilRuler;
      break;
    case "copilot_findTextInFiles":
      ToolIcon = Search;
      break;
    case "run_in_terminal":
      ToolIcon = TerminalIcon;
  }

  let parsed: string | React.ReactElement = text;
  switch (tool.toolId) {
    case "copilot_createFile":
      let names: string[] = [];
      Object.keys(tool.pastTenseMessage?.uris ?? {}).forEach((key) => {
        const uri = tool.pastTenseMessage?.uris?.[key ?? ""];
        if (uri?.path) {
          names.push(uri.path.split("/").pop() || uri.path);
        }
      });
      parsed = "Created " + names.join(", ");
      break;
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
