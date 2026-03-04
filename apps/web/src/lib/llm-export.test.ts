import type { AThrd } from "@/types/athrd";
import { describe, expect, it } from "vitest";
import { renderLlmTxt } from "./llm-export";

const sampleThread: AThrd = {
  messages: [
    {
      id: "u1",
      type: "user",
      content: "Build the feature.\nInclude tests.",
    },
    {
      id: "a1",
      type: "assistant",
      timestamp: "2026-03-03T20:00:00.000Z",
      content: "Implemented initial version.",
      thoughts: [
        {
          subject: "Plan",
          description: "Need serializer plus route.",
          timestamp: "2026-03-03T20:00:01.000Z",
        },
      ],
      toolCalls: [
        {
          id: "tc1",
          name: "terminal_command",
          timestamp: "2026-03-03T20:00:02.000Z",
          args: {
            command: "npm test",
          },
          result: [
            {
              id: "r1",
              name: "terminal_command",
              output: {
                type: "text",
                text: "ok",
              },
            },
          ],
        },
      ],
    },
    {
      id: "a2",
      type: "assistant",
      timestamp: "2026-03-03T20:01:00.000Z",
      toolCalls: [
        {
          id: "tc2",
          name: "read_file",
          timestamp: "2026-03-03T20:01:01.000Z",
          args: { file_path: "/tmp/x.ts" },
          result: [
            {
              id: "r2",
              name: "read_file",
              error: "ENOENT",
            },
          ],
        },
      ],
    },
  ],
};

describe("renderLlmTxt", () => {
  it("renders metadata header and only user/assistant text without timestamps", () => {
    const output = renderLlmTxt({
      thread: sampleThread,
      metadata: {
        repoName: "athrd-com/athrd",
        modelsUsed: ["claude-3-5-sonnet-20241022"],
        ide: "claude",
        title: "Add thread exports",
      },
    });

    expect(output).toContain("repo: athrd-com/athrd");
    expect(output).toContain("model: claude-3-5-sonnet-20241022");
    expect(output).toContain("ide: claude");
    expect(output).toContain("title: Add thread exports");
    expect(output).toContain("[USER]");
    expect(output).toContain("Build the feature.");
    expect(output).toContain("[ASSISTANT]");
    expect(output).toContain("Implemented initial version.");
    expect(output).not.toContain("timestamp=");
    expect(output).not.toContain("[THINKING]");
    expect(output).not.toContain("[TOOL_CALL]");
    expect(output).not.toContain("[TOOL_RESULT]");
    expect(output).not.toContain("ENOENT");
  });
});
