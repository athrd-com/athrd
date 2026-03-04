import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdToolCall,
  AthrdUserMessage,
} from "@/types/athrd";

function canonicalizePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized || normalized === "/") {
    return normalized;
  }
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function parseLocalPathCandidate(href: string): { path: string; hash: string } | null {
  const trimmed = href.trim();
  if (!trimmed) {
    return null;
  }

  const windowsPathPattern = /^[A-Za-z]:[\\/]/;
  if (windowsPathPattern.test(trimmed)) {
    const [pathPart, hashPart] = trimmed.split("#", 2);
    return {
      path: decodeURIComponent(pathPart ?? ""),
      hash: hashPart ? `#${hashPart}` : "",
    };
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  if (hasScheme) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "file:") {
        return {
          path: decodeURIComponent(parsed.pathname),
          hash: parsed.hash,
        };
      }

      const isLocalhost =
        parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (
        isLocalhost &&
        (parsed.protocol === "http:" || parsed.protocol === "https:")
      ) {
        return {
          path: decodeURIComponent(parsed.pathname),
          hash: parsed.hash,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  const [withoutHash, hashPart] = trimmed.split("#", 2);
  const [pathPart] = (withoutHash ?? "").split("?", 2);

  return {
    path: decodeURIComponent(pathPart ?? ""),
    hash: hashPart ? `#${hashPart}` : "",
  };
}

function resolveKnownFilePath(
  candidatePath: string,
  knownFilePaths: Set<string>,
): string | null {
  const candidate = canonicalizePath(candidatePath);
  if (!candidate) {
    return null;
  }

  if (knownFilePaths.has(candidate)) {
    return candidate;
  }

  if (!candidate.startsWith("/") && knownFilePaths.has(`/${candidate}`)) {
    return `/${candidate}`;
  }

  if (candidate.startsWith("/") && knownFilePaths.has(candidate.slice(1))) {
    return candidate.slice(1);
  }

  if (candidate.startsWith("/")) {
    return null;
  }

  const suffix = `/${candidate}`;
  const matches = Array.from(knownFilePaths).filter((path) =>
    path.endsWith(suffix),
  );

  if (matches.length === 1 && matches[0]) {
    return matches[0];
  }

  return null;
}

function looksLikeFilePath(path: string): boolean {
  const normalized = canonicalizePath(path);
  if (!normalized || normalized.endsWith("/")) {
    return false;
  }

  const filename = normalized.split("/").pop();
  if (!filename) {
    return false;
  }

  // Simple heuristic: file name has a non-leading/non-trailing dot segment.
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < filename.length - 1;
}

function toRepoRelativePath(path: string, repoName: string): string | null {
  const repoBase = repoName.split("/").pop();
  if (!repoBase) {
    return null;
  }

  const normalized = canonicalizePath(path);
  if (!normalized) {
    return null;
  }

  const repoMarker = `/${repoBase}/`;
  const markerIndex = normalized.indexOf(repoMarker);
  if (markerIndex >= 0) {
    const repoRelativePath = normalized.slice(markerIndex + repoMarker.length);
    return repoRelativePath || null;
  }

  if (normalized.startsWith(`${repoBase}/`)) {
    return normalized.slice(repoBase.length + 1) || null;
  }

  if (!normalized.startsWith("/")) {
    return normalized;
  }

  return null;
}

function inferRepoRootFromKnownFilePaths(knownFilePaths: Set<string>): string | null {
  const absolutePaths = Array.from(knownFilePaths).filter((path) =>
    path.startsWith("/"),
  );
  if (absolutePaths.length === 0) {
    return null;
  }

  const segmentsByPath = absolutePaths.map((path) =>
    canonicalizePath(path).split("/").filter(Boolean),
  );
  if (segmentsByPath.length === 0) {
    return null;
  }

  const minLength = Math.min(...segmentsByPath.map((segments) => segments.length));
  const commonSegments: string[] = [];
  const firstSegments = segmentsByPath[0];
  if (!firstSegments) {
    return null;
  }

  for (let index = 0; index < minLength; index += 1) {
    const segment = firstSegments[index];
    if (!segment) {
      break;
    }
    if (segmentsByPath.every((segments) => segments[index] === segment)) {
      commonSegments.push(segment);
      continue;
    }
    break;
  }

  if (commonSegments.length === 0) {
    return null;
  }

  return `/${commonSegments.join("/")}`;
}

function toRepoRelativePathFromKnownRoot(
  path: string,
  knownFilePaths: Set<string>,
): string | null {
  const normalizedPath = canonicalizePath(path);
  if (!normalizedPath.startsWith("/")) {
    return null;
  }

  const root = inferRepoRootFromKnownFilePaths(knownFilePaths);
  if (!root || !normalizedPath.startsWith(`${root}/`)) {
    return null;
  }

  return normalizedPath.slice(root.length + 1) || null;
}

function toRepoRelativePathFromMonorepoMarkers(path: string): string | null {
  const normalizedPath = canonicalizePath(path);
  if (!normalizedPath.startsWith("/")) {
    return null;
  }

  const markers = [
    "/packages/",
    "/apps/",
    "/src/",
    "/lib/",
    "/tests/",
    "/test/",
    "/docs/",
  ];

  for (const marker of markers) {
    const markerIndex = normalizedPath.indexOf(marker);
    if (markerIndex >= 0) {
      return normalizedPath.slice(markerIndex + 1) || null;
    }
  }

  return null;
}

function inferRepoSlugFromPath(path: string): string | null {
  const normalizedPath = canonicalizePath(path);
  if (!normalizedPath.startsWith("/")) {
    return null;
  }

  const markers = ["/packages/", "/apps/", "/src/", "/lib/", "/tests/", "/test/", "/docs/"];
  for (const marker of markers) {
    const markerIndex = normalizedPath.indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }

    const prefix = normalizedPath.slice(0, markerIndex);
    const segments = prefix.split("/").filter(Boolean);
    const repoSlug = segments[segments.length - 1];
    if (repoSlug) {
      return repoSlug;
    }
  }

  return null;
}

function inferRepoSlugFromKnownPaths(knownFilePaths: Set<string>): string | null {
  const root = inferRepoRootFromKnownFilePaths(knownFilePaths);
  if (!root) {
    return null;
  }

  const segments = root.split("/").filter(Boolean);
  return segments[segments.length - 1] || null;
}

function parseRepoNameFromRepoUrl(repoUrl?: string): string | null {
  if (!repoUrl) {
    return null;
  }

  try {
    const parsed = new URL(repoUrl);
    if (parsed.hostname !== "github.com") {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    return `${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

function resolveEffectiveRepoName(
  repoName: string,
  repoUrl: string | undefined,
  path: string,
  knownFilePaths: Set<string>,
): string {
  const repoFromUrl = parseRepoNameFromRepoUrl(repoUrl);
  const baseRepoName = repoFromUrl || repoName;

  const segments = baseRepoName.split("/").filter(Boolean);
  if (segments.length === 0) {
    return baseRepoName;
  }

  const inferredRepoSlug =
    inferRepoSlugFromPath(path) || inferRepoSlugFromKnownPaths(knownFilePaths);
  if (!inferredRepoSlug) {
    return baseRepoName;
  }

  if (segments.length === 1) {
    return `${segments[0]}/${inferredRepoSlug}`;
  }

  const [org, repo] = segments;
  if (repo !== inferredRepoSlug) {
    return `${org}/${inferredRepoSlug}`;
  }

  return baseRepoName;
}

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getToolCallFilePath(toolCall: AthrdToolCall): string | null {
  if (
    toolCall.name === "read_file" ||
    toolCall.name === "write_file" ||
    toolCall.name === "replace"
  ) {
    const path = toolCall.args.file_path;
    return typeof path === "string" ? path : null;
  }

  return null;
}

export function extractKnownFilePaths(thread: AThrd): Set<string> {
  const knownFilePaths = new Set<string>();

  for (const message of thread.messages) {
    if (message.type === "assistant") {
      const assistantMessage = message as AthrdAssistantMessage;
      assistantMessage.toolCalls?.forEach((toolCall) => {
        const filePath = getToolCallFilePath(toolCall);
        if (!filePath) {
          return;
        }

        const canonical = canonicalizePath(filePath);
        if (canonical) {
          knownFilePaths.add(canonical);
        }
      });
    }

    if (message.type === "user") {
      const userMessage = message as AthrdUserMessage;
      userMessage.variables?.forEach((variable) => {
        if (variable.type !== "file") {
          return;
        }

        const canonical = canonicalizePath(variable.path);
        if (canonical) {
          knownFilePaths.add(canonical);
        }
      });
    }
  }

  return knownFilePaths;
}

export function rewriteFilePathHrefToGithub(params: {
  href?: string;
  repoName?: string;
  repoUrl?: string;
  knownFilePaths: Set<string>;
}): string | null {
  const { href, repoName, repoUrl, knownFilePaths } = params;

  if (!href || (!repoName && !repoUrl)) {
    return null;
  }

  const parsed = parseLocalPathCandidate(href);
  if (!parsed) {
    return null;
  }

  // Prefer explicit known paths extracted from the thread, but allow direct
  // absolute/relative file-path rewrites when the path clearly maps to repo.
  const resolvedPath =
    resolveKnownFilePath(parsed.path, knownFilePaths) || parsed.path;
  if (!looksLikeFilePath(resolvedPath)) {
    return null;
  }

  const fallbackRepoName = repoName || parseRepoNameFromRepoUrl(repoUrl);
  if (!fallbackRepoName) {
    return null;
  }

  const repoRelativePath = toRepoRelativePath(resolvedPath, fallbackRepoName);
  const effectiveRepoName = resolveEffectiveRepoName(
    fallbackRepoName,
    repoUrl,
    resolvedPath,
    knownFilePaths,
  );
  const effectiveRepoRelativePath = toRepoRelativePath(
    resolvedPath,
    effectiveRepoName,
  );
  const fallbackRepoRelativePath =
    effectiveRepoRelativePath ||
    repoRelativePath ||
    toRepoRelativePathFromKnownRoot(resolvedPath, knownFilePaths) ||
    toRepoRelativePathFromMonorepoMarkers(resolvedPath);
  if (!fallbackRepoRelativePath) {
    return null;
  }

  const encodedPath = encodePathSegments(fallbackRepoRelativePath);
  return `https://github.com/${effectiveRepoName}/blob/main/${encodedPath}${parsed.hash}`;
}
