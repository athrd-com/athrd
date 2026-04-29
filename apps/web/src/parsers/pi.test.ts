import type { AthrdAssistantMessage } from "@/types/athrd";
import type { PiThread } from "@/types/pi";
import { describe, expect, it } from "vitest";
import { piParser } from "./pi";

const createBaseThread = (): PiThread => ({
  sessionId: "019db56d-2567-7431-8f17-7946e4efd8eb",
  type: "session",
  version: 3,
  id: "019db56d-2567-7431-8f17-7946e4efd8eb",
  timestamp: "2026-04-22T13:42:02.343Z",
  cwd: "/Users/example/project",
  entries: [],
});

describe("piParser", () => {
  describe("canParse", () => {
    it("identifies Pi session exports", () => {
      const thread = createBaseThread();
      expect(piParser.canParse(thread)).toBe(true);
    });

    it("identifies raw Pi JSONL session headers without sessionId", () => {
      expect(
        piParser.canParse({
          type: "session",
          version: 3,
          id: "019dd768-665c-7732-9503-55e7b465009c",
          timestamp: "2026-04-29T04:03:56.636Z",
          cwd: "/Users/gregorymarcilhacy/code/athrd",
          entries: [],
        }),
      ).toBe(true);
    });

    it("rejects unrelated structures", () => {
      expect(piParser.canParse(null)).toBe(false);
      expect(piParser.canParse({})).toBe(false);
      expect(piParser.canParse({ type: "session", messages: "nope" })).toBe(false);
    });
  });

  it("parses user and assistant text messages from Pi entries", () => {
    const thread = createBaseThread();
    thread.entries = [
      {
        type: "model_change",
        id: "model001",
        parentId: null,
        timestamp: "2026-04-22T13:42:35.958Z",
        provider: "openai-codex",
        modelId: "gpt-5.4",
      },
      {
        type: "message",
        id: "user0001",
        parentId: "model001",
        timestamp: "2026-04-22T13:42:50.829Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "HEllo world!" }],
          timestamp: 1776865370826,
        },
      },
      {
        type: "message",
        id: "asst0001",
        parentId: "user0001",
        timestamp: "2026-04-22T13:42:51.939Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello world!" }],
          provider: "openai-codex",
          model: "gpt-5.4",
          timestamp: 1776865370833,
        },
      },
    ];

    const result = piParser.parse(thread);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      id: "user0001",
      type: "user",
      content: "HEllo world!",
    });
    expect(result.messages[1]).toMatchObject({
      id: "asst0001",
      type: "assistant",
      content: "Hello world!",
      model: "gpt-5.4",
    });
  });

  it("maps the observed Pi JSONL session fields", () => {
    const toolCallId =
      "call_Q6UCYwz4TyQc69jFhHkoFxny|fc_00f8285a1f5191860169f1834310988193a39e6de2ae043aa6";
    const thread: PiThread = {
      type: "session",
      version: 3,
      id: "019dd768-665c-7732-9503-55e7b465009c",
      timestamp: "2026-04-29T04:03:56.636Z",
      cwd: "/Users/gregorymarcilhacy/code/athrd",
      entries: [
        {
          type: "model_change",
          id: "65e73f9f",
          parentId: null,
          timestamp: "2026-04-29T04:04:02.875Z",
          provider: "openai-codex",
          modelId: "gpt-5.4",
        },
        {
          type: "thinking_level_change",
          id: "1713a56e",
          parentId: "65e73f9f",
          timestamp: "2026-04-29T04:04:02.876Z",
          thinkingLevel: "medium",
        },
        {
          type: "message",
          id: "98cc6cd0",
          parentId: "1713a56e",
          timestamp: "2026-04-29T04:04:06.786Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            timestamp: 1777435446783,
          },
        },
        {
          type: "message",
          id: "08c7da16",
          parentId: "98cc6cd0",
          timestamp: "2026-04-29T04:04:08.214Z",
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Hello! How can I help?",
                textSignature:
                  '{"v":1,"id":"msg_00f8285a1f5191860169f18337e6008193a9a1d01a1cbe7dda","phase":"final_answer"}',
              },
            ],
            api: "openai-codex-responses",
            provider: "openai-codex",
            model: "gpt-5.4",
            usage: {
              input: 1531,
              output: 11,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 1542,
              cost: {
                input: 0.0038275,
                output: 0.000165,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0.0039925,
              },
            },
            stopReason: "stop",
            timestamp: 1777435446794,
            responseId: "resp_00f8285a1f5191860169f183373fcc81939f264eb23932aa1d",
          },
        },
        {
          type: "message",
          id: "a160bf57",
          parentId: "08c7da16",
          timestamp: "2026-04-29T04:04:15.584Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "How many folders are in there?" }],
            timestamp: 1777435455583,
          },
        },
        {
          type: "message",
          id: "da0a1c46",
          parentId: "a160bf57",
          timestamp: "2026-04-29T04:04:19.268Z",
          message: {
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "**Figuring out current directory**",
                thinkingSignature:
                  '{"id":"rs_00f8285a1f5191860169f1834134f88193a03c4ab86793dc49","type":"reasoning"}',
              },
              {
                type: "toolCall",
                id: toolCallId,
                name: "bash",
                arguments: {
                  command: "find . -maxdepth 1 -mindepth 1 -type d | wc -l",
                },
              },
            ],
            api: "openai-codex-responses",
            provider: "openai-codex",
            model: "gpt-5.4",
            usage: {
              input: 531,
              output: 64,
              cacheRead: 1024,
              cacheWrite: 0,
              totalTokens: 1619,
              cost: {
                input: 0.0013275000000000001,
                output: 0.00096,
                cacheRead: 0.000256,
                cacheWrite: 0,
                total: 0.0025435,
              },
            },
            stopReason: "toolUse",
            timestamp: 1777435455585,
            responseId: "resp_00f8285a1f5191860169f1833fd2408193a0cd284fc315d487",
          },
        },
        {
          type: "message",
          id: "34ce9aae",
          parentId: "da0a1c46",
          timestamp: "2026-04-29T04:04:19.294Z",
          message: {
            role: "toolResult",
            toolCallId,
            toolName: "bash",
            content: [{ type: "text", text: "      10\n" }],
            isError: false,
            timestamp: 1777435459294,
          },
        },
        {
          type: "message",
          id: "16b43ef2",
          parentId: "34ce9aae",
          timestamp: "2026-04-29T04:04:20.607Z",
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "There are 10 folders in `/Users/gregorymarcilhacy/code/athrd`.",
                textSignature:
                  '{"v":1,"id":"msg_00f8285a1f5191860169f183441cf481938fa27c46e57991ef","phase":"final_answer"}',
              },
            ],
            api: "openai-codex-responses",
            provider: "openai-codex",
            model: "gpt-5.4",
            usage: {
              input: 610,
              output: 24,
              cacheRead: 1024,
              cacheWrite: 0,
              totalTokens: 1658,
              cost: {
                input: 0.001525,
                output: 0.00036,
                cacheRead: 0.000256,
                cacheWrite: 0,
                total: 0.002141,
              },
            },
            stopReason: "stop",
            timestamp: 1777435459295,
            responseId: "resp_00f8285a1f5191860169f183438ac88193a713502335a8a99e",
          },
        },
      ],
    };

    const result = piParser.parse(thread);
    const toolCallMessage = result.messages[3] as AthrdAssistantMessage;

    expect(result.messages).toHaveLength(5);
    expect(result.messages[0]).toMatchObject({
      id: "98cc6cd0",
      type: "user",
      content: "Hello",
    });
    expect(result.messages[1]).toMatchObject({
      id: "08c7da16",
      type: "assistant",
      content: "Hello! How can I help?",
      model: "gpt-5.4",
    });
    expect(toolCallMessage.toolCalls?.[0]).toMatchObject({
      id: toolCallId,
      name: "terminal_command",
      args: {
        command: "find . -maxdepth 1 -mindepth 1 -type d | wc -l",
      },
      result: [
        {
          name: "bash",
          output: { type: "text", text: "      10\n" },
        },
      ],
    });
    expect(result.messages[4]).toMatchObject({
      id: "16b43ef2",
      type: "assistant",
      content: "There are 10 folders in `/Users/gregorymarcilhacy/code/athrd`.",
      model: "gpt-5.4",
    });
  });

  it("attaches tool results to assistant tool calls", () => {
    const thread = createBaseThread();
    thread.entries = [
      {
        type: "message",
        id: "user0001",
        parentId: null,
        timestamp: "2026-04-22T13:42:50.829Z",
        message: {
          role: "user",
          content: "List files",
        },
      },
      {
        type: "message",
        id: "asst0001",
        parentId: "user0001",
        timestamp: "2026-04-22T13:42:51.939Z",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Need to inspect the directory." },
            {
              type: "toolCall",
              id: "call_123",
              name: "bash",
              arguments: { command: "ls" },
            },
          ],
          model: "gpt-5.4",
        },
      },
      {
        type: "message",
        id: "tool0001",
        parentId: "asst0001",
        timestamp: "2026-04-22T13:42:52.000Z",
        message: {
          role: "toolResult",
          toolCallId: "call_123",
          toolName: "bash",
          content: [{ type: "text", text: "README.md" }],
          isError: false,
        },
      },
    ];

    const result = piParser.parse(thread);
    const assistant = result.messages[1] as AthrdAssistantMessage;

    expect(assistant.thoughts?.[0]).toMatchObject({
      subject: "Thinking",
      description: "Need to inspect the directory.",
    });
    expect(assistant.toolCalls?.[0]).toMatchObject({
      id: "call_123",
      name: "terminal_command",
      args: {
        command: "ls",
      },
      result: [
        {
          name: "bash",
          output: { type: "text", text: "README.md" },
        },
      ],
    });
  });

  it("parses the basic Pi session shape from an athrd workspace tool-call session", () => {
    const toolCallId =
      "call_rXJ84iiJ2nNaJf1bkHDKpODq|fc_054902127f4391cf0169e8e16b66688197bc072334b9ecb9b7";
    const thread: PiThread = {
      sessionId: "019db5b0-5765-740b-9c85-535e5009fd9b",
      type: "session",
      version: 3,
      id: "019db5b0-5765-740b-9c85-535e5009fd9b",
      timestamp: "2026-04-22T14:55:26.053Z",
      cwd: "/Users/gregorymarcilhacy/code/athrd",
      entries: [
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
            api: "openai-codex-responses",
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
            api: "openai-codex-responses",
            provider: "openai-codex",
            model: "gpt-5.4",
            stopReason: "stop",
            timestamp: 1776869739618,
          },
        },
      ],
    };

    const result = piParser.parse(thread);
    const toolCallMessage = result.messages[1] as AthrdAssistantMessage;

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toMatchObject({
      id: "3ed89b7c",
      type: "user",
      content: "list the folders in ~/.pi/",
    });
    expect(toolCallMessage.thoughts?.[0]).toMatchObject({
      subject: "Thinking",
      description:
        "**Following command compliance**\n\nI need to run the folder listing with bash.",
    });
    expect(toolCallMessage.toolCalls?.[0]).toMatchObject({
      id: toolCallId,
      name: "terminal_command",
      args: {
        command: "find ~/.pi -maxdepth 1 -mindepth 1 -type d -print | sort",
      },
      result: [
        {
          name: "bash",
          output: {
            type: "text",
            text: "/Users/gregorymarcilhacy/.pi/agent\n",
          },
        },
      ],
    });
    expect(result.messages[2]).toMatchObject({
      id: "814bd521",
      type: "assistant",
      content: "Folders in `~/.pi`:\n\n- `/Users/gregorymarcilhacy/.pi/agent`",
      model: "gpt-5.4",
    });
  });

  it("parses only the current Pi branch path", () => {
    const thread = createBaseThread();
    thread.entries = [
      {
        type: "message",
        id: "user0001",
        parentId: null,
        timestamp: "2026-04-22T13:42:50.829Z",
        message: { role: "user", content: "Root" },
      },
      {
        type: "message",
        id: "asst0001",
        parentId: "user0001",
        timestamp: "2026-04-22T13:42:51.939Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "First answer" }],
        },
      },
      {
        type: "message",
        id: "olduser1",
        parentId: "asst0001",
        timestamp: "2026-04-22T13:43:00.000Z",
        message: { role: "user", content: "Old branch" },
      },
      {
        type: "message",
        id: "oldasst1",
        parentId: "olduser1",
        timestamp: "2026-04-22T13:43:01.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Old branch answer" }],
        },
      },
      {
        type: "message",
        id: "newuser1",
        parentId: "asst0001",
        timestamp: "2026-04-22T13:44:00.000Z",
        message: { role: "user", content: "Current branch" },
      },
      {
        type: "message",
        id: "newasst1",
        parentId: "newuser1",
        timestamp: "2026-04-22T13:44:01.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Current branch answer" }],
        },
      },
    ];

    const result = piParser.parse(thread);

    expect(result.messages.map((message) => message.id)).toEqual([
      "user0001",
      "asst0001",
      "newuser1",
      "newasst1",
    ]);
  });
});
