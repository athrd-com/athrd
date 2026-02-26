import * as fs from "fs";
import * as path from "path";
import { getGitRepoRoot } from "./git.js";

interface AppendAthrdUrlMarkerParams {
  cwd?: string;
  url: string;
}

function ensureMarkerIgnored(gitRoot: string): void {
  const gitignorePath = path.join(gitRoot, ".gitignore");
  const markerEntry = ".athrd-ai-marker";

  let existingContent = "";
  if (fs.existsSync(gitignorePath)) {
    existingContent = fs.readFileSync(gitignorePath, "utf-8");
    const entries = existingContent
      .split(/\r?\n/)
      .map((line) => line.trim());

    if (entries.includes(markerEntry)) {
      return;
    }
  }

  const needsLeadingNewline =
    existingContent.length > 0 && !existingContent.endsWith("\n");
  const contentToAppend = `${needsLeadingNewline ? "\n" : ""}${markerEntry}\n`;
  fs.appendFileSync(gitignorePath, contentToAppend, "utf-8");
}

export function appendAthrdUrlMarker(params: AppendAthrdUrlMarkerParams): void {
  const gitRoot = getGitRepoRoot(params.cwd);
  if (!gitRoot) {
    return;
  }

  ensureMarkerIgnored(gitRoot);

  const markerPath = path.join(gitRoot, ".athrd-ai-marker");
  const normalizedUrl = params.url.trim();
  if (!normalizedUrl) {
    return;
  }

  let existingContent = "";
  if (fs.existsSync(markerPath)) {
    existingContent = fs.readFileSync(markerPath, "utf-8");
    const existingUrls = existingContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (existingUrls.includes(normalizedUrl)) {
      return;
    }
  }

  const needsLeadingNewline =
    existingContent.length > 0 && !existingContent.endsWith("\n");
  const contentToAppend = `${needsLeadingNewline ? "\n" : ""}${normalizedUrl}\n`;

  fs.appendFileSync(markerPath, contentToAppend, "utf-8");
}
