import type { AthrdAssistantMessage } from "@/types/athrd";
import type { ClaudeThread, MessageUsage } from "@/types/claude";
import { IDE } from "@/types/ide";
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
    });
  });

  describe("parse - complex scenarios", () => {
    it("should parse thread with multiple messages and tool calls", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "user",
              content: "Can you read the file?",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:00Z",
            type: "",
          },
          {
            id: "req_2",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "I'll read the file for you.",
                },
                {
                  type: "tool_use",
                  name: "Read",
                  id: "tool_1",
                  input: {
                    file_path: "/path/to/file.ts",
                  },
                },
              ],
              usage: {
                cache_creation: {
                  ephemeral_5m_input_tokens: 0,
                  ephemeral_1h_input_tokens: 0,
                },
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                output_tokens: 10,
                service_tier: "default",
                input_tokens: 5,
              },
              id: "msg_1",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:01Z",
            type: "",
          },
          {
            id: "req_3",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  content: "file contents",
                  is_error: false,
                  tool_use_id: "tool_1",
                },
              ],
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:02Z",
            type: "",
          },
          {
            id: "req_4",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Here's what I found in the file.",
                },
              ],
              usage: {
                cache_creation: {
                  ephemeral_5m_input_tokens: 0,
                  ephemeral_1h_input_tokens: 0,
                },
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                output_tokens: 10,
                service_tier: "default",
                input_tokens: 5,
              },
              id: "msg_2",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:03Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0]?.type).toBe("user");
      expect(result.messages[1]?.type).toBe("assistant");
      const msg1 = result.messages[1];
      if (msg1?.type !== "assistant")
        throw new Error("Expected assistant message");
      expect(msg1.toolCalls).toHaveLength(1);
      expect(result.messages[2]?.type).toBe("assistant");
    });

    describe("parse - edge cases", () => {});

    it("should filter out tool result messages from user messages", () => {
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
              usage: {
                cache_creation: {
                  ephemeral_5m_input_tokens: 0,
                  ephemeral_1h_input_tokens: 0,
                },
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                output_tokens: 10,
                service_tier: "default",
                input_tokens: 5,
              },
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
                  content: "file contents",
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

      // Tool result messages should not appear as separate user messages
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.type).toBe("assistant");
    });

    it("should have correct IDE identifier", () => {
      expect(claudeParser.id).toBe(IDE.CLAUDE_CODE);
    });
  });

  describe("parse - edge cases", () => {
    it("should handle empty thread", () => {
      const thread: ClaudeThread = {
        requests: [],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(0);
    });

    it("should preserve message order", () => {
      const thread: ClaudeThread = {
        requests: [
          {
            id: "req_1",
            message: {
              role: "user",
              content: "First",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:00Z",
            type: "",
          },
          {
            id: "req_2",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Second" }],
              usage: {
                cache_creation: {
                  ephemeral_5m_input_tokens: 0,
                  ephemeral_1h_input_tokens: 0,
                },
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                output_tokens: 10,
                service_tier: "default",
                input_tokens: 5,
              },
              id: "msg_1",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:01Z",
            type: "",
          },
          {
            id: "req_3",
            message: {
              role: "user",
              content: "Third",
              model: "claude-3-5-sonnet-20241022",
            },
            timestamp: "2024-01-07T12:00:02Z",
            type: "",
          },
        ],
      };

      const result = claudeParser.parse(thread);

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0]?.content).toBe("First");
      expect(result.messages[1]?.content).toBe("Second");
      expect(result.messages[2]?.content).toBe("Third");
    });

    it("should have correct IDE identifier", () => {
      expect(claudeParser.id).toBe(IDE.CLAUDE_CODE);
    });
  });
});
