import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    BETTER_AUTH_SECRET: "state-secret",
    GITHUB_APP_WEBHOOK_SECRET: "webhook-secret",
    GITHUB_APP_SLUG: "athrd",
    NODE_ENV: "test",
  },
}));

vi.mock("~/env", () => ({
  env: envMock,
}));

describe("github-app", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    envMock.BETTER_AUTH_SECRET = "state-secret";
    envMock.GITHUB_APP_WEBHOOK_SECRET = "webhook-secret";
    envMock.GITHUB_APP_SLUG = "athrd";
    envMock.NODE_ENV = "test";
  });

  it("verifies GitHub webhook signatures", async () => {
    const { verifyGithubWebhookSignature } = await import("./github-app");
    const body = JSON.stringify({ action: "created" });
    const signature = `sha256=${createHmac("sha256", "webhook-secret")
      .update(body)
      .digest("hex")}`;

    expect(verifyGithubWebhookSignature(body, signature)).toBe(true);
    expect(verifyGithubWebhookSignature(body, "sha256=bad")).toBe(false);
  });

  it("round trips signed setup state", async () => {
    const { createGithubAppSetupState, parseGithubAppSetupState } = await import(
      "./github-app"
    );
    const now = new Date("2026-05-01T12:00:00.000Z");
    const state = createGithubAppSetupState("456", now);

    expect(parseGithubAppSetupState(state, now)).toEqual({
      githubOrgId: "456",
    });
    expect(parseGithubAppSetupState(`${state}.tampered`, now)).toBeNull();
    expect(
      parseGithubAppSetupState(state, new Date("2026-05-01T13:01:00.000Z")),
    ).toBeNull();
  });

  it("builds GitHub App install URLs with signed state", async () => {
    const { getGithubAppInstallUrl } = await import("./github-app");

    expect(getGithubAppInstallUrl("signed-state")).toBe(
      "https://github.com/apps/athrd/installations/new?state=signed-state",
    );
  });

  it("counts organization members with paginated GitHub responses", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index }));
    const secondPage = Array.from({ length: 2 }, (_, index) => ({ id: index }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => firstPage,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => secondPage,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { countOrganizationMembersWithToken } = await import("./github-app");

    await expect(
      countOrganizationMembersWithToken({
        accessToken: "gho_test",
        orgLogin: "athrd-com",
      }),
    ).resolves.toBe(102);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("page=1");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("page=2");
  });
});
