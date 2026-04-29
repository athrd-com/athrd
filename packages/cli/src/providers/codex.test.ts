import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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
    expect(session.title).toBe("FOO\nBAR");
    expect(session.requestCount).toBe(1);
  });

  test("uses Codex state sqlite title when available", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "athrd-codex-"));
    const stateDbPath = path.join(tmpDir, "state.sqlite");
    const sessionId = "session_sqlite_title";
    const previousStatePath = process.env.ATHRD_CODEX_STATE_SQLITE;

    try {
      const db = new Database(stateDbPath);
      db.run("CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT)");
      db.run("INSERT INTO threads (id, title) VALUES (?, ?)", [
        "other_session",
        "Wrong title",
      ]);
      db.run("INSERT INTO threads (id, title) VALUES (?, ?)", [
        sessionId,
        "SQLite title",
      ]);
      db.close();

      process.env.ATHRD_CODEX_STATE_SQLITE = stateDbPath;

      const provider = new CodexProvider() as any;
      const session = provider.createSessionFromEntries(
        [
          {
            type: "session_meta",
            payload: {
              id: sessionId,
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
              content: [{ type: "input_text", text: "fallback title" }],
            },
          },
        ],
        "/tmp/rollout.jsonl",
      );

      expect(provider.readThreadTitleFromSQLite(sessionId)).toBe(
        "SQLite title",
      );
      expect(session?.title).toBe("SQLite title");
    } finally {
      if (previousStatePath === undefined) {
        delete process.env.ATHRD_CODEX_STATE_SQLITE;
      } else {
        process.env.ATHRD_CODEX_STATE_SQLITE = previousStatePath;
      }

      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
