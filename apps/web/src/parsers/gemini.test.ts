import type { AthrdAssistantMessage } from "@/types/athrd";
import type { GeminiThread } from "@/types/gemini";
import { describe, expect, it } from "vitest";
import { geminiParser } from "./gemini";

// Helper to create a valid Gemini thread structure
const createBaseThread = (): GeminiThread => ({
  messages: [],
});

describe("geminiParser", () => {
  describe("canParse", () => {
    it("should identify a valid Gemini thread with messages", () => {
      const validThread: GeminiThread = {
        messages: [
          {
            id: "msg_1",
            type: "user",
            content: "Hello",
          },
        ],
      };

      expect(geminiParser.canParse(validThread)).toBe(true);
    });

    it("should identify a valid Gemini thread with gemini type message", () => {
      const validThread: GeminiThread = {
        messages: [
          {
            id: "msg_1",
            type: "gemini",
            content: "Hello",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
          },
        ],
      };

      expect(geminiParser.canParse(validThread)).toBe(true);
    });

    it("should identify thread with thoughts and toolCalls fields", () => {
      const validThread: GeminiThread = {
        messages: [
          {
            id: "msg_1",
            type: "gemini",
            content: "Processing...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            thoughts: [],
            toolCalls: [],
          },
        ],
      };

      expect(geminiParser.canParse(validThread)).toBe(true);
    });

    it("should reject invalid thread structures", () => {
      expect(geminiParser.canParse(null)).toBe(false);
      expect(geminiParser.canParse(undefined)).toBe(false);
      expect(geminiParser.canParse({})).toBe(false);
      expect(geminiParser.canParse({ messages: "not an array" })).toBe(false);
    });

    it("should accept empty messages array", () => {
      const emptyThread = createBaseThread();
      expect(geminiParser.canParse(emptyThread)).toBe(true);
    });

    it("should reject threads without messages", () => {
      const invalidThread = { data: [] };
      expect(geminiParser.canParse(invalidThread)).toBe(false);
    });
  });

  describe("parse - user messages", () => {
    it("should parse a simple user message", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "user_1",
          type: "user",
          content: "Hello, Gemini!",
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        id: "user_1",
        type: "user",
        content: "Hello, Gemini!",
      });
    });

    it("should generate ID for user message without one", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "",
          type: "user",
          content: "Test message",
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.id).toBeTruthy();
      expect(result.messages[0]?.content).toBe("Test message");
    });

    it("should parse multiple user messages", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "user_1",
          type: "user",
          content: "First message",
        },
        {
          id: "user_2",
          type: "user",
          content: "Second message",
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.content).toBe("First message");
      expect(result.messages[1]?.content).toBe("Second message");
    });
  });

  describe("parse - assistant messages", () => {
    it("should parse a simple assistant message", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "assistant_1",
          type: "gemini",
          content: "Hello! How can I help you?",
          timestamp: "2024-01-07T12:00:00Z",
          model: "gemini-2.0-flash-exp",
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        id: "assistant_1",
        type: "assistant",
        content: "Hello! How can I help you?",
        model: "gemini-2.0-flash-exp",
      });
    });

    it("should parse assistant message with thoughts", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "assistant_1",
          type: "gemini",
          content: "Here's my analysis",
          timestamp: "2024-01-07T12:00:00Z",
          model: "gemini-2.0-flash-exp",
          thoughts: [
            {
              subject: "Analysis",
              description: "Analyzing the request...",
              timestamp: "2024-01-07T12:00:00Z",
            },
            {
              subject: "Planning",
              description: "Creating a plan...",
              timestamp: "2024-01-07T12:00:01Z",
            },
          ],
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      const assistantMsg = result.messages[0];
      expect(assistantMsg?.type).toBe("assistant");
      if (assistantMsg?.type !== "assistant")
        throw new Error("Expected assistant message");
      expect(assistantMsg.thoughts).toHaveLength(2);
      expect(assistantMsg.thoughts?.[0]).toMatchObject({
        subject: "Analysis",
        description: "Analyzing the request...",
      });
      expect(assistantMsg.thoughts?.[1]).toMatchObject({
        subject: "Planning",
        description: "Creating a plan...",
      });
    });

    it("should handle assistant message without thoughts", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "assistant_1",
          type: "gemini",
          content: "Simple response",
          timestamp: "2024-01-07T12:00:00Z",
          model: "gemini-2.0-flash-exp",
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      const assistantMsg = result.messages[0];
      if (assistantMsg?.type !== "assistant")
        throw new Error("Expected assistant message");
      expect(assistantMsg.thoughts).toBeUndefined();
    });

    it("should handle assistant message with empty thoughts array", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "assistant_1",
          type: "gemini",
          content: "Response",
          timestamp: "2024-01-07T12:00:00Z",
          model: "gemini-2.0-flash-exp",
          thoughts: [],
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      const assistantMsg = result.messages[0];
      if (assistantMsg?.type !== "assistant")
        throw new Error("Expected assistant message");
      expect(assistantMsg.thoughts).toBeUndefined();
    });

    it("should generate ID for assistant message without one", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "",
          type: "gemini",
          content: "Test response",
          timestamp: "2024-01-07T12:00:00Z",
          model: "gemini-2.0-flash-exp",
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.id).toBeTruthy();
      expect(result.messages[0]?.content).toBe("Test response");
    });

    describe("tool calls", () => {
      it("should parse read_file tool call with result", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Reading file...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "read_file",
                status: "completed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Read File",
                description: "Reading file.ts",
                renderOutputAsMarkdown: false,
                args: {
                  file_path: "/path/to/file.ts",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "read_file",
                      response: {
                        output: "export const test = 'value';",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

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
          name: "read_file",
          output: {
            type: "text",
            text: "export const test = 'value';",
          },
        });
      });

      it("should parse write_file tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Writing file...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "write_file",
                status: "completed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Write File",
                description: "Writing to test.ts",
                renderOutputAsMarkdown: false,
                args: {
                  file_path: "/path/to/test.ts",
                  content: "console.log('test');",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "write_file",
                      response: {
                        output: "File written successfully",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

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
            file_path: "/path/to/test.ts",
            content: "console.log('test');",
          },
        });
      });

      it("should parse list_directory tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Listing directory...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "list_directory",
                status: "completed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "List Directory",
                description: "Listing /src",
                renderOutputAsMarkdown: false,
                args: {
                  dir_path: "/src",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "list_directory",
                      response: {
                        output: "file1.ts\nfile2.ts",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "ls",
          args: {
            dir_path: "/src",
          },
        });
      });

      it("should parse replace tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Replacing text...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "replace",
                status: "completed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Replace",
                description: "Replacing in file.ts",
                renderOutputAsMarkdown: false,
                args: {
                  file_path: "/path/to/file.ts",
                  old_string: "const old = 'value';",
                  new_string: "const new = 'value';",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "replace",
                      response: {
                        output: "Replacement successful",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

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
            old_string: "const old = 'value';",
            new_string: "const new = 'value';",
          },
        });
      });

      it("should parse write_todos tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Creating task list...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "write_todos",
                status: "completed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Write Todos",
                description: "Creating todos",
                renderOutputAsMarkdown: false,
                args: {
                  todos: [
                    { description: "Setup project", status: "completed" },
                    { description: "Write tests", status: "pending" },
                  ],
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "write_todos",
                      response: {
                        output: "Todos created",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

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
              { step: "Setup project", status: "completed" },
              { step: "Write tests", status: "pending" },
            ],
          },
        });
      });

      it("should parse run_shell_command tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Running command...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "run_shell_command",
                status: "completed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Run Command",
                description: "Running npm install",
                renderOutputAsMarkdown: false,
                args: {
                  command: "npm install",
                  description: "Installing dependencies",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "run_shell_command",
                      response: {
                        output: "Dependencies installed",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

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

      it("should parse web_fetch tool call as web_search", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Fetching web content...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "web_fetch",
                status: "success",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "WebFetch",
                description: "Processes content from URL(s)",
                renderOutputAsMarkdown: true,
                args: {
                  prompt:
                    "Summarize athrd from https://athrd.com/ for a video script.",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "web_fetch",
                      response: {
                        output: "Summary from athrd.com",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

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
            query:
              "Summarize athrd from https://athrd.com/ for a video script.",
          },
        });
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result?.[0]
        ).toMatchObject({
          name: "web_fetch",
          output: {
            type: "text",
            text: "Summary from athrd.com",
          },
        });
      });

      it("should parse unknown tool call", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Using custom tool...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "custom_tool",
                status: "completed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Custom Tool",
                description: "Running custom tool",
                renderOutputAsMarkdown: false,
                args: {
                  custom_param: "value",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "custom_tool",
                      response: {
                        output: "Tool executed",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]
        ).toMatchObject({
          name: "custom_tool",
          args: {
            custom_param: "value",
          },
        });
      });

      it("should handle tool call with error result", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Attempting file read...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "read_file",
                status: "failed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Read File",
                description: "Reading missing.ts",
                renderOutputAsMarkdown: false,
                args: {
                  file_path: "/path/to/missing.ts",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "read_file",
                      response: {
                        error: "File not found",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result?.[0]
        ).toMatchObject({
          name: "read_file",
          error: "File not found",
        });
      });

      it("should handle tool call without result", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Processing...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "read_file",
                status: "pending",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Read File",
                description: "Reading file.ts",
                renderOutputAsMarkdown: false,
                args: {
                  file_path: "/path/to/file.ts",
                },
                result: [],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          1
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.result
        ).toHaveLength(0);
      });

      it("should handle multiple tool calls", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Processing multiple operations...",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [
              {
                id: "call_1",
                name: "read_file",
                status: "completed",
                timestamp: "2024-01-07T12:00:00Z",
                displayName: "Read File",
                description: "Reading file1.ts",
                renderOutputAsMarkdown: false,
                args: {
                  file_path: "/file1.ts",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_1",
                      name: "read_file",
                      response: {
                        output: "content 1",
                      },
                    },
                  },
                ],
              },
              {
                id: "call_2",
                name: "read_file",
                status: "completed",
                timestamp: "2024-01-07T12:00:01Z",
                displayName: "Read File",
                description: "Reading file2.ts",
                renderOutputAsMarkdown: false,
                args: {
                  file_path: "/file2.ts",
                },
                result: [
                  {
                    functionResponse: {
                      id: "result_2",
                      name: "read_file",
                      response: {
                        output: "content 2",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ];

        const result = geminiParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        expect((assistantMsg as AthrdAssistantMessage).toolCalls).toHaveLength(
          2
        );
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[0]?.args
        ).toMatchObject({
          file_path: "/file1.ts",
        });
        expect(
          (assistantMsg as AthrdAssistantMessage).toolCalls?.[1]?.args
        ).toMatchObject({
          file_path: "/file2.ts",
        });
      });

      it("should handle empty toolCalls array", () => {
        const thread = createBaseThread();
        thread.messages = [
          {
            id: "assistant_1",
            type: "gemini",
            content: "Just text response",
            timestamp: "2024-01-07T12:00:00Z",
            model: "gemini-2.0-flash-exp",
            toolCalls: [],
          },
        ];

        const result = geminiParser.parse(thread);

        expect(result.messages).toHaveLength(1);
        const assistantMsg = result.messages[0];
        if (assistantMsg?.type !== "assistant")
          throw new Error("Expected assistant message");
        expect(assistantMsg.toolCalls).toBeUndefined();
      });
    });

    it("should handle mixed content: text, thoughts, and tool calls", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "assistant_1",
          type: "gemini",
          content: "Let me analyze and fix this.",
          timestamp: "2024-01-07T12:00:00Z",
          model: "gemini-2.0-flash-exp",
          thoughts: [
            {
              subject: "Analysis",
              description: "Analyzing the issue...",
              timestamp: "2024-01-07T12:00:00Z",
            },
          ],
          toolCalls: [
            {
              id: "call_1",
              name: "read_file",
              status: "completed",
              timestamp: "2024-01-07T12:00:00Z",
              displayName: "Read File",
              description: "Reading file.ts",
              renderOutputAsMarkdown: false,
              args: {
                file_path: "/file.ts",
              },
              result: [
                {
                  functionResponse: {
                    id: "result_1",
                    name: "read_file",
                    response: {
                      output: "file content",
                    },
                  },
                },
              ],
            },
          ],
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      const assistantMsg = result.messages[0];
      if (assistantMsg?.type !== "assistant")
        throw new Error("Expected assistant message");

      expect(assistantMsg.content).toBe("Let me analyze and fix this.");
      expect(assistantMsg.thoughts).toHaveLength(1);
      expect(assistantMsg.toolCalls).toHaveLength(1);
    });
  });

  describe("parse - conversation flow", () => {
    it("should parse a complete conversation", () => {
      const thread = createBaseThread();
      thread.messages = [
        {
          id: "user_1",
          type: "user",
          content: "Can you help me read a file?",
        },
        {
          id: "assistant_1",
          type: "gemini",
          content: "Sure, let me read that file for you.",
          timestamp: "2024-01-07T12:00:00Z",
          model: "gemini-2.0-flash-exp",
          toolCalls: [
            {
              id: "call_1",
              name: "read_file",
              status: "completed",
              timestamp: "2024-01-07T12:00:00Z",
              displayName: "Read File",
              description: "Reading file.ts",
              renderOutputAsMarkdown: false,
              args: {
                file_path: "/file.ts",
              },
              result: [
                {
                  functionResponse: {
                    id: "result_1",
                    name: "read_file",
                    response: {
                      output: "export const value = 42;",
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          id: "user_2",
          type: "user",
          content: "Thanks!",
        },
        {
          id: "assistant_2",
          type: "gemini",
          content: "You're welcome!",
          timestamp: "2024-01-07T12:00:01Z",
          model: "gemini-2.0-flash-exp",
        },
      ];

      const result = geminiParser.parse(thread);

      expect(result.messages).toHaveLength(4);
      expect(result.messages[0]?.type).toBe("user");
      expect(result.messages[1]?.type).toBe("assistant");
      expect(result.messages[2]?.type).toBe("user");
      expect(result.messages[3]?.type).toBe("assistant");
    });
  });
});
