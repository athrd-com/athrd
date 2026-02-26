const START_MARKER = "<!-- athrd-links:start -->";
const END_MARKER = "<!-- athrd-links:end -->";
const LINK_REGEX = /https:\/\/athrd\.com\/[^\s)>\]]+/g;
const TRAILING_PUNCTUATION = /[.,);\]]+$/;

function normalizeUrl(url: string): string {
  return url.replace(TRAILING_PUNCTUATION, "");
}

export function extractAthrdLinks(commitMessages: string[]): string[] {
  const links = new Set<string>();

  for (const message of commitMessages) {
    for (const match of message.matchAll(LINK_REGEX)) {
      links.add(normalizeUrl(match[0]));
    }
  }

  return Array.from(links);
}

export function renderAthrdLinksSection(urls: string[]): string {
  const rows = urls.map((url) => `- ${url}`).join("\n");
  return `${START_MARKER}\n## Athrd links\n${rows}\n${END_MARKER}`;
}

function sectionRegex(): RegExp {
  return new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, "m");
}

function appendSection(body: string, section: string): string {
  if (body.trim().length === 0) {
    return `${section}\n`;
  }

  return `${body.trimEnd()}\n\n${section}\n`;
}

export function upsertAthrdLinksSection(body: string | null, urls: string[]): string {
  const currentBody = body ?? "";
  const pattern = sectionRegex();

  if (urls.length === 0) {
    if (!pattern.test(currentBody)) {
      return currentBody;
    }

    return currentBody.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  }

  const nextSection = renderAthrdLinksSection(urls);
  if (pattern.test(currentBody)) {
    const replaced = currentBody.replace(pattern, `${nextSection}\n`);
    return replaced.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  }

  return appendSection(currentBody, nextSection);
}

export const athrdMarkers = {
  start: START_MARKER,
  end: END_MARKER,
};
