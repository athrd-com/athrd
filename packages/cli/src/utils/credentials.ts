import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

interface Credentials {
  token: string;
}

const CREDENTIALS_DIR = path.join(os.homedir(), ".athrd");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

export async function saveCredentials(credentials: Credentials): Promise<void> {
  try {
    // Ensure directory exists
    await fs.mkdir(CREDENTIALS_DIR, { recursive: true });

    // Save credentials
    await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
      mode: 0o600, // Read/write for owner only
    });
  } catch (error) {
    throw new Error(`Failed to save credentials: ${error}`);
  }
}

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const data = await fs.readFile(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(`Failed to load credentials: ${error}`);
  }
}

export async function clearCredentials(): Promise<void> {
  try {
    await fs.unlink(CREDENTIALS_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Failed to clear credentials: ${error}`);
    }
  }
}

export async function hasCredentials(): Promise<boolean> {
  try {
    await fs.access(CREDENTIALS_FILE);
    return true;
  } catch {
    return false;
  }
}
