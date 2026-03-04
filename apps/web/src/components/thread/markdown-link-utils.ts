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
      path: decodeURIComponent(pathPart),
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
  const [pathPart] = withoutHash.split("?", 2);

  return {
    path: decodeURIComponent(pathPart),
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

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
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
  knownFilePaths: Set<string>;
}): string | null {
  const { href, repoName, knownFilePaths } = params;

  if (!href || !repoName) {
    return null;
  }

  const parsed = parseLocalPathCandidate(href);
  if (!parsed) {
    return null;
  }

  const knownFilePath = resolveKnownFilePath(parsed.path, knownFilePaths);
  if (!knownFilePath) {
    return null;
  }

  const repoRelativePath = toRepoRelativePath(knownFilePath, repoName);
  if (!repoRelativePath) {
    return null;
  }

  const encodedPath = encodePathSegments(repoRelativePath);
  return `https://github.com/${repoName}/blob/main/${encodedPath}${parsed.hash}`;
}
