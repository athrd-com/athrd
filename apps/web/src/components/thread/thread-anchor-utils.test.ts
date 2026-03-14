import type { AthrdAssistantMessage, AthrdUserMessage } from "@/types/athrd";
import { describe, expect, it } from "vitest";
import {
  getThreadAnchorHref,
  getThreadAnchorId,
  groupMessages,
} from "./thread-anchor-utils";

function createUserMessage(id: string): AthrdUserMessage {
  return {
    id,
    type: "user",
    content: `user ${id}`,
  };
}

function createAssistantMessage(id: string): AthrdAssistantMessage {
  return {
    id,
    type: "assistant",
    timestamp: "2026-03-13T00:00:00.000Z",
    content: `assistant ${id}`,
  };
}

describe("thread-anchor-utils", () => {
  it("prefixes message ids for thread anchor targets", () => {
    expect(getThreadAnchorId("abc123")).toBe("thread-abc123");
    expect(getThreadAnchorHref("abc123")).toBe("#thread-abc123");
  });

  it("groups consecutive messages and uses the first message id as the anchor", () => {
    const groups = groupMessages([
      createUserMessage("u1"),
      createAssistantMessage("a1"),
      createAssistantMessage("a2"),
      createUserMessage("u2"),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({
      type: "user",
      anchorId: "thread-u1",
    });
    expect(groups[1]).toMatchObject({
      type: "assistant",
      anchorId: "thread-a1",
    });
    expect(groups[1]?.messages.map((message) => message.id)).toEqual([
      "a1",
      "a2",
    ]);
    expect(groups[2]).toMatchObject({
      type: "user",
      anchorId: "thread-u2",
    });
  });
});
