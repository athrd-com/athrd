import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadLoadError } from "@/lib/thread-loader";
import { GET, revalidate } from "./route";

vi.mock("@/lib/thread-loader", () => ({
  loadThreadContext: vi.fn(),
  ThreadLoadError: class ThreadLoadError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "ThreadLoadError";
    }
  },
}));

vi.mock("@/lib/llm-export", () => ({
  renderLlmTxt: vi.fn(() => "condensed"),
}));

describe("thread export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes 5-minute revalidate", () => {
    expect(revalidate).toBe(300);
  });

  it("returns llm.txt payload", async () => {
    const { loadThreadContext } = await import("@/lib/thread-loader");
    const loadThreadContextMock = loadThreadContext as unknown as {
      mockResolvedValueOnce: (value: unknown) => unknown;
    };
    loadThreadContextMock.mockResolvedValueOnce({
      parsedThread: { messages: [] },
      repoName: "athrd-com/athrd",
      modelsUsed: ["claude-3-5-sonnet-20241022"],
      ide: "claude",
      gist: { description: "Test title" },
    } as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toBe("condensed");
  });

  it("returns 404 for parse/not-found thread errors", async () => {
    const { loadThreadContext } = await import("@/lib/thread-loader");
    const loadThreadContextMock = loadThreadContext as unknown as {
      mockRejectedValueOnce: (value: unknown) => unknown;
    };
    loadThreadContextMock.mockRejectedValueOnce(
      new ThreadLoadError("NOT_FOUND", "missing"),
    );

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 500 for unexpected errors", async () => {
    const { loadThreadContext } = await import("@/lib/thread-loader");
    const loadThreadContextMock = loadThreadContext as unknown as {
      mockRejectedValueOnce: (value: unknown) => unknown;
    };
    loadThreadContextMock.mockRejectedValueOnce(new Error("boom"));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(response.status).toBe(500);
  });
});
