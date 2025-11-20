import type { ClaudeRequest, RequestAssistantMessage } from "@/types/claude";
import { Avatar, AvatarFallback } from "../ui/avatar";
import ClaudeBlock from "./claude-block";
import { findToolResult } from "./utils";

type ClaudeAssistantGroupProps = {
  group: ClaudeRequest[];
  allRequests: ClaudeRequest[];
};

export default function ClaudeAssistantGroup({
  group,
  allRequests,
}: ClaudeAssistantGroupProps) {
  const firstRequest = group[0];
  if (!firstRequest) return null;

  return (
    <div className="flex gap-4">
      <Avatar className="h-8 w-8 mt-1 border border-white/10 shrink-0">
        <AvatarFallback className="bg-[#D97757] text-white text-[10px] font-bold">
          CL
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-4 overflow-hidden">
        {group.map((request) => {
          const message = request.message as RequestAssistantMessage;
          return message.content.map((block, blockIndex) => {
            const key = `${request.id}-${blockIndex}`;
            let result: string | undefined;

            if (block.type === "tool_use") {
              // Find the result for this tool use
              // We search in the original requests array starting from the current request index
              const requestIndex = allRequests.findIndex(
                (r) => r.id === request.id
              );
              result = findToolResult(block.id, allRequests, requestIndex + 1);
            }

            return <ClaudeBlock key={key} block={block} result={result} />;
          });
        })}
      </div>
    </div>
  );
}
