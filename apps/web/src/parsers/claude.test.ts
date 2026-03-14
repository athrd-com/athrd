import type { AthrdAssistantMessage } from "@/types/athrd";
import type { ClaudeThread, MessageUsage } from "@/types/claude";
import { describe, expect, it } from "vitest";
import { claudeParser } from "./claude";

// Helper to create valid MessageUsage for tests
const createUsage = (): MessageUsage => ({
  cache_creation: {
    ephemeral_5m_input_tokens: 0,
    ephemeral_1h_input_tokens: 0,
  },
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  input_tokens: 5,
  output_tokens: 10,
  service_tier: "default",
});

describe("claudeParser", () => {
  describe("canParse", () => {
    it("should identify a valid Claude thread", () => {
      const validThread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "user",
              content: "Hello",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:00Z",
            type: "",
          },
        ],
      };

      expect(claudeParser.canParse(validThread)).toBe(true);
    });

    it("should reject invalid thread structures", () => {
      expect(claudeParser.canParse(null)).toBe(false);
      expect(claudeParser.canParse(undefined)).toBe(false);
      expect(claudeParser.canParse({})).toBe(false);
      expect(claudeParser.canParse({ requests: null })).toBe(false);
      expect(claudeParser.canParse({ requests: "not an array" })).toBe(false);
    });

    it("should accept empty requests array", () => {
      const emptyThread = { requests: [] };
      expect(claudeParser.canParse(emptyThread)).toBe(true);
    });

    it("should reject threads without message.role", () => {
      const invalidThread = {
        requests: [
          {
            id: "req_1",
            message: {
              content: "Hello",
            },
          },
        ],
      };
      expect(claudeParser.canParse(invalidThread)).toBe(false);
    });
  });

  describe("parse - user messages", () => {
    it("should generate stable fallback ids across repeated parses", () => {
      const thread = {
        requests: [
          {
            id: "",
            message: {
              role: "user",
              content: "Hello, Claude!",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:00Z",
            type: "user",
          },
          {
            id: "",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Hello back.",
                },
              ],
              usage: createUsage(),
              id: "",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:01Z",
            type: "assistant",
          },
        ],
      } satisfies ClaudeThread;

      const firstParse = claudeParser.parse(thread);
      const secondParse = claudeParser.parse(thread);

      expect(firstParse.messages.map((message) => message.id)).toEqual(
        secondParse.messages.map((message) => message.id)
      );
      expect(firstParse.messages[0]?.id).toBeTruthy();
      expect(firstParse.messages[1]?.id).toBeTruthy();
      expect(firstParse.messages[0]?.id).not.toBe(firstParse.messages[1]?.id);
    });

    it("should parse a simple user message", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "user",
              content: "Hello, Claude!",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:00Z",
            type: "user",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        type: "user",
        content: "Hello, Claude!",
      });
    });

    it("should parse user message with MessageContent array", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "user",
              content: [
                { type: "text", text: "First part" },
                { type: "text", text: "Second part" },
              ],
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:00Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("First part\nSecond part");
    });

    it("should extract content from command-name tags", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "user",
              content:
                "<command-message>create_plan</command-message>\n<command-name>/create_plan</command-name>",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:00Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("/create_plan");
    });

    it("should extract content from command-name tags with additional text", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "user",
              content:
                "<command-message>create_plan</command-message>\n<command-name>/create_plan</command-name> to save the world",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:00Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe(
        "/create_plan to save the world"
      );
    });
  });

  describe("parse - assistant messages", () => {
    it("should parse a simple assistant message", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Hello! How can I help you?",
                },
              ],
              usage: createUsage(),
              id: "msg_1",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:01Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        id: "msg_1",
        type: "assistant",
        content: "Hello! How can I help you?",
        model: "claude-3-5-sonnet-20241022",
      });
    });

    it("should parse assistant message with thinking content", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: "Let me analyze this problem...",
                },
                {
                  type: "text",
                  text: "Here's my response",
                },
              ],
              usage: createUsage(),
              id: "msg_1",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:01Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      const assistantMsg = result.messages[0];
      expect(assistantMsg?.type).toBe("assistant");
      if (assistantMsg?.type !== "assistant")
        throw new Error("Expected assistant message");
      expect(assistantMsg.thoughts).toHaveLength(1);
      expect(assistantMsg.thoughts?.[0]).toMatchObject({
        subject: "Let me analyze this problem...",
        description: "Let me analyze this problem...",
      });
    });

    it("should handle multiple text blocks in assistant message", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "First paragraph",
                },
                {
                  type: "text",
                  text: "Second paragraph",
                },
                {
                  type: "text",
                  text: "Third paragraph",
                },
              ],
              usage: createUsage(),
              id: "msg_1",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:01Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe(
        "First paragraph\n\nSecond paragraph\n\nThird paragraph"
      );
    });

    it("should handle assistant message with empty text blocks", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "   ",
                },
                {
                  type: "text",
                  text: "Valid content",
                },
                {
                  type: "text",
                  text: "",
                },
              ],
              usage: createUsage(),
              id: "msg_1",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:01Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("Valid content");
    });

    describe("tool calls", () => {
      it("should parse read_file tool call with result", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "Read",
                    id: "tool_1",
                    input: {
                      file_path: "/path/to/file.ts",
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
            {
              id: "req_2",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    content: "file contents here",
                    is_error: false,
                    tool_use_id: "tool_1",
                  },
                ],
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:02Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

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
            file_path: "/path/to/file.ts",
          },
        });
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result
        ).toHaveLength(1);
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result?.[0]
        ).toMatchObject({
          name: "Read",
          output: {
            type: "text",
            text: "file contents here",
          },
        });
      });

      it("should parse write_file tool call", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "Write",
                    id: "tool_1",
                    input: {
                      file_path: "/path/to/new-file.ts",
                      content: "const x = 1;",
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
            {
              id: "req_2",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    content: "File written successfully",
                    is_error: false,
                    tool_use_id: "tool_1",
                  },
                ],
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:02Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "write_file",
          args: {
            file_path: "/path/to/new-file.ts",
            content: "const x = 1;",
          },
        });
      });

      it("should pase glob tool call", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "3ee5e9ae-61a7-404c-bc83-acf38c89449f",
              type: "assistant",
              message: {
                model: "claude-haiku-4-5-20251001",
                id: "msg_01BXBtRjq5EgkuitShadPKuY",
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    id: "toolu_016eLNZRrPjUuP2G3EbMTwMg",
                    name: "Glob",
                    input: {
                      pattern: ".vercel/**",
                    },
                  },
                ],
                usage: createUsage(),
              },
              timestamp: "2026-01-08T05:41:25.352Z",
            },
            {
              id: "9b30dd29-aff3-4a6d-b297-1ee5749caf95",
              type: "user",
              message: {
                role: "user",
                content: [
                  {
                    tool_use_id: "toolu_016eLNZRrPjUuP2G3EbMTwMg",
                    type: "tool_result",
                    content:
                      "/Users/foobar/code/athrd/.vercel/README.txt\n/Users/foobar/code/athrd/.vercel/.env.preview.local\n/Users/foobar/code/athrd/.vercel/project.json\n/Users/foobar/code/athrd/.vercel/output/diagnostics/turbopack\n/Users/foobar/code/athrd/.vercel/output/builds.json\n/Users/foobar/code/athrd/.vercel/output/diagnostics/build-diagnostics.json\n/Users/foobar/code/athrd/.vercel/output/diagnostics/trace-build\n/Users/foobar/code/athrd/.vercel/output/diagnostics/framework.json\n/Users/foobar/code/athrd/.vercel/output/diagnostics/trace\n/Users/foobar/code/athrd/.vercel/output/config.json\n/Users/foobar/code/athrd/.vercel/output/diagnostics/cli_traces.json",
                  },
                ],
              },
              timestamp: "2026-01-08T05:41:26.026Z",
            },
          ],
        };

        const result = claudeParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0]! as AthrdAssistantMessage;
        expect(assistantMsg.toolCalls).toHaveLength(1);
        const toolCall = assistantMsg.toolCalls?.[0]!;
        expect(toolCall.name).toBe("terminal_command");
      });

      it("should parse replace tool call", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "Edit",
                    id: "tool_1",
                    input: {
                      file_path: "/path/to/file.ts",
                      old_string: "const x = 1;",
                      new_string: "const x = 2;",
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
            {
              id: "req_2",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    content: "Replacement successful",
                    is_error: false,
                    tool_use_id: "tool_1",
                  },
                ],
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:02Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "replace",
          args: {
            file_path: "/path/to/file.ts",
            old_string: "const x = 1;",
            new_string: "const x = 2;",
          },
        });
      });

      it("should parse terminal_command tool call", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "Bash",
                    id: "tool_1",
                    input: {
                      command: "npm install",
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
            {
              id: "req_2",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    content: "Dependencies installed",
                    is_error: false,
                    tool_use_id: "tool_1",
                  },
                ],
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:02Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

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
      });

      it("should parse web_search tool call", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "WebSearch",
                    id: "tool_1",
                    input: {
                      query: "vitest setup",
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
            {
              id: "req_2",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    content: "Search results...",
                    is_error: false,
                    tool_use_id: "tool_1",
                  },
                ],
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:02Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "web_search",
          args: {
            query: "vitest setup",
          },
        });
      });

      it("should parse todos tool call", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "TodoWrite",
                    id: "tool_1",
                    input: {
                      todos: [
                        {
                          content: "Setup vitest",
                          activeform: "Setup vitest",
                          status: "completed",
                        },
                        {
                          content: "Write tests",
                          activeform: "Write tests",
                          status: "pending",
                        },
                      ],
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
            {
              id: "req_2",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    content: "Todos updated",
                    is_error: false,
                    tool_use_id: "tool_1",
                  },
                ],
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:02Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

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

      it("should parse tool call with image result", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "Read",
                    id: "tool_1",
                    input: {
                      file_path: "/path/to/image.png",
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
            {
              id: "req_2",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    content: [
                      {
                        type: "image",
                        source: {
                          type: "base64",
                          data: "base64imagedata",
                          media_type: "image/png",
                        },
                      },
                    ],
                    is_error: false,
                    tool_use_id: "tool_1",
                  },
                ],
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:02Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result?.[0]
        ).toMatchObject({
          name: "Read",
          output: {
            type: "image",
            data: "base64imagedata",
            mimeType: "image/png",
          },
        });
      });

      it("should handle tool call without result", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "Read",
                    id: "tool_1",
                    input: {
                      file_path: "/path/to/file.ts",
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

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
            file_path: "/path/to/file.ts",
          },
        });
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result
        ).toEqual([]);
      });

      it("should handle unknown tool call", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "req_1",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    name: "UnknownTool",
                    id: "tool_1",
                    input: {
                      custom_param: "value",
                    },
                  },
                ],
                usage: createUsage(),
                id: "msg_1",
                model: "claude-3-5-sonnet-20241022",
              },
              timestamp: "2024-01-07T12:00:01Z",
              type: "",
            },
          ],
        };

        const result = claudeParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "UnknownTool",
          args: {
            custom_param: "value",
          },
        });
      });

      it("should handle MCP tool call", () => {
        const thread: ClaudeThread = {
          requests: [
            {
              id: "f6305805-1fbf-4c91-b1be-5f49271224bd",
              type: "assistant",
              message: {
                model: "claude-haiku-4-5-20251001",
                id: "msg_01WwVeY959n9GmkApyThHXo4",
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    id: "toolu_015VgNKaRqmQdPXKBffjrmau",
                    name: "mcp__vercel__list_projects",
                    input: {
                      teamId: "team_kxkSo3HwmMoAIAK2b2Cuepsh",
                    },
                  },
                ],
                usage: createUsage(),
              },
              timestamp: "2026-01-08T05:42:12.329Z",
            },
            {
              id: "e79f53ce-743a-418d-9414-fc1bf5b80012",
              type: "user",
              message: {
                role: "user",
                content: [
                  {
                    tool_use_id: "toolu_015VgNKaRqmQdPXKBffjrmau",
                    type: "tool_result",
                    content: [
                      {
                        type: "text",
                        text: '{\n  "projects": [\n    {\n      "id": "prj_B6s1jH7Bl76sC8JOi5KC7TOCFL2M",\n      "name": "node-app",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1700843024474\n    },\n    {\n      "id": "prj_OAEkirxvQVV9akh8JricuN0YpEDP",\n      "name": "athrd",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1763519068349\n    },\n    {\n      "id": "prj_YnWOdIowlLC160aQEDbsbXnhD1P0",\n      "name": "screens-farm",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1742613614381\n    },\n    {\n      "id": "prj_D5IbGkTHhqzbSr9RC73Su228P841",\n      "name": "llm-seo",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1740376892596\n    },\n    {\n      "id": "prj_Cw6ZNXqAv71Ktg85dBB7Bublhvge",\n      "name": "agent-writer",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1745372104308\n    },\n    {\n      "id": "prj_vDnRs4MMyexc49xkEyc0JZuMz25Y",\n      "name": "x402index",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1746767776757\n    },\n    {\n      "id": "prj_U1zAXAPtSVgUeXrnb4GepUFyCZ0C",\n      "name": "agentbets",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1748058557348\n    },\n    {\n      "id": "prj_ltNbHqrNMHNLunk4icEIVQSIfHjp",\n      "name": "memora-apps-web",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1744647012539\n    },\n    {\n      "id": "prj_e1Xr4DR6pxpVzsVPXUtoEWvfHOlM",\n      "name": "ollamac-web",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1707974147841\n    },\n    {\n      "id": "prj_lT4syvAjhMGizyXHIESxo4aBqJCc",\n      "name": "short-studio",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1744230547186\n    },\n    {\n      "id": "prj_QB4mbqX5YALtmQB6vucLcFJ03l2M",\n      "name": "ytnl",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1753719681134\n    },\n    {\n      "id": "prj_Fwe7PyU5nBGzlLrstJSEJwPmOszl",\n      "name": "koro-web",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1713815943702\n    },\n    {\n      "id": "prj_qRX81pWYHfVhe65o8CCIHJOKMhpU",\n      "name": "koro-api",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1719347623009\n    },\n    {\n      "id": "prj_uK5EwbW6gFzmSf1sAtC59UaFNQ1V",\n      "name": "koroverse",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1700276425079\n    },\n    {\n      "id": "prj_nePzG26R3NMb3Shj7t4Skzbd3qnJ",\n      "name": "langchain-masterclass",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1683780123066\n    },\n    {\n      "id": "prj_lCSeaGyiQYX6F8wdfe38TmJPPJ6A",\n      "name": "embed-app",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1701309193557\n    },\n    {\n      "id": "prj_bWT0ebZ9fRBvQrhYAlnKoEMZVvAL",\n      "name": "pv3-apps-web",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1701480350681\n    },\n    {\n      "id": "prj_LSeofxt85XAY1TvBXMJtxB3GNWkp",\n      "name": "topgptsapp-web",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1699915701218\n    },\n    {\n      "id": "prj_CWAKcwpyF5URyMlLmspQ6Ial4ae6",\n      "name": "audio-transcribe-app",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1682524231732\n    },\n    {\n      "id": "prj_lzevNzqWL3L7a48fkjEF1GQIhI6R",\n      "name": "imaginemaps",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1758215189992\n    },\n    {\n      "id": "prj_GphlGKVgyPHcNghMVKuUuoqTEXHB",\n      "name": "themapunfolds.com",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1760051563495\n    },\n    {\n      "id": "prj_oxDbYfGRrVpiwrWWTY7a1TMc3Ono",\n      "name": "mars6-xyz",\n      "accountId": "team_kxkSo3HwmMoAIAK2b2Cuepsh",\n      "createdAt": 1760382045467\n    }\n  ]\n}',
                      },
                    ],
                  },
                ],
              },
              timestamp: "2026-01-08T05:42:15.170Z",
            },
          ],
        };

        const result = claudeParser.parse(thread);
        expect(result.messages).toHaveLength(1);
        const message = result.messages[0]! as AthrdAssistantMessage;
        expect(message).toBeDefined();
        expect(message.type).toBe("assistant");
        expect(message.toolCalls!.length).toBe(1);
        expect(message.toolCalls![0]?.name).toBe("mcp_tool_call");
        expect(message.toolCalls![0]?.result?.length).toBe(1);
      });
    });
  });
});
