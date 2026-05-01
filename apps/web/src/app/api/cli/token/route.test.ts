import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateGithubRequestMock,
  createCliAccessTokenMock,
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
    authenticateGithubRequestMock: vi.fn(),
    createCliAccessTokenMock: vi.fn(),
    IngestHttpErrorMock: IngestHttpError,
  };
});

vi.mock("~/server/ingest", () => ({
  authenticateGithubRequest: authenticateGithubRequestMock,
  createCliAccessToken: createCliAccessTokenMock,
  IngestHttpError: IngestHttpErrorMock,
}));

import { IngestHttpError } from "~/server/ingest";
import { POST } from "./route";

const actor = {
  githubUserId: "123",
  githubUsername: "octocat",
};

describe("/api/cli/token", () => {
  beforeEach(() => {
    authenticateGithubRequestMock.mockReset();
    createCliAccessTokenMock.mockReset();

    authenticateGithubRequestMock.mockResolvedValue(actor);
    createCliAccessTokenMock.mockReturnValue({
      token: "athrd_cli_v1.payload.signature",
      expiresAt: "2026-05-31T00:00:00.000Z",
      actor,
    });
  });

  it("exchanges a verified GitHub token for an athrd CLI token", async () => {
    const request = new Request("http://localhost/api/cli/token", {
      method: "POST",
      headers: {
        Authorization: "Bearer gho_test",
      },
    });

    const response = await POST(request);

    await expect(response.json()).resolves.toEqual({
      token: "athrd_cli_v1.payload.signature",
      expiresAt: "2026-05-31T00:00:00.000Z",
      actor,
    });
    expect(response.status).toBe(200);
    expect(authenticateGithubRequestMock).toHaveBeenCalledWith(request);
    expect(createCliAccessTokenMock).toHaveBeenCalledWith(actor);
  });

  it("returns GitHub authentication errors", async () => {
    authenticateGithubRequestMock.mockRejectedValue(
      new IngestHttpError(401, "Invalid GitHub bearer token."),
    );

    const response = await POST(
      new Request("http://localhost/api/cli/token", {
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Invalid GitHub bearer token.",
    });
    expect(response.status).toBe(401);
  });
});
