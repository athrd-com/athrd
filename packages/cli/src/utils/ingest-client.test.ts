import { afterEach, describe, expect, test } from "bun:test";
import {
  canonicalizeAthrdBaseUrl,
  completeIngest,
  createIngestPlan,
} from "./ingest-client.js";
import type { AthrdMetadata } from "./athrd-metadata.js";

const originalFetch = globalThis.fetch;

const metadata: AthrdMetadata = {
  schemaVersion: 1,
  thread: {
    id: "thread-1",
    providerSessionId: "session-1",
    source: "codex",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  actor: {
    githubUserId: "123",
    githubUsername: "octocat",
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("canonicalizeAthrdBaseUrl", () => {
  test("uses the canonical production host", () => {
    expect(canonicalizeAthrdBaseUrl("https://athrd.com")).toBe(
      "https://www.athrd.com",
    );
    expect(canonicalizeAthrdBaseUrl("https://athrd.com/")).toBe(
      "https://www.athrd.com",
    );
  });

  test("leaves custom and local hosts unchanged", () => {
    expect(canonicalizeAthrdBaseUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
    expect(canonicalizeAthrdBaseUrl("https://api.example.com/base/")).toBe(
      "https://api.example.com/base",
    );
  });
});

describe("ingest client requests", () => {
  test("sends bearer auth to plan and complete", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ input, init });

      if (String(input).endsWith("/complete")) {
        return Response.json({
          publicId: "public-1",
          sourceId: "source-1",
          storageProvider: "gist",
          url: "https://www.athrd.com/threads/public-1",
        });
      }

      return Response.json({
        storageProvider: "gist",
        uploadMode: "client",
      });
    };

    await createIngestPlan({
      token: "gho_test_token",
      metadata,
    });
    await completeIngest({
      token: "gho_test_token",
      metadata,
      artifact: {
        fileName: "thread.json",
        format: "json",
      },
      storage: {
        provider: "gist",
        publicId: "public-1",
        sourceId: "source-1",
      },
    });

    expect(calls).toHaveLength(2);
    expect(String(calls[0].input)).toEndWith("/api/ingest/plan");
    expect(String(calls[1].input)).toEndWith("/api/ingest/complete");

    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      expect(call.init?.redirect).toBe("manual");
      expect(headers.get("authorization")).toBe("Bearer gho_test_token");
      expect(headers.get("content-type")).toBe("application/json");
    }
  });

  test("surfaces redirects instead of following them without auth", async () => {
    globalThis.fetch = async () =>
      new Response(null, {
        status: 307,
        headers: {
          location: "https://www.athrd.com/api/ingest/plan",
        },
      });

    await expect(
      createIngestPlan({
        token: "gho_test_token",
        metadata,
      }),
    ).rejects.toThrow("authorization header is not lost");
  });
});
