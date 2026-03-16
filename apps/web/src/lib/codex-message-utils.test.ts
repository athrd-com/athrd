import type { AthrdUserMessage } from "@/types/athrd";
import { describe, expect, it } from "vitest";
import {
  AGENT_INSTRUCTIONS_PREFIX,
  isAgentInstructionsMessageContent,
  isAgentInstructionsUserMessage,
} from "./codex-message-utils";

describe("codex-message-utils", () => {
  it("detects the Codex AGENTS.md bootstrap prefix", () => {
    expect(
      isAgentInstructionsMessageContent(
        `${AGENT_INSTRUCTIONS_PREFIX}/Users/example/project\n\n<INSTRUCTIONS>...`,
      ),
    ).toBe(true);
    expect(isAgentInstructionsMessageContent("Real user prompt")).toBe(false);
  });

  it("recognizes agent-instructions user messages", () => {
    const message: AthrdUserMessage = {
      id: "u1",
      type: "user",
      content: "bootstrap",
      variant: "agent-instructions",
    };

    expect(isAgentInstructionsUserMessage(message)).toBe(true);
    expect(
      isAgentInstructionsUserMessage({
        ...message,
        variant: undefined,
      }),
    ).toBe(false);
  });
});
