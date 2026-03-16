import type { AthrdUserMessage } from "@/types/athrd";
import { describe, expect, it } from "vitest";
import { shouldCollapseUserMessageGroup } from "./user-message-group-utils";

function createUserMessage(
  id: string,
  variant?: AthrdUserMessage["variant"],
): AthrdUserMessage {
  return {
    id,
    type: "user",
    content: `message ${id}`,
    variant,
  };
}

describe("user-message-group-utils", () => {
  it("collapses leading agent instructions into the same group as the final prompt", () => {
    expect(
      shouldCollapseUserMessageGroup([
        createUserMessage("u1", "agent-instructions"),
        createUserMessage("u2"),
      ]),
    ).toBe(true);
  });

  it("does not collapse single user messages", () => {
    expect(shouldCollapseUserMessageGroup([createUserMessage("u1")])).toBe(false);
  });

  it("does not collapse when earlier messages are real prompts", () => {
    expect(
      shouldCollapseUserMessageGroup([
        createUserMessage("u1"),
        createUserMessage("u2"),
      ]),
    ).toBe(false);
  });
});
