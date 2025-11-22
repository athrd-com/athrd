"use client";

import type {
  MCPResultDetails,
  MCPToolSource,
  TerminalToolData,
  ToolInvocationSerialized,
} from "@/types/vscode";
import {
  FilePlusIcon,
  FolderTreeIcon,
  Globe,
  type LucideIcon,
} from "lucide-react";
import ShellBlock from "../thread/sheel-block";
import ToolMCPBlock from "../thread/tool-mcp-block";
import ToolReadBlock from "../thread/tool-read-block";

interface VSCodeToolUseProps {
  tool: ToolInvocationSerialized;
  result?: any;
}

export default function VSCodeToolUse({ tool, result }: VSCodeToolUseProps) {
  // Handle MCP Tools
  if (tool.source?.type === "mcp") {
    const mcpData = tool.source as unknown as MCPToolSource;
    const resultDetails = tool.resultDetails as MCPResultDetails;

    return (
      <ToolMCPBlock
        serverName={mcpData.serverLabel || "MCP Server"}
        toolName={tool.pastTenseMessage?.value || mcpData.label || tool.toolId}
        input={
          resultDetails?.input ? JSON.parse(resultDetails.input) : undefined
        }
        result={
          resultDetails?.output.map((output) => output.value).join("\n") ||
          result
        }
      />
    );
  }

  // Handle Terminal
  if (tool.toolId === "run_in_terminal") {
    let command = "";
    if (
      tool.toolSpecificData &&
      "kind" in tool.toolSpecificData &&
      tool.toolSpecificData.kind === "terminal"
    ) {
      command =
        (tool.toolSpecificData as TerminalToolData).commandLine.original || "";
    }
    return (
      <ShellBlock
        command={command}
        result={typeof result === "string" ? result : undefined}
      />
    );
  }

  // Handle File Operations
  if (
    tool.toolId === "copilot_readFile" ||
    tool.toolId === "vscode_fetchWebPage_internal" ||
    tool.toolId === "copilot_createFile" ||
    tool.toolId === "copilot_listDirectory"
  ) {
    const keys = Object.keys(tool.pastTenseMessage?.uris ?? {});
    const key = keys[0];
    const uri = tool.pastTenseMessage?.uris?.[key ?? ""];
    let path = typeof uri?.path === "string" ? uri.path : "";

    if (tool.toolId === "vscode_fetchWebPage_internal" && !path) {
      // @ts-ignore
      path = tool.resultDetails?.[0]?.external || "";
    }

    let label = "Read file";
    let icon: LucideIcon | undefined = undefined;

    if (tool.toolId === "copilot_listDirectory") {
      label = "List directory";
      icon = FolderTreeIcon;
    } else if (tool.toolId === "vscode_fetchWebPage_internal") {
      label = "Fetch webpage";
      icon = Globe;
    } else if (tool.toolId === "copilot_createFile") {
      label = "Create file";
      icon = FilePlusIcon;
    }

    return (
      <ToolReadBlock
        filePath={path || key || "unknown"}
        label={label}
        icon={icon}
        content={typeof result === "string" ? result : undefined}
      />
    );
  }

  // Default / Fallback
  return (
    <div className="space-y-2">
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-3">
        <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
          Tool Use: {tool.toolId}
        </div>
        <pre className="text-xs font-mono overflow-x-auto">
          {JSON.stringify(tool, null, 2)}
        </pre>
      </div>
    </div>
  );
}
