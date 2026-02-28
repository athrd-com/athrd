import type { Request, VSCodeThread } from "@/types/vscode";
import { describe, expect, it } from "vitest";
import { vscodeParser } from "./vscode";

const createBaseThread = (): VSCodeThread => ({
  version: 0,
  requesterUsername: "",
  requesterAvatarIconUri: { $mid: 1, scheme: "foo", path: "/bar" },
  responderUsername: "",
  responderAvatarIconUri: { id: "foo://bar" },
  initialLocation: "panel",
  requests: [],
  sessionId: "session_1",
  creationDate: 0,
  isImported: false,
  lastMessageDate: 0,
});

const createRequest = (overrides?: Partial<Request>): Request => ({
  requestId: "req_1",
  message: {
    parts: [],
    text: "Hello, Codex!",
  },
  variableData: {
    variables: [],
  },
  response: [],
  responseMarkdownInfo: [],
  followups: [],
  isCanceled: false,
  agent: {
    extensionId: {
      value: "github.copilot-chat",
      _lower: "github.copilot-chat",
    },
    extensionVersion: "0.0.0",
    publisherDisplayName: "GitHub",
    extensionPublisherId: "github",
    extensionDisplayName: "Copilot Chat",
    id: "copilot",
    description: "Copilot",
    metadata: {},
    name: "copilot",
    fullName: "GitHub Copilot",
    isDefault: true,
    locations: [],
    modes: [],
    slashCommands: [],
    disambiguation: [],
  },
  contentReferences: [],
  codeCitations: [],
  timestamp: 1704628800000,
  modelId: "gpt-4.1",
  ...overrides,
});

describe("vscodeParser", () => {
  describe("parse - user messages", () => {
    it("should parse a simple user message", () => {
      const thread = createBaseThread();
      thread.requests = [createRequest()];

      const result = vscodeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        type: "user",
        content: "Hello, Codex!",
      });
    });

    it("should parse user message with multiple content blocks", () => {
      const thread = createBaseThread();
      thread.requests = [
        createRequest({
          requestId: "req_2",
          message: {
            parts: [
              {
                range: { start: 0, endExclusive: 10 },
                editorRange: {
                  startLineNumber: 1,
                  startColumn: 1,
                  endLineNumber: 1,
                  endColumn: 11,
                },
                text: "First part",
                kind: "text",
              },
              {
                range: { start: 11, endExclusive: 22 },
                editorRange: {
                  startLineNumber: 2,
                  startColumn: 1,
                  endLineNumber: 2,
                  endColumn: 12,
                },
                text: "Second part",
                kind: "text",
              },
            ],
            text: "First part\nSecond part",
          },
        }),
      ];

      const result = vscodeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("First part\nSecond part");
    });

    it("should skip empty user messages", () => {
      const thread = createBaseThread();
      thread.requests = [
        createRequest({
          requestId: "req_empty",
          message: {
            parts: [],
            text: "   ",
          },
        }),
        createRequest({
          requestId: "req_valid",
          message: {
            parts: [],
            text: "Valid message",
          },
        }),
      ];

      const result = vscodeParser.parse(thread);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content).toBe("Valid message");
    });
  });
});
