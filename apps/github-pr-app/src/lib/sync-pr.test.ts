import { describe, expect, it, vi } from "vitest";
import { syncPullRequestAthrdLinks } from "./sync-pr";
import { withRetry } from "./retry";
import type { GitHubClient } from "./github-client";
import type { Logger } from "./logger";

describe("syncPullRequestAthrdLinks", () => {
  it("updates the PR body when athrd links are found", async () => {
    const updatePullRequestBody = vi.fn(async () => undefined);

    const client: GitHubClient = {
      listPullRequestCommits: vi.fn(async () => [
        { commit: { message: "feat: https://athrd.com/t/1" } },
        { commit: { message: "feat: https://athrd.com/t/2" } },
      ]),
      updatePullRequestBody,
    };

    const result = await syncPullRequestAthrdLinks(client, {
      owner: "athrd-com",
      repo: "athrd",
      pullNumber: 10,
    }, "hello");

    expect(result.changed).toBe(true);
    expect(result.links).toEqual(["https://athrd.com/t/1", "https://athrd.com/t/2"]);
    expect(updatePullRequestBody).toHaveBeenCalledTimes(1);
  });

  it("no-ops when generated body is unchanged", async () => {
    const currentBody = [
      "hello",
      "",
      "<!-- athrd-links:start -->",
      "## Athrd links",
      "- https://athrd.com/t/1",
      "<!-- athrd-links:end -->",
      "",
    ].join("\n");

    const updatePullRequestBody = vi.fn(async () => undefined);

    const client: GitHubClient = {
      listPullRequestCommits: vi.fn(async () => [{ commit: { message: "https://athrd.com/t/1" } }]),
      updatePullRequestBody,
    };

    const result = await syncPullRequestAthrdLinks(client, {
      owner: "athrd-com",
      repo: "athrd",
      pullNumber: 11,
    }, currentBody);

    expect(result.changed).toBe(false);
    expect(updatePullRequestBody).not.toHaveBeenCalled();
  });
});

describe("withRetry", () => {
  it("retries transient failures and eventually succeeds", async () => {
    const logger: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    let attempts = 0;
    const value = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("server error") as Error & { status: number };
          error.status = 502;
          throw error;
        }

        return "ok";
      },
      logger,
      { operation: "test" },
    );

    expect(value).toBe("ok");
    expect(attempts).toBe(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
