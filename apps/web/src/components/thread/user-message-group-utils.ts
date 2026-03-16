import { isAgentInstructionsUserMessage } from "@/lib/codex-message-utils";
import type { AthrdUserMessage } from "@/types/athrd";

export function shouldCollapseUserMessageGroup(
  messages: AthrdUserMessage[],
): boolean {
  return (
    messages.length > 1 &&
    messages.slice(0, -1).every((message) => isAgentInstructionsUserMessage(message))
  );
}
