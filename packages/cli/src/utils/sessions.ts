import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const ATHRD_DIR = path.join(os.homedir(), ".athrd");
const SESSIONS_FILE = path.join(ATHRD_DIR, "sessions.json");

export type SessionsMap = Record<string, string>;

function isSessionsMap(value: unknown): value is SessionsMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v !== "string") {
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
  const sessions = await loadSessionsMap();
  return sessions[threadId] || null;
}

export async function upsertThreadGistMapping(params: {
  threadId: string;
  gistId: string;
}): Promise<void> {
  const sessions = await loadSessionsMap();
  sessions[params.threadId] = params.gistId;
  await writeSessionsMap(sessions);
}
