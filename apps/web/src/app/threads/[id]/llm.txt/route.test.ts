import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertCanReadThreadMock, ThreadAccessErrorMock } = vi.hoisted(() => {
  class ThreadAccessError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status = 403) {
      super(message);
      this.code = code;
      this.status = status;
      this.name = "ThreadAccessError";
    }
  }

  return {
    assertCanReadThreadMock: vi.fn(),
    ThreadAccessErrorMock: ThreadAccessError,
  };
});

import { ThreadLoadError } from "@/lib/thread-loader";
import { GET, dynamic } from "./route";

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

vi.mock("~/server/thread-access", () => ({
  assertCanReadThread: assertCanReadThreadMock,
  ThreadAccessError: ThreadAccessErrorMock,
}));

describe("thread export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCanReadThreadMock.mockResolvedValue(undefined);
  });

  it("forces dynamic rendering", () => {
    expect(dynamic).toBe("force-dynamic");
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
      title: "Test title",
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

  it("returns 403 for access-denied thread errors", async () => {
    assertCanReadThreadMock.mockRejectedValueOnce(
      new ThreadAccessErrorMock("FORBIDDEN", "nope", 403),
    );

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "private" }),
    });

    expect(response.status).toBe(403);
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
