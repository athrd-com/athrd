import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as crypto from "crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { GeminiProvider } from "./gemini.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalGeminiHome = process.env.GEMINI_HOME;

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

function hashPath(dirPath: string): string {
  return crypto.createHash("sha256").update(dirPath).digest("hex");
}

beforeEach(() => {
  const home = makeTempDir("athrd-gemini-home-");
  process.env.HOME = home;
  process.env.GEMINI_HOME = join(home, ".gemini");
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalGeminiHome === undefined) {
    delete process.env.GEMINI_HOME;
  } else {
    process.env.GEMINI_HOME = originalGeminiHome;
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("GeminiProvider", () => {
  test("discovers Gemini JSONL sessions and resolves workspace from projectHash", async () => {
    const home = process.env.HOME!;
    const workspacePath = join(home, "src", "athrd");
    mkdirSync(workspacePath, { recursive: true });

    const geminiProjectDir = join(process.env.GEMINI_HOME!, "tmp", "athrd");
    mkdirSync(geminiProjectDir, { recursive: true });
    writeFileSync(
      join(geminiProjectDir, ".project_root"),
      workspacePath,
      "utf-8",
    );
    const chatsDir = join(geminiProjectDir, "chats");
    mkdirSync(chatsDir, { recursive: true });
    const sessionFile = join(
      chatsDir,
      "session-2026-05-05T05-48-afd428a3.jsonl",
    );

    writeJSONL(sessionFile, [
      {
        sessionId: "afd428a3-f503-483f-9a8e-1591a4aacdc2",
        projectHash: hashPath(workspacePath),
        startTime: "2026-05-05T05:48:00.644Z",
        lastUpdated: "2026-05-05T05:48:00.644Z",
        kind: "main",
      },
      {
        id: "user-1",
        timestamp: "2026-05-05T05:48:05.184Z",
        type: "user",
        content: [{ text: "What's this repo about?" }],
      },
      {
        $set: {
          lastUpdated: "2026-05-05T05:48:05.184Z",
        },
      },
      {
        id: "assistant-1",
        timestamp: "2026-05-05T05:48:08.125Z",
        type: "gemini",
        content: "",
        model: "gemini-3-flash-preview",
      },
      {
        id: "assistant-1",
        timestamp: "2026-05-05T05:48:08.125Z",
        type: "gemini",
        content: "",
        model: "gemini-3-flash-preview",
        toolCalls: [
          {
            id: "read_file_1",
            name: "read_file",
            args: { file_path: "README.md" },
            result: [],
          },
        ],
      },
      {
        $set: {
          lastUpdated: "2026-05-05T05:48:08.126Z",
        },
      },
    ]);

    const provider = new GeminiProvider();
    const sessions = await provider.list();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: "afd428a3-f503-483f-9a8e-1591a4aacdc2",
      title: "What's this repo about?",
      requestCount: 2,
      filePath: sessionFile,
      source: "gemini",
      workspaceName: "athrd",
      workspacePath,
    });
    expect(sessions[0]?.creationDate).toBe(
      Date.parse("2026-05-05T05:48:00.644Z"),
    );
    expect(sessions[0]?.lastMessageDate).toBe(
      Date.parse("2026-05-05T05:48:08.126Z"),
    );

    const artifact = await provider.parse(sessions[0]!);
    expect(artifact.kind).toBe("raw");
    if (artifact.kind !== "raw") {
      throw new Error("Expected Gemini session to produce a raw artifact");
    }
    expect(artifact.format).toBe("jsonl");
    expect(artifact.fileName).toBe(
      "athrd-afd428a3-f503-483f-9a8e-1591a4aacdc2.jsonl",
    );
  });
});
