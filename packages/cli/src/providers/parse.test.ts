import { describe, expect, test } from "bun:test";
import { CursorProvider } from "./cursor.js";
import { OpenCodeProvider } from "./opencode.js";
import type { ChatSession } from "../types/index.js";

function makeSession(metadata?: any): ChatSession {
  return {
    sessionId: "session-1",
    creationDate: Date.parse("2026-04-22T14:55:26.053Z"),
    lastMessageDate: Date.parse("2026-04-22T15:18:42.331Z"),
    title: "Test session",
    requestCount: 1,
    filePath: "/tmp/session.json",
    source: "cursor",
    metadata,
  };
}

describe("provider raw parse support", () => {
  test("skips Cursor composer sessions", async () => {
    const provider = new CursorProvider();

    await expect(
      provider.parse(makeSession({ sessionType: "composer" })),
    ).resolves.toEqual({
      kind: "skip",
      reason: "Cursor composer sessions are stored in SQLite, not a single raw file.",
    });
  });

  test("skips OpenCode multi-file sessions", async () => {
    const provider = new OpenCodeProvider();

    await expect(provider.parse(makeSession())).resolves.toEqual({
      kind: "skip",
      reason: "OpenCode sessions are stored across multiple files.",
    });
  });
});
