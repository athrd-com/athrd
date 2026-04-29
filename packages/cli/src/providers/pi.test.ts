import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PiProvider } from "./pi.js";

const tempDirs: string[] = [];
const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  if (originalPiCodingAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("PiProvider", () => {
  test("discovers Pi JSONL sessions and preserves entries for parsing", async () => {
    const agentDir = makeTempDir("athrd-pi-agent-");
    process.env.PI_CODING_AGENT_DIR = agentDir;

    const sessionDir = join(
      agentDir,
      "sessions",
      "--Users-gregorymarcilhacy-code-athrd--",
    );
    mkdirSync(sessionDir, { recursive: true });
    const sessionFile = join(
      sessionDir,
      "2026-04-22T14-55-26-053Z_019db5b0-5765-740b-9c85-535e5009fd9b.jsonl",
    );
    const toolCallId =
      "call_rXJ84iiJ2nNaJf1bkHDKpODq|fc_054902127f4391cf0169e8e16b66688197bc072334b9ecb9b7";

    const entries = [
      {
        type: "session",
        version: 3,
        id: "019db5b0-5765-740b-9c85-535e5009fd9b",
        timestamp: "2026-04-22T14:55:26.053Z",
        cwd: "/Users/gregorymarcilhacy/code/athrd",
      },
      {
        type: "model_change",
        id: "621b9d57",
        parentId: null,
        timestamp: "2026-04-22T14:55:26.067Z",
        provider: "openai-codex",
        modelId: "gpt-5.4",
      },
      {
        type: "thinking_level_change",
        id: "afaf23a3",
        parentId: "621b9d57",
        timestamp: "2026-04-22T14:55:26.067Z",
        thinkingLevel: "medium",
      },
      {
        type: "message",
        id: "3ed89b7c",
        parentId: "afaf23a3",
        timestamp: "2026-04-22T14:55:35.575Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "list the folders in ~/.pi/" }],
          timestamp: 1776869735571,
        },
      },
      {
        type: "message",
        id: "87fb6f5c",
        parentId: "3ed89b7c",
        timestamp: "2026-04-22T14:55:39.602Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "**Following command compliance**\n\nI need to run the folder listing with bash.",
            },
            {
              type: "toolCall",
              id: toolCallId,
              name: "bash",
              arguments: {
                command:
                  "find ~/.pi -maxdepth 1 -mindepth 1 -type d -print | sort",
              },
            },
          ],
          provider: "openai-codex",
          model: "gpt-5.4",
          stopReason: "toolUse",
          timestamp: 1776869735580,
        },
      },
      {
        type: "message",
        id: "4097b33f",
        parentId: "87fb6f5c",
        timestamp: "2026-04-22T14:55:39.616Z",
        message: {
          role: "toolResult",
          toolCallId,
          toolName: "bash",
          content: [{ type: "text", text: "/Users/gregorymarcilhacy/.pi/agent\n" }],
          isError: false,
          timestamp: 1776869739616,
        },
      },
      {
        type: "message",
        id: "814bd521",
        parentId: "4097b33f",
        timestamp: "2026-04-22T14:55:41.482Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Folders in `~/.pi`:\n\n- `/Users/gregorymarcilhacy/.pi/agent`",
            },
          ],
          provider: "openai-codex",
          model: "gpt-5.4",
          stopReason: "stop",
          timestamp: 1776869739618,
        },
      },
    ];

    writeFileSync(
      sessionFile,
      entries.map((entry) => JSON.stringify(entry)).join("\n"),
      "utf-8",
    );

    const provider = new PiProvider();
    const sessions = await provider.list();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe("019db5b0-5765-740b-9c85-535e5009fd9b");
    expect(sessions[0]?.title).toBe("list the folders in ~/.pi/");
    expect(sessions[0]?.requestCount).toBe(1);
    expect(sessions[0]?.workspacePath).toBe("/Users/gregorymarcilhacy/code/athrd");

    const artifact = await provider.parse(sessions[0]!);
    expect(artifact.kind).toBe("raw");
    if (artifact.kind !== "raw") {
      throw new Error("Expected Pi session to produce a raw artifact");
    }

    expect(artifact.format).toBe("jsonl");
    const parsed = Bun.JSONL.parse(artifact.content) as any[];
    expect(parsed).toHaveLength(7);
    expect(parsed[0].type).toBe("session");
    expect(parsed[0].id).toBe("019db5b0-5765-740b-9c85-535e5009fd9b");
    expect(parsed[0].cwd).toBe("/Users/gregorymarcilhacy/code/athrd");
    expect(parsed[3].message.content[0].text).toBe(
      "list the folders in ~/.pi/",
    );
    expect(parsed[4].message.content[1]).toMatchObject({
      type: "toolCall",
      id: toolCallId,
      name: "bash",
    });
    expect(parsed[5].message).toMatchObject({
      role: "toolResult",
      toolCallId,
      toolName: "bash",
    });
  });
});
