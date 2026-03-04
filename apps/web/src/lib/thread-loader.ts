import { detectIDE, parseThread } from "@/parsers";
import type { AThrd } from "@/types/athrd";
import type { ClaudeThread as ClaudeThreadType } from "@/types/claude";
import type { CodexThread as CodexThreadType } from "@/types/codex";
import type { GeminiThread as GeminiThreadType } from "@/types/gemini";
import { IDE } from "@/types/ide";
import type { VSCodeThread as IVSCodeThread } from "@/types/vscode";
import { fetchGist, type GistData, type GistFile } from "~/lib/github";

export type ThreadLoadErrorCode =
  | "NOT_FOUND"
  | "INVALID_JSON"
  | "UNSUPPORTED_THREAD"
  | "PARSE_FAILED";

export class ThreadLoadError extends Error {
  code: ThreadLoadErrorCode;

  constructor(code: ThreadLoadErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.name = "ThreadLoadError";
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export interface ThreadContext {
  gist: GistData;
  file: GistFile;
  rawContent: Record<string, unknown>;
  ide: IDE;
  parsedThread: AThrd;
  repoName?: string;
  commitHash?: string;
  modelsUsed: string[];
}

export async function loadThreadContext(
  gistId: string,
): Promise<ThreadContext> {
  const { gist, file } = await fetchGist(gistId);
  if (!gist || !file) {
    throw new ThreadLoadError("NOT_FOUND", `Thread ${gistId} not found`);
  }
  return parseThreadContextFromGistFile(gist, file);
}

export function parseThreadContextFromGistFile(
  gist: GistData,
  file: GistFile,
): ThreadContext {
  let rawContent: Record<string, unknown>;

  try {
    rawContent = JSON.parse(file.content || "{}") as Record<string, unknown>;
  } catch (error) {
    throw new ThreadLoadError(
      "INVALID_JSON",
      `Invalid JSON in ${file.filename}`,
      error,
    );
  }

  const ide = resolveIde(rawContent);
  const athrdMeta = rawContent.__athrd as Record<string, unknown> | undefined;
  const repoName =
    typeof athrdMeta?.githubRepo === "string"
      ? (athrdMeta.githubRepo as string)
      : undefined;
  const commitHash =
    typeof athrdMeta?.commitHash === "string" && athrdMeta.commitHash.trim()
      ? athrdMeta.commitHash
      : undefined;
  const modelsUsed = extractModelsUsed(rawContent, ide);

  try {
    const parsedThread = parseThread(rawContent, ide);
    return {
      gist,
      file,
      rawContent,
      ide,
      parsedThread,
      repoName,
      commitHash,
      modelsUsed,
    };
  } catch (error) {
    throw new ThreadLoadError(
      "PARSE_FAILED",
      `Unable to parse thread from ${file.filename}`,
      error,
    );
  }
}

function resolveIde(rawContent: Record<string, unknown>): IDE {
  const athrdMeta = rawContent.__athrd as Record<string, unknown> | undefined;
  const metaIde = athrdMeta?.ide;

  if (typeof metaIde === "string" && isIDE(metaIde)) {
    return metaIde;
  }

  const detectedIde = detectIDE(rawContent);
  if (detectedIde) {
    return detectedIde;
  }

  throw new ThreadLoadError(
    "UNSUPPORTED_THREAD",
    "Unable to detect thread format",
  );
}

function isIDE(value: string): value is IDE {
  return (Object.values(IDE) as string[]).includes(value);
}

/**
 * Extract models used from raw content before parsing.
 */
function extractModelsUsed(
  content: Record<string, unknown>,
  ide: IDE,
): string[] {
  const models = new Set<string>();

  try {
    if (ide === IDE.VSCODE) {
      const vscodeContent = content as unknown as IVSCodeThread;
      vscodeContent.requests?.forEach((req) => {
        if (req.modelId) models.add(req.modelId);
      });
    }

    if (ide === IDE.CLAUDE_CODE) {
      const claudeContent = content as unknown as ClaudeThreadType;
      claudeContent.requests?.forEach((req) => {
        if (req.message?.model) models.add(req.message.model);
      });
    }

    if (ide === IDE.GEMINI) {
      const geminiContent = content as unknown as GeminiThreadType;
      geminiContent.messages?.forEach((msg) => {
        if ("model" in msg && msg.model) models.add(msg.model);
      });
    }

    if (ide === IDE.CODEX) {
      const codexContent = content as unknown as CodexThreadType;
      codexContent.messages?.forEach((msg) => {
        if (msg.type === "turn_context" && msg.payload?.model) {
          models.add(
            [msg.payload.model, msg.payload.effort].filter(Boolean).join("-"),
          );
        }
      });
    }

    // Cursor doesn't expose model info in the current type.
  } catch {
    // Ignore errors during model extraction.
  }

  return Array.from(models);
}
