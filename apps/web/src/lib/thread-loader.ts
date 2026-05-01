import { detectIDE, parseThread } from "@/parsers";
import type { AThrd, AthrdUserMessage } from "@/types/athrd";
import type { ClaudeThread as ClaudeThreadType } from "@/types/claude";
import type { CodexThread as CodexThreadType } from "@/types/codex";
import type { GeminiThread as GeminiThreadType } from "@/types/gemini";
import { IDE } from "@/types/ide";
import type { PiThread as PiThreadType } from "@/types/pi";
import type { VSCodeThread as IVSCodeThread } from "@/types/vscode";
import type { GistData, GistFile } from "~/lib/github";
import {
  createThreadSourceRecordFromGist,
  readThreadSourceRecord,
  ThreadSourceLookupError,
  type ThreadSourceOwner,
  type ThreadSourceRecord,
} from "./thread-source";
import { isAgentInstructionsUserMessage } from "./codex-message-utils";

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
    rawContent = parseRawThreadContent(record);
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
    getNestedString(rawContent, ["__athrd", "repository", "fullName"]) ||
    (typeof athrdMeta?.githubRepo === "string"
      ? (athrdMeta.githubRepo as string)
      : undefined);
  const commitHash =
    getNestedString(rawContent, ["__athrd", "commit", "sha"]) ||
    (typeof athrdMeta?.commitHash === "string" && athrdMeta.commitHash.trim()
      ? athrdMeta.commitHash
      : undefined);
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
  const metaIde =
    getNestedString(rawContent, ["__athrd", "thread", "source"]) ||
    (typeof athrdMeta?.ide === "string" ? athrdMeta.ide : undefined);

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
        getNestedString(rawContent, ["__athrd", "thread", "title"]),
        getNestedString(rawContent, ["__athrd", "title"]),
        getNestedString(rawContent, ["metadata", "name"]),
        getString(rawContent, "title"),
        getString(rawContent, "summary"),
        getFirstUserMessageContent(parsedThread),
      ),
    createdAt:
      record.createdAt ??
      firstDefinedValue(
        getNestedValue(rawContent, ["__athrd", "thread", "startedAt"]),
        getString(rawContent, "timestamp"),
        getString(rawContent, "createdAt"),
        getString(rawContent, "created_at"),
        getNestedValue(rawContent, ["metadata", "createdAt"]),
        getString(rawContent, "startTime"),
      ),
    updatedAt:
      record.updatedAt ??
      firstDefinedValue(
        getNestedValue(rawContent, ["__athrd", "thread", "updatedAt"]),
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
    getNestedString(rawContent, ["__athrd", "actor", "githubUsername"]) ||
    getNestedString(rawContent, ["__athrd", "githubUsername"]) ||
    getString(rawContent, "githubUsername");
  const actorAvatarUrl = getNestedString(rawContent, [
    "__athrd",
    "actor",
    "avatarUrl",
  ]);
  const ownerRecord = getRecord(rawContent, "owner");
  const ownerLogin = getString(ownerRecord, "login");
  const ownerAvatarUrl = getString(ownerRecord, "avatarUrl");
  const ownerProfileUrl = getString(ownerRecord, "profileUrl");

  if (!githubUsername && !ownerLogin) {
    return undefined;
  }

  const login = githubUsername || ownerLogin;

  if (!login) {
    return undefined;
  }

  return {
    login,
    avatarUrl: actorAvatarUrl || ownerAvatarUrl || undefined,
    profileUrl: ownerProfileUrl || `https://github.com/${login}`,
  };
}

function parseRawThreadContent(
  record: ThreadSourceRecord,
): Record<string, unknown> {
  const content = record.content || "{}";

  if (record.filename.toLowerCase().endsWith(".jsonl")) {
    return parseJsonlThreadContent(content, record);
  }

  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${record.filename} must contain a JSON object`);
  }

  return parsed;
}

function parseJsonlThreadContent(
  content: string,
  record: ThreadSourceRecord,
): Record<string, unknown> {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
  const entries = rows.filter(isRecord);
  const metadataRow = findLastRecord(entries, (entry) =>
    entry.type === "athrd_metadata" && isRecord(entry.__athrd)
  );
  const athrdMeta = isRecord(metadataRow?.__athrd)
    ? metadataRow.__athrd
    : undefined;
  const bodyEntries = entries.filter((entry) => entry.type !== "athrd_metadata");
  const source = getNestedString({ __athrd: athrdMeta }, [
    "__athrd",
    "thread",
    "source",
  ]);

  if (source === IDE.CODEX || looksLikeCodexJsonl(bodyEntries)) {
    return normalizeCodexJsonl(bodyEntries, record, athrdMeta);
  }

  if (source === IDE.CLAUDE_CODE || looksLikeClaudeJsonl(bodyEntries)) {
    return normalizeClaudeJsonl(bodyEntries, record, athrdMeta);
  }

  if (source === IDE.PI || looksLikePiJsonl(bodyEntries)) {
    return normalizePiJsonl(bodyEntries, record, athrdMeta);
  }

  throw new Error(`Unsupported JSONL thread format in ${record.filename}`);
}

function normalizeCodexJsonl(
  entries: Record<string, unknown>[],
  record: ThreadSourceRecord,
  athrdMeta?: Record<string, unknown>,
): Record<string, unknown> {
  const sessionMeta = entries.find((entry) => entry.type === "session_meta");
  const sessionId = firstNonEmptyString(
    getNestedString({ __athrd: athrdMeta }, [
      "__athrd",
      "thread",
      "providerSessionId",
    ]),
    getNestedString({ __athrd: athrdMeta }, ["__athrd", "thread", "id"]),
    sessionMeta ? getNestedString(sessionMeta, ["payload", "id"]) : undefined,
    getString(sessionMeta, "id"),
    record.sourceId,
  );

  return {
    ...(sessionMeta || {}),
    sessionId,
    messages: entries,
    ...(athrdMeta ? { __athrd: athrdMeta } : {}),
  };
}

function normalizeClaudeJsonl(
  entries: Record<string, unknown>[],
  record: ThreadSourceRecord,
  athrdMeta?: Record<string, unknown>,
): Record<string, unknown> {
  const requests = entries
    .filter((entry) => entry.type === "user" || entry.type === "assistant")
    .map((entry) => ({
      id: getString(entry, "uuid") || getString(entry, "id"),
      type: entry.type,
      message: entry.message,
      timestamp: entry.timestamp,
    }));

  return {
    sessionId:
      firstNonEmptyString(
        getNestedString({ __athrd: athrdMeta }, [
          "__athrd",
          "thread",
          "providerSessionId",
        ]),
        getString(
          entries.find((entry) => typeof entry.sessionId === "string"),
          "sessionId",
        ),
        record.sourceId,
      ) || record.sourceId,
    requests,
    ...(athrdMeta ? { __athrd: athrdMeta } : {}),
  };
}

function normalizePiJsonl(
  entries: Record<string, unknown>[],
  record: ThreadSourceRecord,
  athrdMeta?: Record<string, unknown>,
): Record<string, unknown> {
  const sessionEntry = entries.find((entry) => entry.type === "session");
  const bodyEntries = entries.filter((entry) => entry.type !== "session");

  return {
    ...(sessionEntry || {}),
    type: "session",
    sessionId:
      firstNonEmptyString(
        getNestedString({ __athrd: athrdMeta }, [
          "__athrd",
          "thread",
          "providerSessionId",
        ]),
        getString(sessionEntry, "id"),
        record.sourceId,
      ) || record.sourceId,
    entries: bodyEntries,
    ...(athrdMeta ? { __athrd: athrdMeta } : {}),
  };
}

function looksLikeCodexJsonl(entries: Record<string, unknown>[]): boolean {
  return entries.some((entry) =>
    ["session_meta", "event_msg", "response_item", "turn_context"].includes(
      String(entry.type),
    ),
  );
}

function looksLikeClaudeJsonl(entries: Record<string, unknown>[]): boolean {
  return entries.some(
    (entry) =>
      (entry.type === "user" || entry.type === "assistant") &&
      isRecord(entry.message) &&
      typeof entry.message.role === "string",
  );
}

function looksLikePiJsonl(entries: Record<string, unknown>[]): boolean {
  return (
    entries.some((entry) => entry.type === "session") &&
    entries.some((entry) => entry.type === "message" && isRecord(entry.message))
  );
}

function findLastRecord(
  entries: Record<string, unknown>[],
  predicate: (entry: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && predicate(entry)) {
      return entry;
    }
  }

  return undefined;
}

function getFirstUserMessageContent(thread: AThrd): string | undefined {
  const firstUserMessage = thread.messages.find(
    (message): message is AthrdUserMessage =>
      message.type === "user" && !isAgentInstructionsUserMessage(message),
  );
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

    if (ide === IDE.PI) {
      const piContent = content as unknown as PiThreadType;
      const entries = piContent.entries ?? piContent.messages ?? [];
      entries.forEach((entry) => {
        if (entry.type === "model_change") {
          const modelId = (entry as { modelId?: unknown }).modelId;
          if (typeof modelId === "string" && modelId.trim()) {
            models.add(modelId);
          }
        }

        if (entry.type === "message") {
          const message = (entry as { message?: unknown }).message;
          if (!isRecord(message) || message.role !== "assistant") {
            return;
          }

          const model = message.model;
          if (typeof model === "string" && model.trim()) {
            models.add(model);
          }
        }
      });
    }

    // Cursor doesn't expose model info in the current type.
  } catch {
    // Ignore errors during model extraction.
  }

  return Array.from(models);
}
