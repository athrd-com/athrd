import { authClient } from "~/server/better-auth/client";

const THREADS_CALLBACK_URL = "/threads";

interface AuthRedirectResult {
  data: {
    url?: string;
  } | null;
  error: {
    message?: string;
  } | null;
}

function getRedirectUrl(
  result: AuthRedirectResult,
  fallbackMessage: string,
): string {
  if (result.error) {
    throw new Error(result.error.message ?? fallbackMessage);
  }

  const redirectUrl = result.data?.url;

  if (!redirectUrl) {
    throw new Error(fallbackMessage);
  }

  return redirectUrl;
}

async function startGithubFlow(
  request: Promise<AuthRedirectResult>,
  fallbackMessage: string,
) {
  const result = await request;

  // Navigate explicitly instead of relying on the auth client's redirect hook.
  window.location.assign(getRedirectUrl(result, fallbackMessage));
}

export function startGithubSignIn() {
  return startGithubFlow(
    authClient.signIn.social({
      provider: "github",
      callbackURL: THREADS_CALLBACK_URL,
      disableRedirect: true,
    }),
    "Unable to start GitHub sign-in.",
  );
}

export function refreshGithubOrganizations() {
  return startGithubFlow(
    authClient.linkSocial({
      provider: "github",
      callbackURL: THREADS_CALLBACK_URL,
      disableRedirect: true,
    }),
    "Unable to refresh GitHub organizations.",
  );
}
