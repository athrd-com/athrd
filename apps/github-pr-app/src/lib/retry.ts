import type { Logger } from "./logger";

const MAX_ATTEMPTS = 3;

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) {
    return false;
  }

  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  logger: Logger,
  context: Record<string, unknown>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status?: number }).status)
          : undefined;

      if (!isRetryableStatus(status) || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      logger.warn("Retrying GitHub API call after transient error", {
        ...context,
        attempt,
        status,
      });
      await sleep(250 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
