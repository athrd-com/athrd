import { detectIDE, parseThread } from "@/parsers";
import type { AThrd } from "@/types/athrd";
import type { ClaudeThread as ClaudeThreadType } from "@/types/claude";
import type { CodexThread as CodexThreadType } from "@/types/codex";
import type { GeminiThread as GeminiThreadType } from "@/types/gemini";
import { IDE } from "@/types/ide";
import type { VSCodeThread as IVSCodeThread } from "@/types/vscode";
import type { GistData, GistFile } from "~/lib/github";
import {
  createThreadSourceRecordFromGist,
  readThreadSourceRecord,
  ThreadSourceLookupError,
  type ThreadSourceOwner,
  type ThreadSourceRecord,
} from "./thread-source";

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
  record: ThreadSourceRecord;
  rawContent: Record<string, unknown>;
  ide: IDE;
  parsedThread: AThrd;
  title: string;
  repoName?: string;
  commitHash?: string;
  modelsUsed: string[];
}

export async function loadThreadContext(
  threadId: string,
): Promise<ThreadContext> {
  let record: ThreadSourceRecord | null;

  try {
    record = await readThreadSourceRecord(threadId);
  } catch (error) {
    if (error instanceof ThreadSourceLookupError) {
      throw new ThreadLoadError("NOT_FOUND", error.message, error);
    }

    throw error;
  }

  if (!record) {
    throw new ThreadLoadError("NOT_FOUND", `Thread ${threadId} not found`);
  }

  return parseThreadContextFromSourceRecord(record);
}

export function parseThreadContextFromGistFile(
  gist: GistData,
  file: GistFile,
): ThreadContext {
  return parseThreadContextFromSourceRecord(
    createThreadSourceRecordFromGist(gist, file),
  );
}

export function parseThreadContextFromSourceRecord(
  record: ThreadSourceRecord,
): ThreadContext {
  let rawContent: Record<string, unknown>;

  try {
    rawContent = JSON.parse(record.content || "{}") as Record<string, unknown>;
  } catch (error) {
    throw new ThreadLoadError(
      "INVALID_JSON",
      `Invalid JSON in ${record.filename}`,
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
    const normalizedRecord = mergeRecordMetadata(record, rawContent, parsedThread);

    return {
      record: normalizedRecord,
      rawContent,
      ide,
      parsedThread,
      title: normalizedRecord.title || "Untitled Thread",
      repoName,
      commitHash,
      modelsUsed,
    };
  } catch (error) {
    throw new ThreadLoadError(
      "PARSE_FAILED",
      `Unable to parse thread from ${record.filename}`,
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

function mergeRecordMetadata(
  record: ThreadSourceRecord,
  rawContent: Record<string, unknown>,
  parsedThread: AThrd,
): ThreadSourceRecord {
  return {
    ...record,
    title:
      record.title ||
      firstNonEmptyString(
        getNestedString(rawContent, ["__athrd", "title"]),
        getNestedString(rawContent, ["metadata", "name"]),
        getString(rawContent, "title"),
        getString(rawContent, "customTitle"),
        getString(rawContent, "summary"),
        getFirstUserMessageContent(parsedThread),
      ),
    createdAt:
      record.createdAt ??
      firstDefinedValue(
        getString(rawContent, "timestamp"),
        getString(rawContent, "createdAt"),
        getString(rawContent, "created_at"),
        getNestedValue(rawContent, ["metadata", "createdAt"]),
        getString(rawContent, "startTime"),
      ),
    updatedAt:
      record.updatedAt ??
      firstDefinedValue(
        getString(rawContent, "updatedAt"),
        getString(rawContent, "updated_at"),
        getString(rawContent, "lastUpdated"),
        getNestedValue(rawContent, ["metadata", "lastUpdatedAt"]),
      ),
    owner: record.owner || extractOwnerFromRawContent(rawContent),
  };
}

function extractOwnerFromRawContent(
  rawContent: Record<string, unknown>,
): ThreadSourceOwner | undefined {
  const githubUsername =
    getNestedString(rawContent, ["__athrd", "githubUsername"]) ||
    getString(rawContent, "githubUsername");
  const ownerRecord = getRecord(rawContent, "owner");
  const ownerLogin = getString(ownerRecord, "login");
  const ownerDisplayName =
    getString(ownerRecord, "displayName") || getString(ownerRecord, "name");
  const ownerAvatarUrl = getString(ownerRecord, "avatarUrl");
  const ownerProfileUrl = getString(ownerRecord, "profileUrl");

  if (
    !githubUsername &&
    !ownerLogin &&
    !ownerDisplayName &&
    !ownerAvatarUrl &&
    !ownerProfileUrl
  ) {
    return undefined;
  }

  const login = githubUsername || ownerLogin;

  return {
    login: login || undefined,
    displayName: ownerDisplayName || login || undefined,
    avatarUrl: ownerAvatarUrl || undefined,
    profileUrl:
      ownerProfileUrl || (login ? `https://github.com/${login}` : undefined),
  };
}

function getFirstUserMessageContent(thread: AThrd): string | undefined {
  const firstUserMessage = thread.messages.find((message) => message.type === "user");
  if (!firstUserMessage || !firstUserMessage.content.trim()) {
    return undefined;
  }

  return firstUserMessage.content.trim().slice(0, 80);
}

function getRecord(
  input: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = input?.[key];
  return isRecord(value) ? value : undefined;
}

function getString(
  input: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNestedString(
  input: Record<string, unknown>,
  path: string[],
): string | undefined {
  const value = getNestedValue(input, path);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNestedValue(
  input: Record<string, unknown>,
  path: string[],
): string | number | undefined {
  let current: unknown = input;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === "string" || typeof current === "number"
    ? current
    : undefined;
}

function firstNonEmptyString(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim());
}

function firstDefinedValue(
  ...values: Array<string | number | undefined>
): string | number | undefined {
  return values.find((value) => value !== undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
