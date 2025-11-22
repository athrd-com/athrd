import type { ToolCallRound, ToolInvocationSerialized } from "@/types/vscode";
import VSCodeToolUse from "./vscode-tool-use";

interface ToolCallProps {
  tool: ToolInvocationSerialized;
  toolCallRound?: ToolCallRound;
}

export default function VSCodeToolCall({ toolCallRound, tool }: ToolCallProps) {
  return <VSCodeToolUse tool={tool} result={toolCallRound?.response} />;
}
