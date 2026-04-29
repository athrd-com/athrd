import * as path from "path";
import { ChatSession } from "../types/index.js";
import type { AthrdMetadata } from "../utils/athrd-metadata.js";
import {
  parseJsonl,
  readJsonFile,
  readTextFile,
} from "../utils/bun-parsing.js";

export type ProviderActionStatus =
  | "installed"
  | "already_installed"
  | "uninstalled"
  | "skipped";

export interface ProviderActionResult {
  status: ProviderActionStatus;
  message?: string;
}

export interface ProviderInstallContext {
  homeDir: string;
  hookScriptPath: string;
  getProviderHookCommand(providerId: string): string;
  readJsonObject(filePath: string): Record<string, any>;
  writeJsonObject(filePath: string, value: Record<string, any>): void;
}

export interface ProviderListContext {}

export interface ProviderMetadataContext {
  cliVersion: string;
}

export type ProviderParseResult =
  | {
      kind: "raw";
      format: "json" | "jsonl";
      fileName: string;
      content: string;
    }
  | {
      kind: "skip";
      reason: string;
    };

export type ProviderThreadMetadata = AthrdMetadata["thread"];

export interface ChatProvider {
  readonly id: string;
  readonly name: string;

  install(context: ProviderInstallContext): Promise<ProviderActionResult>;
  uninstall(context: ProviderInstallContext): Promise<ProviderActionResult>;
  list(context?: ProviderListContext): Promise<ChatSession[]>;
  parse(session: ChatSession): Promise<ProviderParseResult>;
  getMetadata(
    session: ChatSession,
    context: ProviderMetadataContext,
  ): Promise<ProviderThreadMetadata>;
}

export function skippedAction(message: string): ProviderActionResult {
  return { status: "skipped", message };
}

export function unsupportedHooks(providerName: string): ProviderActionResult {
  return skippedAction(`${providerName} does not support automatic athrd hooks.`);
}

export function getDefaultProviderThreadMetadata(
  provider: Pick<ChatProvider, "id">,
  session: ChatSession,
): ProviderThreadMetadata {
  return {
    id: session.sessionId,
    providerSessionId: session.sessionId,
    source: provider.id,
    ...(session.title ? { title: session.title } : {}),
    ...(typeof session.requestCount === "number"
      ? { messageCount: session.requestCount }
      : {}),
    ...(isValidTimestamp(session.creationDate)
      ? { startedAt: new Date(session.creationDate).toISOString() }
      : {}),
    updatedAt: isValidTimestamp(session.lastMessageDate)
      ? new Date(session.lastMessageDate).toISOString()
      : new Date().toISOString(),
  };
}

export async function parseRawSessionFile(
  session: ChatSession,
): Promise<ProviderParseResult> {
  const extension = path.extname(session.filePath).toLowerCase();
  if (extension !== ".json" && extension !== ".jsonl") {
    return {
      kind: "skip",
      reason: `Unsupported raw session file extension: ${extension || "(none)"}`,
    };
  }

  if (!(await Bun.file(session.filePath).exists())) {
    return {
      kind: "skip",
      reason: "Unable to read raw session file: file does not exist",
    };
  }

  let content: string;
  try {
    if (extension === ".json") {
      await validateJsonFile(session.filePath);
    }

    content = await readTextFile(session.filePath);

    if (extension === ".jsonl") {
      validateJsonlContent(content);
    }
  } catch (error) {
    return {
      kind: "skip",
      reason: `Unable to parse raw session file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  return {
    kind: "raw",
    format: extension === ".json" ? "json" : "jsonl",
    fileName: `athrd-${sanitizeFileStem(session.sessionId)}${extension}`,
    content,
  };
}

async function validateJsonFile(filePath: string): Promise<void> {
  const parsed = await readJsonFile(filePath);
  if (!isRecord(parsed)) {
    throw new Error("Raw JSON session must be a JSON object.");
  }
}

function validateJsonlContent(content: string): void {
  if (!content.trim()) {
    throw new Error("Raw JSONL session is empty.");
  }

  parseJsonl(content);
}

function sanitizeFileStem(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_");
}

function isValidTimestamp(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
