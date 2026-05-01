import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const ATHRD_DIR = path.join(os.homedir(), ".athrd");
const SESSIONS_FILE = path.join(ATHRD_DIR, "sessions.json");

export type ThreadStorageProvider = "gist" | "s3";

export interface StoredThreadUpload {
  provider: ThreadStorageProvider;
  publicId: string;
  sourceId: string;
  gistId?: string;
}

export type SessionsMap = Record<string, string | StoredThreadUpload>;

function isSessionsMap(value: unknown): value is SessionsMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v === "string") {
      continue;
    }

    if (!isStoredThreadUpload(v)) {
      return false;
    }
  }

  return true;
}

export async function loadSessionsMap(): Promise<SessionsMap> {
  try {
    const raw = await fs.readFile(SESSIONS_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);

    if (isSessionsMap(parsed)) {
      return parsed;
    }

    return {};
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {};
    }

    if (error instanceof SyntaxError) {
      return {};
    }

    throw new Error(`Failed to load sessions: ${error}`);
  }
}

async function writeSessionsMap(data: SessionsMap): Promise<void> {
  try {
    await fs.mkdir(ATHRD_DIR, { recursive: true });

    const tmp = `${SESSIONS_FILE}.tmp-${process.pid}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const content = JSON.stringify(data, null, 2);

    await fs.writeFile(tmp, content, { mode: 0o600 });
    await fs.rename(tmp, SESSIONS_FILE);
  } catch (error) {
    throw new Error(`Failed to save sessions: ${error}`);
  }
}

export async function getGistIdForThread(
  threadId: string,
): Promise<string | null> {
  const upload = await getStoredThreadUpload(threadId);
  if (!upload) {
    return null;
  }

  if (typeof upload === "string") {
    return upload;
  }

  return upload.provider === "gist" ? upload.gistId || upload.sourceId : null;
}

export async function getStoredThreadUpload(
  threadId: string,
): Promise<string | StoredThreadUpload | null> {
  const sessions = await loadSessionsMap();
  return sessions[threadId] || null;
}

export async function upsertThreadGistMapping(params: {
  threadId: string;
  gistId: string;
}): Promise<void> {
  await upsertThreadUploadMapping({
    threadId: params.threadId,
    upload: {
      provider: "gist",
      publicId: params.gistId,
      sourceId: params.gistId,
      gistId: params.gistId,
    },
  });
}

export async function upsertThreadUploadMapping(params: {
  threadId: string;
  upload: StoredThreadUpload;
}): Promise<void> {
  const sessions = await loadSessionsMap();
  sessions[params.threadId] = params.upload;
  await writeSessionsMap(sessions);
}

function isStoredThreadUpload(value: unknown): value is StoredThreadUpload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    (record.provider === "gist" || record.provider === "s3") &&
    typeof record.publicId === "string" &&
    typeof record.sourceId === "string" &&
    (record.gistId === undefined || typeof record.gistId === "string")
  );
}
