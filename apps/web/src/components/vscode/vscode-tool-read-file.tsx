import type { ToolCallRound } from "@/types/vscode";
import ToolReadBlock from "../thread/tool-read-block";

interface ToolCallProps {
  toolCallRound?: ToolCallRound;
}

export default function VSCodeReadFileCall({ toolCallRound }: ToolCallProps) {
  if (!toolCallRound) return null;

  return (
    <>
      {toolCallRound.toolCalls.map((toolCall, index) => {
        const {
          filePath,
          startLine: from,
          endLine: to,
        } = JSON.parse(toolCall.arguments || "{}");

        return (
          <ToolReadBlock
            key={`${toolCall.id}-${index}`}
            filePath={filePath ?? ""}
            extra={`, lines ${from ?? "?"} to ${to ?? "?"}`}
          />
        );
      })}
    </>
  );
}
