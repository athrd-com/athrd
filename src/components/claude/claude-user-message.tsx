import type { GistOwner } from "@/lib/github";
import type { ClaudeRequest, ToolResultContent } from "@/types/claude";
import UserPrompt from "../thread/user-prompt";
import { isToolResult } from "./utils";

type ClaudeUserMessageProps = {
  request: ClaudeRequest;
  owner: GistOwner;
};

export default function ClaudeUserMessage({
  request,
  owner,
}: ClaudeUserMessageProps) {
  if (
    request.message.role === "user" &&
    typeof request.message.content === "string"
  ) {
    return <UserPrompt owner={owner} prompt={request.message.content} />;
  }

  // User messages (Tool Results) - Orphans only
  if (
    request.message.role === "user" &&
    isToolResult(request.message.content)
  ) {
    return (
      <div className="pl-12">
        {request.message.content.map((result: ToolResultContent, i: number) => (
          <div
            key={i}
            className="bg-black/5 dark:bg-white/5 p-3 rounded-md font-mono text-xs overflow-x-auto whitespace-pre-wrap text-gray-600 dark:text-gray-300 border border-black/5 dark:border-white/5"
          >
            {result.content}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
