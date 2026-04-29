import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChatSession } from "../types/index.js";
import { readJsonFile } from "../utils/bun-parsing.js";
import {
  ChatProvider,
  getDefaultProviderThreadMetadata,
  ProviderActionResult,
  ProviderInstallContext,
  ProviderListContext,
  ProviderMetadataContext,
  ProviderParseResult,
  ProviderThreadMetadata,
  unsupportedHooks,
} from "./base.js";

interface OpenCodeSession {
  id: string;
  projectID: string;
  directory: string;
  title: string;
  time: {
    created: number;
    updated: number;
  };
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
}

interface OpenCodeProject {
  id: string;
  worktree: string;
}

export class OpenCodeProvider implements ChatProvider {
  readonly id = "opencode";
  readonly name = "OpenCode";

  private getStoragePath(subDir: string): string {
    return path.join(os.homedir(), ".local/share/opencode/storage", subDir);
  }

  async install(_context: ProviderInstallContext): Promise<ProviderActionResult> {
    return unsupportedHooks(this.name);
  }

  async uninstall(_context: ProviderInstallContext): Promise<ProviderActionResult> {
    return unsupportedHooks(this.name);
  }

  async list(_context?: ProviderListContext): Promise<ChatSession[]> {
    const sessionRoot = this.getStoragePath("session");
    const projectRoot = this.getStoragePath("project");

    if (!fs.existsSync(sessionRoot)) {
      return [];
    }

    const sessions: ChatSession[] = [];
    const projectDirs = fs.readdirSync(sessionRoot);

    for (const projectDir of projectDirs) {
      // projectDir is likely the projectID or 'global'
      const projectSessionPath = path.join(sessionRoot, projectDir);

      if (!fs.statSync(projectSessionPath).isDirectory()) {
        continue;
      }

      // Try to resolve workspace info
      let workspaceName: string | undefined;
      let workspacePath: string | undefined;

      if (projectDir !== "global") {
        try {
          const projectJsonPath = path.join(projectRoot, `${projectDir}.json`);
          if (fs.existsSync(projectJsonPath)) {
            const projectData = await readJsonFile<OpenCodeProject>(
              projectJsonPath,
            );
            workspacePath = projectData.worktree;
            workspaceName = path.basename(workspacePath);
          }
        } catch (e) {
          // Ignore missing project data
        }
      }

      const sessionFiles = fs.readdirSync(projectSessionPath);
      for (const file of sessionFiles) {
        if (!file.endsWith(".json")) continue;

        try {
          const filePath = path.join(projectSessionPath, file);
          const sessionData = await readJsonFile<OpenCodeSession>(filePath);

          const sessionMsgDir = path.join(
            this.getStoragePath("message"),
            sessionData.id
          );
          let requestCount = 0;
          if (fs.existsSync(sessionMsgDir)) {
            requestCount = fs
              .readdirSync(sessionMsgDir)
              .filter((f) => f.endsWith(".json")).length;
          }

          if (requestCount === 0) {
            continue;
          }

          sessions.push({
            sessionId: sessionData.id,
            creationDate: sessionData.time.created,
            lastMessageDate: sessionData.time.updated,
            title: sessionData.title,
            requestCount,
            filePath, // Point to the session metadata file
            source: this.id,
            workspaceName,
            workspacePath: workspacePath || sessionData.directory, // Fallback to directory in session
          });
        } catch (e) {
          continue;
        }
      }
    }

    return sessions;
  }

  async parse(_session: ChatSession): Promise<ProviderParseResult> {
    return {
      kind: "skip",
      reason: "OpenCode sessions are stored across multiple files.",
    };
  }

  async getMetadata(
    session: ChatSession,
    _context: ProviderMetadataContext,
  ): Promise<ProviderThreadMetadata> {
    return getDefaultProviderThreadMetadata(this, session);
  }
}
