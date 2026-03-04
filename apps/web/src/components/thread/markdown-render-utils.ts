import type { ComponentProps } from "react";
import { cloneElement, isValidElement } from "react";

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
