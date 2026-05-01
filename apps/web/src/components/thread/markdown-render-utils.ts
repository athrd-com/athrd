import type { ComponentProps } from "react";
import { cloneElement, isValidElement } from "react";

const IGNORED_MARKDOWN_TAGS = ["oai-mem-citation"] as const;
const IGNORED_MARKDOWN_TAG_PATTERN = IGNORED_MARKDOWN_TAGS.join("|");
const IGNORED_MARKDOWN_TAG_BLOCK_PATTERN = new RegExp(
  `(^|\\n)[ \\t]*<(${IGNORED_MARKDOWN_TAG_PATTERN})\\b[^>]*>[\\s\\S]*?<\\/\\2>[ \\t]*(?:\\n|$)`,
  "gi",
);
const IGNORED_MARKDOWN_TAG_INLINE_PATTERN = new RegExp(
  `<(${IGNORED_MARKDOWN_TAG_PATTERN})\\b[^>]*>[\\s\\S]*?<\\/\\1>`,
  "gi",
);
const IGNORED_MARKDOWN_TAG_TRAILING_PATTERN = new RegExp(
  `(^|\\n)[ \\t]*<(${IGNORED_MARKDOWN_TAG_PATTERN})\\b[^>]*>[\\s\\S]*$`,
  "i",
);
const IGNORED_MARKDOWN_TAG_INLINE_TRAILING_PATTERN = new RegExp(
  `<(${IGNORED_MARKDOWN_TAG_PATTERN})\\b[^>]*>[\\s\\S]*$`,
  "i",
);

export function mergeRel(
  rel: string | undefined,
  requiredValues: string[],
): string | undefined {
  const currentValues = new Set((rel || "").split(/\s+/).filter(Boolean));
  requiredValues.forEach((value) => currentValues.add(value));
  if (currentValues.size === 0) {
    return undefined;
  }
  return Array.from(currentValues).join(" ");
}

export function maybeShortenFilePathLinkChildren(
  children: ComponentProps<"a">["children"],
  shortLabel: string | null,
) {
  if (!shortLabel) {
    return children;
  }

  if (isValidElement(children) && children.type === "code") {
    return cloneElement(children, undefined, shortLabel);
  }

  if (Array.isArray(children) && children.length === 1) {
    const [onlyChild] = children;
    if (isValidElement(onlyChild) && onlyChild.type === "code") {
      return [cloneElement(onlyChild, undefined, shortLabel)];
    }

    if (typeof onlyChild === "string") {
      return [shortLabel];
    }
  }

  if (typeof children === "string") {
    return shortLabel;
  }

  return children;
}

export function stripIgnoredMarkdownTags(content: string): string {
  return content
    .replace(
      IGNORED_MARKDOWN_TAG_BLOCK_PATTERN,
      (_match, leadingNewline: string) => leadingNewline,
    )
    .replace(IGNORED_MARKDOWN_TAG_INLINE_PATTERN, "")
    .replace(IGNORED_MARKDOWN_TAG_TRAILING_PATTERN, "")
    .replace(IGNORED_MARKDOWN_TAG_INLINE_TRAILING_PATTERN, "");
}
