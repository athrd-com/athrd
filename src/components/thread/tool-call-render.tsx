import { Terminal } from "lucide-react";
import type { ToolCallData } from "~/lib/thread-parsers";
import ToolCall from "~/components/tool-call";

interface ToolCallRenderProps {
  toolCall: ToolCallData;
}

/**
 * ToolCallRender: Orchestrates rendering of different tool call types
 * Handles terminal commands separately from standard tool invocations
 * Extracted from Thread for better reusability and testability
 */
export default function ToolCallRender({ toolCall }: ToolCallRenderProps) {
  // Terminal command - special rendering
  if (toolCall.terminalCommand) {
    return (
      <div className="overflow-hidden rounded-lg border border-purple-200 bg-white">
        <div className="border-b border-purple-200 bg-purple-50 px-4 py-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-purple-600" />
            <span className="font-medium text-purple-900 text-sm">
              Terminal Command
            </span>
          </div>
        </div>
        <div className="bg-gray-900 px-4 py-3 font-mono text-sm text-green-400 overflow-x-auto">
          $ {toolCall.terminalCommand}
        </div>
      </div>
    );
  }

  // Standard tool call rendering
  const status: "completed" | "running" =
    toolCall.status === "completed" ? "completed" : "running";
  const text =
    toolCall.pastTenseMessage ||
    toolCall.invocationMessage ||
    toolCall.toolName ||
    "Tool invocation";
  const icon = toolCall.status === "completed" ? "✓" : "○";

  return <ToolCall icon={icon} status={status} text={text} />;
}
