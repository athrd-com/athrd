import type { AthrdAssistantMessage } from "@/types/athrd";
import type { CodexThread } from "@/types/codex";
import { describe, expect, it } from "vitest";
import { codexParser } from "./codex";

// Helper to create a valid Codex thread structure
const createBaseThread = (): CodexThread => ({
  sessionId: "session_1",
  timestamp: "2024-01-07T12:00:00Z",
  type: "message",
  payload: {
    id: "session_1",
    timestamp: "2024-01-07T12:00:00Z",
    cwd: "/path/to/project",
    originator: "codex",
    cli_version: "1.0.0",
    instructions: null,
    source: "cli",
    model_provider: "anthropic",
    git: {
      commit_hash: "abc123",
      branch: "main",
      repository_url: "https://github.com/user/repo",
    },
  },
  messages: [],
});

describe("codexParser", () => {
  describe("canParse", () => {
    it("should identify a valid Codex thread with messages", () => {
      const validThread = createBaseThread();
      validThread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello" }],
          },
        },
      ];

      expect(codexParser.canParse(validThread)).toBe(true);
    });

    it("should identify a valid Codex thread with payload structure", () => {
      const validThread = createBaseThread();
      expect(codexParser.canParse(validThread)).toBe(true);
    });

    it("should reject invalid thread structures", () => {
      expect(codexParser.canParse(null)).toBe(false);
      expect(codexParser.canParse(undefined)).toBe(false);
      expect(codexParser.canParse({})).toBe(false);
      expect(codexParser.canParse({ sessionId: "test" })).toBe(false);
      expect(codexParser.canParse({ messages: "not an array" })).toBe(false);
    });

    it("should accept empty messages array", () => {
      const emptyThread = createBaseThread();
      expect(codexParser.canParse(emptyThread)).toBe(true);
    });

    it("should reject threads without sessionId or payload", () => {
      const invalidThread = {
        timestamp: "2024-01-07T12:00:00Z",
        type: "message",
        messages: [],
      };
      expect(codexParser.canParse(invalidThread)).toBe(false);
    });
  });

  describe("parse - user messages", () => {
    it("should parse a simple user message", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello, Codex!" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        type: "user",
        content: "Hello, Codex!",
      });
    });

    it("should parse user message with multiple content blocks", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: "First part" },
              { type: "input_text", text: "Second part" },
            ],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("First part\nSecond part");
    });

    it("should skip environment context messages", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "<environment_context>System info...</environment_context>",
              },
            ],
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Real user message" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("Real user message");
    });

    it("should skip empty user messages", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "   " }],
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Valid message" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("Valid message");
    });
  });

  describe("parse - assistant messages", () => {
    it("should parse a simple assistant message", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "turn_context",
          payload: {
            cwd: "/path/to/project",
            approval_policy: "auto",
            sandbox_policy: {
              type: "strict",
              network_access: false,
              exclude_tmpdir_env_var: false,
              exclude_slash_tmp: false,
            },
            model: "claude-3-5-sonnet-20241022",
            summary: null,
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: "Hello! How can I help you?" },
            ],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        type: "assistant",
        content: "Hello! How can I help you?",
        model: "claude-3-5-sonnet-20241022",
      });
    });

    it("should parse assistant message with reasoning", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "reasoning",
            summary: [
              {
                type: "summary_text",
                text: "**Analysis** Let me analyze this problem...",
              },
            ],
            content: "Detailed thinking process here",
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Here's my response" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      const assistantMsg = result.messages[0];
      expect(assistantMsg?.type).toBe("assistant");
      if (assistantMsg?.type !== "assistant")
        throw new Error("Expected assistant message");
      expect(assistantMsg.thoughts).toHaveLength(2);
      expect(assistantMsg.thoughts?.[0]).toMatchObject({
        subject: "Analysis",
        description: "Let me analyze this problem...",
      });
      expect(assistantMsg.thoughts?.[1]).toMatchObject({
        subject: "Thinking",
        description: "Detailed thinking process here",
      });
    });

    it("should handle multiple text blocks in assistant message", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "First paragraph" }],
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Second paragraph" }],
          },
        },
        {
          timestamp: "2024-01-07T12:00:02Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Third paragraph" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe(
        "First paragraph\n\nSecond paragraph\n\nThird paragraph"
      );
    });

    it("should handle assistant message with empty text blocks", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "   " }],
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Valid content" }],
          },
        },
        {
          timestamp: "2024-01-07T12:00:02Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("Valid content");
    });

    it("should handle reasoning with null content", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "reasoning",
            summary: [
              {
                type: "summary_text",
                text: "**Planning** Creating a plan...",
              },
            ],
            content: null,
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Plan created" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      const assistantMsg = result.messages[0];
      if (assistantMsg?.type !== "assistant")
        throw new Error("Expected assistant message");
      expect(assistantMsg.thoughts).toHaveLength(1);
      expect(assistantMsg.thoughts?.[0]).toMatchObject({
        subject: "Planning",
        description: "Creating a plan...",
      });
    });

    describe("tool calls", () => {
      it("should parse terminal_command tool call with result", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "bash",
              arguments: JSON.stringify({ command: "npm install" }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: [
                {
                  type: "input_text",
                  text: JSON.stringify("Dependencies installed"),
                },
              ],
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "terminal_command",
          args: {
            command: "npm install",
          },
        });
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result
        ).toHaveLength(1);
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result?.[0]
        ).toMatchObject({
          name: "bash",
          output: {
            type: "text",
            text: "Dependencies installed",
          },
        });
      });

      it("should parse terminal_command with cwd", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "bash",
              arguments: JSON.stringify({
                command: "ls -la",
                cwd: "/path/to/dir",
              }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: [
                {
                  type: "input_text",
                  text: JSON.stringify("file1.txt\nfile2.txt"),
                },
              ],
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "terminal_command",
          args: {
            command: "ls -la",
            cwd: "/path/to/dir",
          },
        });
      });

      it("should parse exec_command tool call as terminal_command", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "exec_command",
              arguments: JSON.stringify({
                cmd: "git status --short",
                cwd: "/repo",
              }),
              call_id: "call_exec",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_exec",
              output: [
                {
                  type: "input_text",
                  text: JSON.stringify(" M apps/web/src/parsers/utils.ts"),
                },
              ],
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "terminal_command",
          args: {
            command: "git status --short",
            cwd: "/repo",
          },
        });
      });

      it("should parse todos tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "update_plan",
              arguments: JSON.stringify({
                plan: [
                  { step: "Setup vitest", status: "completed" },
                  { step: "Write tests", status: "pending" },
                ],
              }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: [
                {
                  type: "input_text",
                  text: JSON.stringify("Plan updated"),
                },
              ],
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "todos",
          args: {
            plan: [
              { step: "Setup vitest", status: "completed" },
              { step: "Write tests", status: "pending" },
            ],
          },
        });
      });

      it("should parse request_user_input as todos and mark selected option as completed", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "request_user_input",
              arguments: JSON.stringify({
                questions: [
                  {
                    header: "Marker append",
                    id: "dedupe_behavior",
                    question:
                      "When writing `.athrd-ai-marker`, should we append the URL every successful share, or avoid duplicate lines already present?",
                    options: [
                      {
                        label: "Always append (Recommended)",
                        description:
                          "Simple and deterministic; logs every share event even if URL repeats.",
                      },
                      {
                        label: "Skip duplicates",
                        description:
                          "Keeps file smaller by appending only URLs not already present.",
                      },
                    ],
                  },
                ],
              }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: JSON.stringify([
                {
                  id: "34cd4d42-97de-4aed-8576-deb4af1c2faa",
                  name: "request_user_input",
                  output: {
                    type: "text",
                    text: {
                      answers: {
                        dedupe_behavior: {
                          answers: ["Skip duplicates"],
                        },
                      },
                    },
                  },
                },
              ]),
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "todos",
          args: {
            plan: [
              { step: "Always append (Recommended)", status: "pending" },
              { step: "Skip duplicates", status: "completed" },
            ],
          },
        });
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result?.[0]
            ?.output
        ).toMatchObject({
          type: "text",
          text: "When writing `.athrd-ai-marker`, should we append the URL every successful share, or avoid duplicate lines already present?",
        });
      });

      it("should parse MCP tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "mcp__vercel__list_projects",
              arguments: JSON.stringify({
                input: "teamId=team_123",
                cache_type: "ephemeral",
              }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: [
                {
                  type: "input_text",
                  text: JSON.stringify('{"projects": []}'),
                },
              ],
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "mcp_tool_call",
          args: {
            server_name: "vercel",
            tool_name: "list_projects",
            input: "teamId=team_123",
            cache_type: "ephemeral",
          },
        });
      });

      it("should parse tool call with image result", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "read_file",
              arguments: JSON.stringify({ path: "/path/to/image.png" }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: [
                {
                  type: "input_image",
                  image_url: "data:image/png;base64,base64imagedata",
                },
              ],
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result?.[0]
        ).toMatchObject({
          name: "read_file",
          output: {
            type: "image",
            mimeType: "image/png",
            data: "base64imagedata",
          },
        });
      });

      it("should handle tool call without result", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "read_file",
              arguments: JSON.stringify({ path: "/path/to/file.ts" }),
              call_id: "call_1",
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "read_file",
          args: {
            path: "/path/to/file.ts",
          },
        });
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result
        ).toHaveLength(1);
      });

      it("should handle unknown tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "unknown_tool",
              arguments: JSON.stringify({ custom_param: "value" }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: [
                {
                  type: "input_text",
                  text: JSON.stringify("Tool executed"),
                },
              ],
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "unknown_tool",
          args: {
            custom_param: "value",
          },
        });
      });

      it("should handle tool call with string output", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "some_tool",
              arguments: JSON.stringify({ param: "value" }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: "Simple string output",
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result?.[0]
        ).toMatchObject({
          name: "some_tool",
          output: {
            type: "text",
            text: "Simple string output",
          },
        });
      });

      it("should handle multiple tool calls in sequence", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            timestamp: "2024-01-07T12:00:00Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "read_file",
              arguments: JSON.stringify({ path: "/file1.ts" }),
              call_id: "call_1",
            },
          },
          {
            timestamp: "2024-01-07T12:00:01Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_1",
              output: [
                {
                  type: "input_text",
                  text: JSON.stringify("content of file1"),
                },
              ],
            },
          },
          {
            timestamp: "2024-01-07T12:00:02Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "read_file",
              arguments: JSON.stringify({ path: "/file2.ts" }),
              call_id: "call_2",
            },
          },
          {
            timestamp: "2024-01-07T12:00:03Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call_2",
              output: [
                {
                  type: "input_text",
                  text: JSON.stringify("content of file2"),
                },
              ],
            },
          },
        ];

        const result = codexParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          2
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.args
        ).toMatchObject({
          path: "/file1.ts",
        });
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[1]?.args
        ).toMatchObject({
          path: "/file2.ts",
        });
      });
    });

    it("should handle mixed content: text, reasoning, and tool calls", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: "Let me help you with that." },
            ],
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "reasoning",
            summary: [
              {
                type: "summary_text",
                text: "**Analysis** Analyzing the request...",
              },
            ],
            content: "Detailed analysis here",
          },
        },
        {
          timestamp: "2024-01-07T12:00:02Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "bash",
            arguments: JSON.stringify({ command: "echo test" }),
            call_id: "call_1",
          },
        },
        {
          timestamp: "2024-01-07T12:00:03Z",
          type: "response_item",
          payload: {
            type: "function_call_output",
            call_id: "call_1",
            output: [
              {
                type: "input_text",
                text: JSON.stringify("test"),
              },
            ],
          },
        },
        {
          timestamp: "2024-01-07T12:00:04Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Task completed!" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      const assistantMsg = result.messages[0];
      if (assistantMsg?.type !== "assistant")
        throw new Error("Expected assistant message");

      expect(assistantMsg.content).toBe(
        "Let me help you with that.\n\nTask completed!"
      );
      expect(assistantMsg.thoughts).toHaveLength(2);
      expect(assistantMsg.toolCalls).toHaveLength(1);
    });
  });

  describe("parse - turn context", () => {
    it("should update model from turn_context", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "turn_context",
          payload: {
            cwd: "/path/to/project",
            approval_policy: "auto",
            sandbox_policy: {
              type: "strict",
              network_access: false,
              exclude_tmpdir_env_var: false,
              exclude_slash_tmp: false,
            },
            model: "claude-opus-4-20250514",
            summary: null,
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Response" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.model).toBe("claude-opus-4-20250514");
    });
  });

  describe("parse - event messages", () => {
    it("should skip event_msg types", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            message: "Starting task...",
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.type).toBe("user");
    });
  });

  describe("parse - ghost snapshots", () => {
    it("should skip ghost_snapshot payload types", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          timestamp: "2024-01-07T12:00:00Z",
          type: "response_item",
          payload: {
            type: "ghost_snapshot",
            ghost_commit: {
              id: "commit_123",
              parent: "commit_122",
            },
          },
        },
        {
          timestamp: "2024-01-07T12:00:01Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Response" }],
          },
        },
      ];

      const result = codexParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.type).toBe("assistant");
    });
  });
});
