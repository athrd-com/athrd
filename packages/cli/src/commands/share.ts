import { createHash } from "node:crypto";
import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { getProvider, providers } from "../providers/index.js";
import { ChatSession } from "../types/index.js";
import { requireAuth } from "../utils/auth.js";
import { formatDate } from "../utils/date.js";
import { ensureRepoCommitMsgHookCompatibility } from "../utils/git-hooks.js";
import { getGitHeadCommitHash, getGitHubRepo } from "../utils/git.js";
import {
  getGitHubOrgInfo,
  getGitHubRepoInfo,
  getGitHubUserInfo,
  type GitHubOrgInfo,
  type GitHubRepoInfo,
  type GitHubUserInfo,
} from "../utils/github.js";
import { appendAthrdUrlMarker } from "../utils/marker.js";
import { maybeBackfillHookDrivenCommit } from "../utils/hook-share-backfill.js";
import {
  getGistIdForThread,
  upsertThreadGistMapping,
} from "../utils/sessions.js";
import {
  syncThreadIndex,
  type ThreadIndexMetadata,
} from "../utils/thread-sync.js";

function extractSessionIdFromHookPayload(
  payload: string,
  provider?: string,
): string | null {
  try {
    const data = JSON.parse(payload);

    if (provider === "claude") {
      return typeof data.session_id === "string" ? data.session_id : null;
    }

    if (provider === "codex") {
      if (typeof data["thread-id"] === "string") {
        return data["thread-id"];
      }
      if (typeof data.thread_id === "string") {
        return data.thread_id;
      }
      return typeof data.session_id === "string" ? data.session_id : null;
    }

    if (provider === "gemini") {
      if (typeof data.sessionId === "string") {
        return data.sessionId;
      }
      return typeof data.session_id === "string" ? data.session_id : null;
    }

    const genericId =
      (typeof data["thread-id"] === "string" && data["thread-id"]) ||
      (typeof data.thread_id === "string" && data.thread_id) ||
      (typeof data.sessionId === "string" && data.sessionId) ||
      (typeof data.session_id === "string" && data.session_id);

    return genericId || null;
  } catch {
    return null;
  }
}

function extractWorkspacePathFromHookPayload(
  payload: string,
  _provider?: string,
): string | null {
  try {
    const data = JSON.parse(payload);
    return typeof data.cwd === "string" && data.cwd ? data.cwd : null;
  } catch {
    return null;
  }
}

function buildThreadIndexMetadata(input: {
  content: string;
  enrichedData: unknown;
  session: ChatSession;
  providerId: string;
  userInfo: GitHubUserInfo;
  githubRepo?: string | null;
  commitHash?: string | null;
  repoInfo?: GitHubRepoInfo | null;
  orgInfo?: GitHubOrgInfo | null;
}): ThreadIndexMetadata {
  return {
    ownerGithubId: String(input.userInfo.userId),
    ownerGithubLogin: input.userInfo.username,
    title:
      input.session.customTitle ||
      extractTitle(input.enrichedData) ||
      "AI Chat Thread",
    ide: input.providerId,
    model: extractFirstModel(input.enrichedData, input.providerId),
    modelProvider: extractModelProvider(input.enrichedData),
    repoName: input.githubRepo || undefined,
    commitHash: input.commitHash || undefined,
    ghRepoId:
      typeof input.repoInfo?.repoId === "number"
        ? String(input.repoInfo.repoId)
        : undefined,
    organization: input.orgInfo
      ? {
          id: String(input.orgInfo.orgId),
          login: input.orgInfo.orgName,
          avatarUrl: input.orgInfo.orgIcon,
        }
      : undefined,
    createdAt: normalizeTimestampValue(input.session.creationDate),
    updatedAt: normalizeTimestampValue(input.session.lastMessageDate),
    contentSha256: createHash("sha256").update(input.content).digest("hex"),
  };
}

function extractTitle(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const athrdMeta = getRecord(input, "__athrd");
  const metadata = getRecord(input, "metadata");

  return firstNonEmptyString(
    getString(athrdMeta, "title"),
    getString(metadata, "name"),
    getString(input, "title"),
    getString(input, "customTitle"),
    getString(input, "summary"),
  );
}

function extractFirstModel(input: unknown, providerId: string): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  if (providerId === "vscode") {
    return firstModelFromArray(input.requests, (item) => getString(item, "modelId"));
  }

  if (providerId === "claude") {
    return firstModelFromArray(input.requests, (item) =>
      getString(getRecord(item, "message"), "model"),
    );
  }

  if (providerId === "gemini") {
    return firstModelFromArray(input.messages, (item) => getString(item, "model"));
  }

  if (providerId === "codex") {
    const model = getString(getRecord(input, "payload"), "model");
    if (model) {
      return model;
    }

    return firstModelFromArray(input.messages, (item) =>
      getString(getRecord(item, "payload"), "model"),
    );
  }

  if (providerId === "pi") {
    const entries = Array.isArray(input.entries) ? input.entries : input.messages;
    return firstModelFromArray(entries, (item) => {
      if (getString(item, "type") === "model_change") {
        return getString(item, "modelId");
      }

      const message = getRecord(item, "message");
      return getString(message, "model");
    });
  }

  return (
    getString(input, "model") ||
    getString(getRecord(input, "payload"), "model") ||
    firstModelFromArray(input.messages, (item) =>
      getString(getRecord(item, "payload"), "model") ||
      getString(getRecord(item, "message"), "model") ||
      getString(item, "model"),
    )
  );
}

function extractModelProvider(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const athrdMeta = getRecord(input, "__athrd");
  const payload = getRecord(input, "payload");

  return (
    getString(athrdMeta, "modelProvider") ||
    getString(athrdMeta, "model_provider") ||
    getString(payload, "model_provider") ||
    firstModelFromArray(input.messages, (item) =>
      getString(getRecord(item, "payload"), "model_provider"),
    )
  );
}

function firstModelFromArray(
  value: unknown,
  select: (item: Record<string, unknown>) => string | undefined,
): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const model = select(item);
    if (model) {
      return model;
    }
  }

  return undefined;
}

function normalizeTimestampValue(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return new Date(value).toISOString();
}

function getRecord(
  input: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = input[key];
  return isRecord(value) ? value : undefined;
}

function getString(
  input: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function firstNonEmptyString(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function shareCommand(program: Command) {
  program
    .command("share")
    .description("Share AI chat threads from VS Code, Cursor, and more")
    .option("-n, --number <count>", "Number of chats to display", "20")
    .option(
      "-i, --ide <ide>",
      "Filter by IDE (vscode, gemini, claude, codex, cursor, opencode, pi)",
    )
    .option("--vscode", "Filter by VS Code")
    .option("--gemini", "Filter by Gemini")
    .option("--claude", "Filter by Claude")
    .option("--cursor", "Filter by Cursor")
    .option("--codex", "Filter by Codex")
    .option("--opencode", "Filter by OpenCode")
    .option("--pi", "Filter by Pi")
    .option("--json <json>", "JSON payload from hook event")
    .option(
      "--mark",
      "Write shared athrd URL to repo-root .agent-session-marker",
    )
    .action(async (options) => {
      try {
        // Determine filter early to optimize search
        let filterIde = options.ide;
        if (options.vscode) filterIde = "vscode";
        if (options.gemini) filterIde = "gemini";
        if (options.claude) filterIde = "claude";
        if (options.cursor) filterIde = "cursor";
        if (options.codex) filterIde = "codex";
        if (options.opencode) filterIde = "opencode";
        if (options.pi) filterIde = "pi";

        console.log(chalk.blue("📋 Finding AI chat threads...\n"));

        // Select providers based on filter
        let targetProviders = providers;
        if (filterIde) {
          const target = providers.find(
            (p) => p.id.toLowerCase() === filterIde.toLowerCase(),
          );
          targetProviders = target ? [target] : [];
        }

        // Find sessions from selected providers only
        const allSessions = await Promise.all(
          targetProviders.map((p) => p.findSessions()),
        );
        let sessions = allSessions.flat();

        const hookSessionId = options.json
          ? extractSessionIdFromHookPayload(options.json, filterIde)
          : null;
        const hookWorkspacePath = options.json
          ? extractWorkspacePathFromHookPayload(options.json, filterIde)
          : null;

        if (options.json && !hookSessionId) {
          console.log(
            chalk.yellow("No session ID found in hook JSON payload."),
          );
          return;
        }

        if (hookSessionId) {
          sessions = sessions.filter((s) => s.sessionId === hookSessionId);
        }

        if (sessions.length === 0) {
          console.log(chalk.yellow("No chat sessions found."));
          return;
        }

        // Sort by most recent lastMessageDate
        sessions.sort(
          (a: ChatSession, b: ChatSession) =>
            b.lastMessageDate - a.lastMessageDate,
        );

        // Limit to requested number
        const limit = parseInt(options.number) || 20;
        const displaySessions = sessions.slice(0, limit);

        console.log(
          chalk.cyan(
            `Found ${sessions.length} chat sessions. Showing ${displaySessions.length} most recent:\n`,
          ),
        );

        // Create choices for multi-select
        const choices = displaySessions.map((session: ChatSession) => {
          const title = session.customTitle || "Untitled Chat";
          const date = formatDate(session.lastMessageDate);
          const messages = chalk.dim(`${session.requestCount} messages`);
          const dateStr = chalk.dim(date);
          const workspace = session.workspaceName
            ? chalk.dim(`[${session.workspaceName}]`)
            : "";

          const provider = getProvider(session.source);
          const sourceLabel = chalk.dim(
            `(${provider?.name || session.source})`,
          );

          return {
            name: `${title} ${workspace} ${sourceLabel} ${dateStr} ${messages}`,
            value: session,
            short: title,
          };
        });

        let selectedSessions: ChatSession[] = [];

        if (hookSessionId && displaySessions.length > 0) {
          selectedSessions = displaySessions;
        } else {
          // Show multi-select prompt
          const answers = await inquirer.prompt([
            {
              type: "checkbox",
              name: "selectedSessions",
              message:
                "Select chat threads (use Space to select, Enter to confirm):",
              choices,
              pageSize: 15,
            },
          ]);
          selectedSessions = answers.selectedSessions;
        }

        if (selectedSessions.length === 0) {
          console.log(chalk.yellow("\nNo chats selected."));
          return;
        }

        console.log(
          chalk.green(
            `\n✓ Selected ${selectedSessions.length} chat thread(s):`,
          ),
        );

        selectedSessions.forEach((session: ChatSession) => {
          console.log(
            chalk.cyan(`  • ${session.customTitle || "Untitled Chat"}`),
          );
        });

        // Upload to private gists
        console.log(chalk.blue("\n📤 Uploading..."));

        try {
          const token = await requireAuth();
          const octokit = new Octokit({
            auth: token,
            log: {
              debug: () => {},
              info: () => {},
              warn: console.warn,
              error: console.error,
            },
          });

          // Fetch GitHub user info once
          const userInfo = await getGitHubUserInfo(octokit);

          for (const session of selectedSessions) {
            const provider = getProvider(session.source);
            if (!provider) {
              console.warn(
                chalk.yellow(
                  `Provider not found for session ${session.sessionId}`,
                ),
              );
              continue;
            }

            const sessionData = await provider.parseSession(session);
            const repoCwd =
              hookWorkspacePath ?? session.workspacePath ?? process.cwd();

            // Get GitHub repo for this session
            // Prefer cwd from hook payload when available, then session workspace path.
            const githubRepo = getGitHubRepo(repoCwd);
            const commitHash = getGitHeadCommitHash(repoCwd);

            // Extract organization name from repo (format: "org/repo")
            const orgName = githubRepo?.split("/")[0];
            const repoName = githubRepo?.split("/")[1];
            const orgInfo = orgName
              ? await getGitHubOrgInfo(octokit, orgName)
              : null;

            const repoInfo =
              orgName && repoName
                ? await getGitHubRepoInfo(octokit, orgName, repoName)
                : null;

            const existingAthrdMetadata =
              typeof sessionData?.__athrd === "object" &&
              sessionData.__athrd !== null
                ? (sessionData.__athrd as Record<string, unknown>)
                : {};

            // Add/refresh __athrd metadata on the session data.
            const enrichedData = {
              ...sessionData,
              __athrd: {
                ...existingAthrdMetadata,
                githubUsername: userInfo.username,
                githubRepo: githubRepo,
                ide: provider.id, // Use provider ID as 'ide'
                ...(commitHash && {
                  commitHash,
                }),
                ...(repoInfo && {
                  ghRepoId: repoInfo.repoId,
                  name: repoInfo.name,
                }),
                ...(orgInfo && {
                  orgId: orgInfo.orgId,
                  orgName: orgInfo.orgName,
                  orgIcon: orgInfo.orgIcon,
                }),
              },
            };

            const content = JSON.stringify(enrichedData, null, 2);
            const fileName = `athrd-${session.sessionId}.json`;

            const existingGistId = await getGistIdForThread(session.sessionId);

            let gistId: string;
            let actionLabel: string;

            if (existingGistId) {
              await octokit.gists.update({
                gist_id: existingGistId,
                files: {
                  [fileName]: { content },
                },
                description: session.customTitle || "AI Chat Thread",
              });

              gistId = existingGistId;
              actionLabel = "updated";
            } else {
              const response = await octokit.gists.create({
                files: {
                  [fileName]: { content },
                },
                description: session.customTitle || "AI Chat Thread",
                public: false,
              });

              if (!response.data.id) {
                throw new Error("GitHub API did not return a gist id");
              }

              gistId = response.data.id;
              actionLabel = "created";
            }

            await upsertThreadGistMapping({
              threadId: session.sessionId,
              gistId,
            });

            const athrdUrl = `https://athrd.com/threads/${gistId}`;

            try {
              await syncThreadIndex({
                source: "gist",
                sourceId: gistId,
                metadata: buildThreadIndexMetadata({
                  content,
                  enrichedData,
                  session,
                  providerId: provider.id,
                  userInfo,
                  githubRepo,
                  commitHash,
                  repoInfo,
                  orgInfo,
                }),
                token,
              });
            } catch (error) {
              console.warn(
                chalk.yellow(
                  `⚠ Failed to index metadata for session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
                ),
              );
            }

            if (options.mark) {
              try {
                appendAthrdUrlMarker({
                  cwd: repoCwd,
                  url: athrdUrl,
                });
                ensureRepoCommitMsgHookCompatibility(repoCwd);
                maybeBackfillHookDrivenCommit({
                  cwd: repoCwd,
                  mark: options.mark === true,
                  hookPayloadJson: options.json,
                  url: athrdUrl,
                });
              } catch (error) {
                console.warn(
                  chalk.yellow(
                    `⚠ Failed to write .agent-session-marker for session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
                  ),
                );
              }
            }

            console.log(
              chalk.green(
                `✓ ${
                  session.customTitle || "Untitled Chat"
                }: (${actionLabel}) ${athrdUrl}`,
              ),
            );
          }
        } catch (error) {
          console.error(chalk.red("\n❌ Failed to upload:"), error);
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red("Share command failed:"), error);
        process.exit(1);
      }
    });
}
