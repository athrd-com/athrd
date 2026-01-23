import type { VSCodeThread } from "@/types/vscode";
import { describe, expect, it } from "vitest";
import { vscodeParser } from "./vscode";

const createBaseThread = (): VSCodeThread => ({
  version: 0,
  requesterUsername: "",
  requesterAvatarIconUri: "foo://bar",
  responderUsername: "",
  responderAvatarIconUri: "foo://bar",
  requests: [],
  sessionId: "",
  creationDate: 0,
  isImported: false,
  lastMessageDate: 0,
});

describe("vscodeParser", () => {
  describe("parse - user messages", () => {
    it("should parse a simple user message", () => {
      const thread = createBaseThread();
      thread.requests = [];

      const result = vscodeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        type: "user",
        content: "Hello, Codex!",
      });
    });

    it("should parse user message with multiple content blocks", () => {
      const thread = createBaseThread();
      thread.requests = [];

      const result = vscodeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("First part\nSecond part");
    });

    it("should skip empty user messages", () => {
      const thread = createBaseThread();
      thread.requests = [];

      const result = vscodeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("Valid message");
    });
  });
});
