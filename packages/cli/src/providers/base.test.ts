import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getDefaultProviderThreadMetadata,
  parseRawSessionFile,
} from "./base.js";
import type { ChatSession } from "../types/index.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makeSession(filePath: string): ChatSession {
  return {
    sessionId: "session-1",
    creationDate: Date.parse("2026-04-22T14:55:26.053Z"),
    lastMessageDate: Date.parse("2026-04-22T15:18:42.331Z"),
    title: "Add S3 upload support",
    requestCount: 2,
    filePath,
    source: "codex",
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("provider base helpers", () => {
  test("parses raw JSON files", async () => {
    const dir = makeTempDir("athrd-provider-base-");
    const filePath = join(dir, "session.json");
    writeFileSync(filePath, '{"messages":[]}', "utf-8");

    await expect(parseRawSessionFile(makeSession(filePath))).resolves.toEqual({
      kind: "raw",
      format: "json",
      fileName: "athrd-session-1.json",
      content: '{"messages":[]}',
    });
  });

  test("parses raw JSONL files", async () => {
    const dir = makeTempDir("athrd-provider-base-");
    const filePath = join(dir, "session.jsonl");
    writeFileSync(filePath, '{"type":"session"}\n{"type":"message"}', "utf-8");

    await expect(parseRawSessionFile(makeSession(filePath))).resolves.toEqual({
      kind: "raw",
      format: "jsonl",
      fileName: "athrd-session-1.jsonl",
      content: '{"type":"session"}\n{"type":"message"}',
    });
  });

  test("returns normalized provider metadata", () => {
    expect(
      getDefaultProviderThreadMetadata({ id: "codex" }, makeSession("/tmp/s.jsonl")),
    ).toEqual({
      id: "session-1",
      providerSessionId: "session-1",
      source: "codex",
      title: "Add S3 upload support",
      messageCount: 2,
      startedAt: "2026-04-22T14:55:26.053Z",
      updatedAt: "2026-04-22T15:18:42.331Z",
    });
  });

  test("skips invalid JSON", async () => {
    const dir = makeTempDir("athrd-provider-base-");
    const filePath = join(dir, "session.json");
    writeFileSync(filePath, "{", "utf-8");

    const result = await parseRawSessionFile(makeSession(filePath));
    expect(result.kind).toBe("skip");
  });
});
