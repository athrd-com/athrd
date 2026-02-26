import { describe, expect, it } from "vitest";
import { extractAthrdLinks, renderAthrdLinksSection, upsertAthrdLinksSection } from "./athrd-links";

describe("extractAthrdLinks", () => {
  it("extracts links from single and multiline commit messages", () => {
    const links = extractAthrdLinks([
      "feat: share thread https://athrd.com/t/abc123",
      "docs: include\nhttps://athrd.com/t/xyz789 in body",
    ]);

    expect(links).toEqual(["https://athrd.com/t/abc123", "https://athrd.com/t/xyz789"]);
  });

  it("ignores non-athrd links and deduplicates matches", () => {
    const links = extractAthrdLinks([
      "https://example.com/nope https://athrd.com/t/abc123",
      "again https://athrd.com/t/abc123",
    ]);

    expect(links).toEqual(["https://athrd.com/t/abc123"]);
  });

  it("trims trailing punctuation", () => {
    const links = extractAthrdLinks(["feat: https://athrd.com/t/abc123)."]);

    expect(links).toEqual(["https://athrd.com/t/abc123"]);
  });
});

describe("upsertAthrdLinksSection", () => {
  it("inserts a block when body has none", () => {
    const next = upsertAthrdLinksSection("PR body", ["https://athrd.com/t/abc123"]);

    expect(next).toContain(renderAthrdLinksSection(["https://athrd.com/t/abc123"]));
  });

  it("replaces existing block content", () => {
    const initial = [
      "Some text",
      "<!-- athrd-links:start -->",
      "## Athrd links",
      "- https://athrd.com/t/old",
      "<!-- athrd-links:end -->",
      "tail",
    ].join("\n");

    const next = upsertAthrdLinksSection(initial, ["https://athrd.com/t/new"]);

    expect(next).toContain("- https://athrd.com/t/new");
    expect(next).not.toContain("- https://athrd.com/t/old");
    expect(next).toContain("tail");
  });

  it("removes existing block when no links are present", () => {
    const initial = [
      "Body",
      "",
      "<!-- athrd-links:start -->",
      "## Athrd links",
      "- https://athrd.com/t/old",
      "<!-- athrd-links:end -->",
      "",
      "Footer",
    ].join("\n");

    const next = upsertAthrdLinksSection(initial, []);

    expect(next).not.toContain("athrd-links:start");
    expect(next).toContain("Body");
    expect(next).toContain("Footer");
  });
});
