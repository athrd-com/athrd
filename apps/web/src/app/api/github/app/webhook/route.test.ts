import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyGithubWebhookSignatureMock,
  updateOrganizationGithubAppInstallationMock,
  clearOrganizationGithubAppInstallationMock,
} = vi.hoisted(() => ({
  verifyGithubWebhookSignatureMock: vi.fn(),
  updateOrganizationGithubAppInstallationMock: vi.fn(),
  clearOrganizationGithubAppInstallationMock: vi.fn(),
}));

vi.mock("~/server/github-app", () => ({
  verifyGithubWebhookSignature: verifyGithubWebhookSignatureMock,
}));

vi.mock("~/server/organization-billing", () => ({
  updateOrganizationGithubAppInstallation: updateOrganizationGithubAppInstallationMock,
  clearOrganizationGithubAppInstallation: clearOrganizationGithubAppInstallationMock,
}));

import { POST } from "./route";

describe("/api/github/app/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyGithubWebhookSignatureMock.mockReturnValue(true);
  });

  it("rejects invalid signatures", async () => {
    verifyGithubWebhookSignatureMock.mockReturnValue(false);

    const response = await POST(githubWebhookRequest({ action: "created" }));

    expect(response.status).toBe(401);
  });

  it("stores organization installation ids on created events", async () => {
    const response = await POST(
      githubWebhookRequest({
        action: "created",
        installation: {
          id: 987,
          account: {
            id: 456,
            login: "athrd-com",
            type: "Organization",
            avatar_url: "https://example.com/avatar.png",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(updateOrganizationGithubAppInstallationMock).toHaveBeenCalledWith({
      githubOrgId: "456",
      login: "athrd-com",
      installationId: "987",
      avatarUrl: "https://example.com/avatar.png",
    });
  });

  it("clears organization installation ids on deleted events", async () => {
    const response = await POST(
      githubWebhookRequest({
        action: "deleted",
        installation: {
          id: 987,
          account: {
            id: 456,
            login: "athrd-com",
            type: "Organization",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(clearOrganizationGithubAppInstallationMock).toHaveBeenCalledWith({
      githubOrgId: "456",
      installationId: "987",
    });
  });
});

function githubWebhookRequest(body: unknown): Request {
  return new Request("http://localhost/api/github/app/webhook", {
    method: "POST",
    headers: {
      "x-github-event": "installation",
      "x-hub-signature-256": "sha256=test",
    },
    body: JSON.stringify(body),
  });
}
