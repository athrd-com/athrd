import type { AThrd } from "@/types/athrd";
import { describe, expect, it } from "vitest";
import { extractKnownFilePaths, rewriteFilePathHrefToGithub } from "./markdown-link-utils";

function createThread(): AThrd {
  return {
    messages: [
      {
        id: "u1",
        type: "user",
        content: "check this",
        variables: [
          {
            type: "file",
            path: "/Users/gregorymarcilhacy/code/athrd/apps/web/src/app/globals.css",
          },
        ],
      },
      {
        id: "a1",
        type: "assistant",
        timestamp: "2026-03-04T00:00:00.000Z",
        content: "done",
        toolCalls: [
          {
            id: "t1",
            timestamp: "2026-03-04T00:00:00.000Z",
            name: "read_file",
            args: {
              file_path:
                "/Users/gregorymarcilhacy/code/athrd/packages/cli/src/utils/marker.test.ts",
            },
            result: [],
          },
        ],
      },
    ],
  };
}

describe("markdown-link-utils", () => {
  it("extracts known file paths from tool calls and user variables", () => {
    const paths = extractKnownFilePaths(createThread());

    expect(paths.has("/Users/gregorymarcilhacy/code/athrd/packages/cli/src/utils/marker.test.ts")).toBe(true);
    expect(paths.has("/Users/gregorymarcilhacy/code/athrd/apps/web/src/app/globals.css")).toBe(true);
  });

  it("rewrites localhost links to github file urls", () => {
    const knownFilePaths = extractKnownFilePaths(createThread());

    const rewritten = rewriteFilePathHrefToGithub({
      href: "http://localhost:3000/Users/gregorymarcilhacy/code/athrd/packages/cli/src/utils/marker.test.ts",
      repoName: "athrd-com/athrd",
      knownFilePaths,
    });

    expect(rewritten).toBe(
      "https://github.com/athrd-com/athrd/blob/main/packages/cli/src/utils/marker.test.ts",
    );
  });

  it("rewrites relative file paths when they match a known file", () => {
    const knownFilePaths = extractKnownFilePaths(createThread());

    const rewritten = rewriteFilePathHrefToGithub({
      href: "packages/cli/src/utils/marker.test.ts#L12",
      repoName: "athrd-com/athrd",
      knownFilePaths,
    });

    expect(rewritten).toBe(
      "https://github.com/athrd-com/athrd/blob/main/packages/cli/src/utils/marker.test.ts#L12",
    );
  });

  it("does not rewrite links that are not known files", () => {
    const knownFilePaths = extractKnownFilePaths(createThread());

    const rewritten = rewriteFilePathHrefToGithub({
      href: "/Users/gregorymarcilhacy/code/athrd/packages/cli/src/utils",
      repoName: "athrd-com/athrd",
      knownFilePaths,
    });

    expect(rewritten).toBeNull();
  });

  it("does not rewrite external urls", () => {
    const knownFilePaths = extractKnownFilePaths(createThread());

    const rewritten = rewriteFilePathHrefToGithub({
      href: "https://example.com/docs",
      repoName: "athrd-com/athrd",
      knownFilePaths,
    });

    expect(rewritten).toBeNull();
  });

  it("rewrites absolute local file paths even when they are not in known paths", () => {
    const rewritten = rewriteFilePathHrefToGithub({
      href: "/Users/gregorymarcilhacy/code/athrd/packages/cli/src/utils/marker.ts",
      repoName: "athrd-com/athrd",
      knownFilePaths: new Set<string>(),
    });

    expect(rewritten).toBe(
      "https://github.com/athrd-com/athrd/blob/main/packages/cli/src/utils/marker.ts",
    );
  });
});
