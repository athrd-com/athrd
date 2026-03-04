import { describe, expect, it } from "vitest";
import { createElement, isValidElement } from "react";
import {
  maybeShortenFilePathLinkChildren,
  mergeRel,
} from "./markdown-render-utils";

describe("markdown-render-utils", () => {
  it("merges rel values without duplicates", () => {
    expect(mergeRel("nofollow", ["noreferrer", "nofollow"])).toBe(
      "nofollow noreferrer",
    );
  });

  it("returns undefined when no rel values exist", () => {
    expect(mergeRel(undefined, [])).toBeUndefined();
  });

  it("shortens plain string children", () => {
    expect(
      maybeShortenFilePathLinkChildren(
        "/Users/test/repo/packages/cli/src/commands/share.ts:277",
        "share.ts:277",
      ),
    ).toBe("share.ts:277");
  });

  it("shortens single string item arrays", () => {
    expect(
      maybeShortenFilePathLinkChildren(
        ["/Users/test/repo/packages/cli/src/commands/share.ts:277"],
        "share.ts:277",
      ),
    ).toEqual(["share.ts:277"]);
  });

  it("shortens code element children", () => {
    const codeNode = createElement(
      "code",
      undefined,
      "/Users/test/repo/packages/cli/src/commands/share.ts:277",
    );
    const result = maybeShortenFilePathLinkChildren(codeNode, "share.ts:277");

    expect(isValidElement(result)).toBe(true);
    if (isValidElement<{ children?: unknown }>(result)) {
      expect(result.type).toBe("code");
      expect(result.props.children).toBe("share.ts:277");
    }
  });

  it("returns original children when short label is null", () => {
    const children = ["unchanged"];
    expect(maybeShortenFilePathLinkChildren(children, null)).toBe(children);
  });
});
