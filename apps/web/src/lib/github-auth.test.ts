import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { locationAssignMock, signInSocialMock, linkSocialMock } = vi.hoisted(
  () => ({
    locationAssignMock: vi.fn(),
    signInSocialMock: vi.fn(),
    linkSocialMock: vi.fn(),
  }),
);

vi.mock("~/server/better-auth/client", () => ({
  authClient: {
    signIn: {
      social: signInSocialMock,
    },
    linkSocial: linkSocialMock,
  },
}));

import {
  refreshGithubOrganizations,
  startGithubSignIn,
} from "./github-auth";

describe("lib/github-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      location: {
        assign: locationAssignMock,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts GitHub sign-in with an explicit redirect", async () => {
    signInSocialMock.mockResolvedValue({
      data: {
        url: "https://github.com/login/oauth/authorize",
      },
      error: null,
    });

    await startGithubSignIn();

    expect(signInSocialMock).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/threads",
      disableRedirect: true,
    });
    expect(locationAssignMock).toHaveBeenCalledWith(
      "https://github.com/login/oauth/authorize",
    );
  });

  it("relinks GitHub before refreshing organizations", async () => {
    linkSocialMock.mockResolvedValue({
      data: {
        url: "https://github.com/settings/connections/applications/example",
      },
      error: null,
    });

    await refreshGithubOrganizations();

    expect(linkSocialMock).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/threads",
      disableRedirect: true,
    });
    expect(locationAssignMock).toHaveBeenCalledWith(
      "https://github.com/settings/connections/applications/example",
    );
  });

  it("throws when the auth flow does not return a redirect URL", async () => {
    linkSocialMock.mockResolvedValue({
      data: {
        url: undefined,
      },
      error: null,
    });

    await expect(refreshGithubOrganizations()).rejects.toThrow(
      "Unable to refresh GitHub organizations.",
    );
    expect(locationAssignMock).not.toHaveBeenCalled();
  });
});
