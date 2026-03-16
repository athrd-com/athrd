import type { AthrdUserMessage } from "@/types/athrd";

export const AGENT_INSTRUCTIONS_PREFIX = "# AGENTS.md instructions for ";

export function isAgentInstructionsMessageContent(
  content: string | undefined | null,
): boolean {
  return typeof content === "string" && content.startsWith(AGENT_INSTRUCTIONS_PREFIX);
}

export function isAgentInstructionsUserMessage(
  message: AthrdUserMessage | undefined,
): boolean {
  return message?.variant === "agent-instructions";
}
