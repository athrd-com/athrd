import { describe, expect, test } from "bun:test";
import {
  obfuscateSessionContent,
  obfuscateText,
  SECRET_MASK,
} from "./secret-obfuscation.js";

describe("secret obfuscation", () => {
  test("masks secret-like JSON fields and preserves non-secret metadata", () => {
    const content = JSON.stringify({
      __athrd: {
        thread: {
          id: "session-1",
          source: "codex",
        },
        commit: {
          sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        },
      },
      env: {
        OPENAI_API_KEY: "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz",
        GITHUB_TOKEN: "not-a-known-token-format",
        INPUT_TOKENS: 42,
      },
      messages: [
        {
          role: "user",
          content:
            "run with DATABASE_URL=postgres://user:pass@localhost/app and Authorization: Bearer github_pat_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        },
      ],
    });

    const result = obfuscateSessionContent(content, "json");
    const parsed = JSON.parse(result.content);

    expect(parsed.__athrd.thread.id).toBe("session-1");
    expect(parsed.__athrd.commit.sha).toBe(
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    );
    expect(parsed.env.OPENAI_API_KEY).toBe(SECRET_MASK);
    expect(parsed.env.GITHUB_TOKEN).toBe(SECRET_MASK);
    expect(parsed.env.INPUT_TOKENS).toBe(42);
    expect(parsed.messages[0].content).toContain(`DATABASE_URL=${SECRET_MASK}`);
    expect(parsed.messages[0].content).toContain(
      `Authorization: Bearer ${SECRET_MASK}`,
    );
    expect(parsed.messages[0].content).not.toContain("postgres://user:pass");
    expect(parsed.messages[0].content).not.toContain("github_pat_");
    expect(result.redactionCount).toBeGreaterThanOrEqual(4);
  });

  test("masks JSONL rows without changing row count", () => {
    const content = [
      JSON.stringify({
        type: "athrd_metadata",
        __athrd: {
          thread: {
            id: "session-1",
          },
        },
      }),
      JSON.stringify({
        type: "message",
        usage: {
          total_tokens: 100,
        },
        message: {
          content: [
            {
              type: "input_text",
              text: "export ANTHROPIC_API_KEY='sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz'",
            },
          ],
        },
      }),
    ].join("\n");

    const result = obfuscateSessionContent(content, "jsonl");
    const rows = result.content.trim().split("\n").map((line) => JSON.parse(line));

    expect(rows).toHaveLength(2);
    expect(rows[0].__athrd.thread.id).toBe("session-1");
    expect(rows[1].usage.total_tokens).toBe(100);
    expect(rows[1].message.content[0].text).toBe(
      `export ANTHROPIC_API_KEY='${SECRET_MASK}'`,
    );
  });

  test("masks common secrets in plain text fallback content", () => {
    const stripeSecret = ["sk", "live", "1234567890abcdefghijklmnop"].join("_");
    const text = [
      `STRIPE_SECRET_KEY=${stripeSecret}`,
      "npm token npm_1234567890abcdefghijklmnopqrstuvwxyz",
      "private key:",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "abc123",
      "-----END OPENSSH PRIVATE KEY-----",
    ].join("\n");

    const result = obfuscateText(text);

    expect(result.content).toContain(`STRIPE_SECRET_KEY=${SECRET_MASK}`);
    expect(result.content).toContain(`npm token ${SECRET_MASK}`);
    expect(result.content).toContain(`private key:\n${SECRET_MASK}`);
    expect(result.content).not.toContain("sk_live_");
    expect(result.content).not.toContain("npm_");
    expect(result.content).not.toContain("abc123");
  });
});
