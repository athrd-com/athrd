import { describe, expect, test } from "bun:test";
import { CodexProvider } from "./codex.js";

describe("CodexProvider", () => {
  test("combines multiple input_text blocks for a single user message", () => {
    const provider = new CodexProvider() as any;
    const entries = [
      {
        type: "session_meta",
        payload: {
          id: "session_1",
          cwd: "/tmp/workspace",
        },
        timestamp: "2026-03-02T20:45:10.000Z",
      },
      {
        timestamp: "2026-03-02T20:45:11.971Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "FOO",
            },
            {
              type: "input_text",
              text: "BAR",
            },
          ],
        },
      },
    ];

    const session = provider.createSessionFromEntries(entries, "/tmp/test.jsonl");
    expect(session).not.toBeNull();
    expect(session.customTitle).toBe("FOO\nBAR");
    expect(session.requestCount).toBe(1);
  });
});
