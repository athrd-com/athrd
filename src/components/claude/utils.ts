import type { ClaudeRequest, ToolResultContent } from "@/types/claude";

export function isToolResult(content: any): content is ToolResultContent[] {
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content[0].type === "tool_result"
  );
}

export function findToolResult(
  toolUseId: string,
  requests: ClaudeRequest[],
  startIndex: number
): string | undefined {
  for (let i = startIndex; i < requests.length; i++) {
    const req = requests[i]!;
    if (req.message.role === "user" && isToolResult(req.message.content)) {
      const result = req.message.content.find(
        (r) => r.tool_use_id === toolUseId
      );
      if (result) return result.content;
    }
    // Stop looking if we hit another user message that isn't a tool result
    // or if we hit an assistant message (though results usually follow immediately)
    if (req.message.role === "user" && !isToolResult(req.message.content)) {
      break;
    }
  }
  return undefined;
}

export function groupRequests(requests: ClaudeRequest[]) {
  const groupedRequests: (ClaudeRequest | ClaudeRequest[])[] = [];
  let currentAssistantGroup: ClaudeRequest[] = [];

  for (let i = 0; i < requests.length; i++) {
    const request = requests[i]!;

    if (request.message.role === "assistant") {
      currentAssistantGroup.push(request);
    } else if (
      request.message.role === "user" &&
      isToolResult(request.message.content)
    ) {
      // If it's a tool result, check if it belongs to the current assistant group
      // If so, we don't add it as a separate item, it will be "absorbed" by the tool use rendering
      // However, if there is no current assistant group, we must render it (orphan result)
      if (currentAssistantGroup.length === 0) {
        groupedRequests.push(request);
      }
      // Otherwise, skip adding it to groupedRequests, as it's handled by lookahead
    } else {
      // Normal user message
      if (currentAssistantGroup.length > 0) {
        groupedRequests.push([...currentAssistantGroup]);
        currentAssistantGroup = [];
      }
      groupedRequests.push(request);
    }
  }

  if (currentAssistantGroup.length > 0) {
    groupedRequests.push([...currentAssistantGroup]);
  }

  return groupedRequests;
}
