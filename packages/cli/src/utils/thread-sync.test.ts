import { afterEach, describe, expect, test } from "bun:test";
import { syncThreadIndex } from "./thread-sync.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  setFetch(originalFetch);
});

describe("syncThreadIndex", () => {
  test("posts source identity with the bearer token", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    setFetch(async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          ok: true,
          publicId: "gist-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    await expect(
      syncThreadIndex({
        source: "gist",
        sourceId: "gist-1",
        token: "github-token",
        baseUrl: "https://athrd.example",
      }),
    ).resolves.toEqual({
      ok: true,
      publicId: "gist-1",
    });

    expect(String(calls[0]?.input)).toBe("https://athrd.example/api/threads/sync");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toEqual({
      Authorization: "Bearer github-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      source: "gist",
      sourceId: "gist-1",
    });
  });

  test("throws on sync failures", async () => {
    setFetch(async () => new Response("forbidden", { status: 403 }));

    await expect(
      syncThreadIndex({
        source: "gist",
        sourceId: "gist-1",
        token: "github-token",
        baseUrl: "https://athrd.example",
      }),
    ).rejects.toThrow("Metadata sync failed (403): forbidden");
  });
});

function setFetch(
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): void {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl as typeof fetch;
}
