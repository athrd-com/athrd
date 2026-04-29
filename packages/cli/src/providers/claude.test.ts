import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ClaudeCodeProvider } from "./claude.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeJSONL(filePath: string, entries: any[]): void {
  writeFileSync(
    filePath,
    entries.map((entry) => JSON.stringify(entry)).join("\n"),
    "utf-8",
  );
}

beforeEach(() => {
  const home = makeTempDir("athrd-claude-home-");
  process.env.HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("ClaudeCodeProvider", () => {
  test("uses Claude ai-title events as the thread title", async () => {
    const sessionId = "6fb5abb6-0549-4dec-97f3-cedd89fd17aa";
    const projectDir = join(
      process.env.HOME!,
      ".claude",
      "projects",
      "-Users-test-code-athrd",
    );
    mkdirSync(projectDir, { recursive: true });

    const sessionFile = join(projectDir, `${sessionId}.jsonl`);
    writeJSONL(sessionFile, [
      {
        type: "summary",
        summary: "Fallback summary",
      },
      {
        type: "ai-title",
        aiTitle: "Fix unknown command error message",
        sessionId,
      },
      {
        type: "user",
        sessionId,
        uuid: "user-1",
        timestamp: "2026-04-28T17:00:00.000Z",
        message: {
          role: "user",
          content: "Why does this command say unknown command?",
        },
      },
      {
        type: "assistant",
        sessionId,
        uuid: "assistant-1",
        timestamp: "2026-04-28T17:01:00.000Z",
        message: {
          role: "assistant",
          model: "claude-3-5-sonnet-20241022",
          content: [{ type: "text", text: "I'll check the command parser." }],
        },
      },
    ]);

    const provider = new ClaudeCodeProvider();
    const sessions = await provider.list();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe(sessionId);
    expect(sessions[0]?.title).toBe(
      "Fix unknown command error message",
    );
    expect(sessions[0]?.workspacePath).toBe("/Users/test/code/athrd");
  });
});
