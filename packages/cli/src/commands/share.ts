import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { config } from "../config.js";
import { getProvider, providers } from "../providers/index.js";
import { ChatSession } from "../types/index.js";
import {
  injectAthrdMetadata,
  type AthrdMetadata,
} from "../utils/athrd-metadata.js";
import { requireCredentials } from "../utils/auth.js";
import {
  saveCredentials,
  type Credentials,
  type StoredGitHubUserInfo,
} from "../utils/credentials.js";
import { formatDate } from "../utils/date.js";
import { ensureRepoCommitMsgHookCompatibility } from "../utils/git-hooks.js";
import {
  getGitCurrentBranch,
  getGitHeadCommitHash,
  getGitHubRepo,
} from "../utils/git.js";
import { resolveGitHubRepositoryContext } from "../utils/github-context.js";
import {
  completeIngest,
  createSignedUpload,
  createIngestPlan,
  exchangeCliToken,
  getFallbackThreadUrl,
  type IngestGithubContext,
  uploadToSignedUrl,
} from "../utils/ingest-client.js";
import { appendAthrdUrlMarker } from "../utils/marker.js";
import { maybeBackfillHookDrivenCommit } from "../utils/hook-share-backfill.js";
import {
  getGistIdForThread,
  upsertThreadGistMapping,
  upsertThreadUploadMapping,
} from "../utils/sessions.js";

const CLI_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

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

function getStaleAthrdFileName(currentFileName: string): string | null {
  if (currentFileName.endsWith(".jsonl")) {
    return currentFileName.replace(/\.jsonl$/i, ".json");
  }

  if (currentFileName.endsWith(".json")) {
    return currentFileName.replace(/\.json$/i, ".jsonl");
  }

  return null;
}

async function getExistingStaleAthrdFileName(
  octokit: Octokit,
  gistId: string,
  currentFileName: string,
): Promise<string | null> {
  const staleFileName = getStaleAthrdFileName(currentFileName);
  if (!staleFileName) {
    return null;
  }

  const response = await octokit.gists.get({ gist_id: gistId });
  return response.data.files?.[staleFileName] ? staleFileName : null;
}

async function getIngestPlanOrDefault(input: {
  token: string;
  metadata: AthrdMetadata;
  github: IngestGithubContext;
}) {
  try {
    return await createIngestPlan(input);
  } catch {
    return {
      storageProvider: "gist" as const,
      uploadMode: "client" as const,
    };
  }
}

async function completeGistIngestOrFallback(input: {
  token: string;
  metadata: AthrdMetadata;
  github: IngestGithubContext;
  artifact: {
    fileName: string;
    format: "json" | "jsonl";
  };
  gistId: string;
}): Promise<string> {
  try {
    const result = await completeIngest({
      token: input.token,
      metadata: input.metadata,
      github: input.github,
      artifact: input.artifact,
      storage: {
        provider: "gist",
        publicId: input.gistId,
        sourceId: input.gistId,
      },
    });

    return result.url;
  } catch {
    return getFallbackThreadUrl(input.gistId);
  }
}

async function resolveCliCredentials(credentials: Credentials): Promise<{
  ingestToken: string;
  userInfo: StoredGitHubUserInfo;
}> {
  if (
    credentials.athrdToken &&
    credentials.userInfo &&
    isFreshCliToken(credentials.athrdTokenExpiresAt)
  ) {
    return {
      ingestToken: credentials.athrdToken,
      userInfo: credentials.userInfo,
    };
  }

  const exchange = await exchangeCliToken(credentials.token);
  const userInfo: StoredGitHubUserInfo = {
    id: exchange.actor.githubUserId,
    username: exchange.actor.githubUsername,
    avatarImage: exchange.actor.avatarUrl || "",
  };

  await saveCredentials({
    ...credentials,
    athrdToken: exchange.token,
    athrdTokenExpiresAt: exchange.expiresAt,
    userInfo,
  });

  return {
    ingestToken: exchange.token,
    userInfo,
  };
}

function isFreshCliToken(expiresAt: string | undefined): boolean {
  const timestamp = Date.parse(expiresAt || "");
  return (
    Number.isFinite(timestamp) &&
    timestamp - Date.now() > CLI_TOKEN_REFRESH_WINDOW_MS
  );
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
          targetProviders.map((p) => p.list()),
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
          const title = session.title || "Untitled Chat";
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
            chalk.cyan(`  • ${session.title || "Untitled Chat"}`),
          );
        });

        // Upload to private gists
        console.log(chalk.blue("\n📤 Uploading..."));

        try {
          const credentials = await requireCredentials();
          const githubToken = credentials.token;
          const { ingestToken, userInfo } =
            await resolveCliCredentials(credentials);
          const octokit = new Octokit({
            auth: githubToken,
            log: {
              debug: () => {},
              info: () => {},
              warn: console.warn,
              error: console.error,
            },
          });

          let uploadedCount = 0;
          let skippedCount = 0;

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

            const artifact = await provider.parse(session);
            if (artifact.kind === "skip") {
              skippedCount++;
              console.warn(
                chalk.yellow(
                  `⚠ Skipping ${session.title || session.sessionId}: ${artifact.reason}`,
                ),
              );
              continue;
            }

            const repoCwd =
              hookWorkspacePath ?? session.workspacePath ?? process.cwd();

            // Get GitHub repo for this session
            // Prefer cwd from hook payload when available, then session workspace path.
            const githubRepo = getGitHubRepo(repoCwd);
            const commitHash = getGitHeadCommitHash(repoCwd);
            const branch = getGitCurrentBranch(repoCwd);

            const repositoryContext = await resolveGitHubRepositoryContext({
              octokit,
              githubRepo,
              userInfo,
            });
            const githubContext: IngestGithubContext = repositoryContext.github;

            const threadMetadata = await provider.getMetadata(session, {
              cliVersion: config.version,
            });
            const athrdMetadata: AthrdMetadata = {
              schemaVersion: 1,
              thread: threadMetadata,
              actor: {
                githubUserId: userInfo.id,
                githubUsername: userInfo.username,
                avatarUrl: userInfo.avatarImage,
              },
              ...(repositoryContext.organization && {
                organization: repositoryContext.organization,
              }),
              ...(repositoryContext.repository && {
                repository: repositoryContext.repository,
              }),
              ...(commitHash && {
                commit: {
                  sha: commitHash,
                  ...(branch ? { branch } : {}),
                },
              }),
              upload: {
                cliVersion: config.version,
              },
            };

            const content = injectAthrdMetadata(artifact, athrdMetadata);
            const fileName = artifact.fileName;
            let actionLabel: string;
            let athrdUrl: string;

            const ingestPlan = await getIngestPlanOrDefault({
              token: ingestToken,
              metadata: athrdMetadata,
              github: githubContext,
            });

            if (ingestPlan.storageProvider === "s3") {
              const signedUpload = await createSignedUpload({
                token: ingestToken,
                metadata: athrdMetadata,
                github: githubContext,
                artifact: {
                  fileName,
                  format: artifact.format,
                },
              });
              await uploadToSignedUrl({
                uploadUrl: signedUpload.uploadUrl,
                content,
                format: artifact.format,
              });
              const result = await completeIngest({
                token: ingestToken,
                metadata: athrdMetadata,
                github: githubContext,
                artifact: {
                  fileName,
                  format: artifact.format,
                },
                storage: signedUpload.storage,
              });

              await upsertThreadUploadMapping({
                threadId: session.sessionId,
                upload: {
                  provider: "s3",
                  publicId: result.publicId,
                  sourceId: result.sourceId,
                },
              });

              actionLabel = "uploaded";
              athrdUrl = result.url;
            } else {
              const existingGistId = await getGistIdForThread(session.sessionId);

              let gistId: string;

              if (existingGistId) {
                const staleFileName = await getExistingStaleAthrdFileName(
                  octokit,
                  existingGistId,
                  fileName,
                );
                const files: Record<string, any> = {
                  [fileName]: { content },
                };
                if (staleFileName) {
                  files[staleFileName] = null;
                }

                await octokit.gists.update({
                  gist_id: existingGistId,
                  files,
                  description: threadMetadata.title || "AI Chat Thread",
                });

                gistId = existingGistId;
                actionLabel = "updated";
              } else {
                const response = await octokit.gists.create({
                  files: {
                    [fileName]: { content },
                  },
                  description: threadMetadata.title || "AI Chat Thread",
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

              athrdUrl = await completeGistIngestOrFallback({
                token: ingestToken,
                metadata: athrdMetadata,
                github: githubContext,
                artifact: {
                  fileName,
                  format: artifact.format,
                },
                gistId,
              });
            }

            uploadedCount++;

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
                  session.title || "Untitled Chat"
                }: (${actionLabel}) ${athrdUrl}`,
              ),
            );
          }

          if (uploadedCount === 0 && skippedCount > 0) {
            console.log(chalk.yellow("No selected sessions were uploaded."));
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
