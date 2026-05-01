import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateIngestRequestMock,
  createSignedThreadUploadMock,
  parseMock,
  IngestHttpErrorMock,
} = vi.hoisted(() => {
  class IngestHttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "IngestHttpError";
    }
  }

  return {
    authenticateIngestRequestMock: vi.fn(),
    createSignedThreadUploadMock: vi.fn(),
    parseMock: vi.fn(),
    IngestHttpErrorMock: IngestHttpError,
  };
});

vi.mock("~/server/ingest", () => ({
  authenticateIngestRequest: authenticateIngestRequestMock,
  createSignedThreadUpload: createSignedThreadUploadMock,
  signedUploadRequestSchema: {
    parse: parseMock,
  },
  IngestHttpError: IngestHttpErrorMock,
}));

import { IngestHttpError } from "~/server/ingest";
import { POST } from "./route";

const actor = {
  githubUserId: "123",
  githubUsername: "octocat",
};

const signedUploadRequest = {
  metadata: {
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
    organization: {
      githubOrgId: "456",
    },
  },
  artifact: {
    fileName: "athrd-thread-1.jsonl",
    format: "jsonl",
  },
};

describe("/api/ingest/upload", () => {
  beforeEach(() => {
    authenticateIngestRequestMock.mockReset();
    createSignedThreadUploadMock.mockReset();
    parseMock.mockReset();

    authenticateIngestRequestMock.mockResolvedValue(actor);
    parseMock.mockReturnValue(signedUploadRequest);
  });

  it("creates signed S3 uploads for authenticated ingest requests", async () => {
    createSignedThreadUploadMock.mockResolvedValue({
      uploadUrl: "https://s3.example.com/upload",
      expiresAt: "2026-01-01T00:05:00.000Z",
      ttlSeconds: 300,
      storage: {
        provider: "s3",
        publicId: "s3-public",
        sourceId: "456/123/athrd-codex-thread-1.jsonl",
      },
    });

    const request = new Request("http://localhost/api/ingest/upload", {
      method: "POST",
      body: JSON.stringify(signedUploadRequest),
    });

    const response = await POST(request);

    await expect(response.json()).resolves.toEqual({
      uploadUrl: "https://s3.example.com/upload",
      expiresAt: "2026-01-01T00:05:00.000Z",
      ttlSeconds: 300,
      storage: {
        provider: "s3",
        publicId: "s3-public",
        sourceId: "456/123/athrd-codex-thread-1.jsonl",
      },
    });
    expect(response.status).toBe(200);
    expect(authenticateIngestRequestMock).toHaveBeenCalledWith(request);
    expect(parseMock).toHaveBeenCalledWith(signedUploadRequest);
    expect(createSignedThreadUploadMock).toHaveBeenCalledWith({
      ...signedUploadRequest,
      actor,
    });
  });

  it("returns ingest errors from signed upload creation", async () => {
    createSignedThreadUploadMock.mockRejectedValue(
      new IngestHttpError(409, "Organization is configured for client-side Gist uploads."),
    );

    const response = await POST(
      new Request("http://localhost/api/ingest/upload", {
        method: "POST",
        body: JSON.stringify(signedUploadRequest),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Organization is configured for client-side Gist uploads.",
    });
    expect(response.status).toBe(409);
  });
});
