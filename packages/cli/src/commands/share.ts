import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { getProvider, providers } from "../providers/index.js";
import { ChatSession } from "../types/index.js";
import { requireAuth } from "../utils/auth.js";
import { formatDate } from "../utils/date.js";
import { getGitHubRepo } from "../utils/git.js";
import {
  getGitHubOrgInfo,
  getGitHubRepoInfo,
  getGitHubUserInfo,
} from "../utils/github.js";
import { appendAthrdUrlMarker } from "../utils/marker.js";
import {
  getGistIdForThread,
  upsertThreadGistMapping,
} from "../utils/sessions.js";

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

export function shareCommand(program: Command) {
  program
    .command("share")
    .description("Share AI chat threads from VS Code, Cursor, and more")
    .option("-n, --number <count>", "Number of chats to display", "20")
    .option(
      "-i, --ide <ide>",
      "Filter by IDE (vscode, gemini, claude, codex, cursor)",
    )
    .option("--vscode", "Filter by VS Code")
    .option("--gemini", "Filter by Gemini")
    .option("--claude", "Filter by Claude")
    .option("--cursor", "Filter by Cursor")
    .option("--codex", "Filter by Codex")
    .option("--opencode", "Filter by OpenCode")
    .option("--json <json>", "JSON payload from hook event")
    .option("--mark", "Write shared athrd URL to repo-root .athrd-ai-marker")
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
              debug: () => { },
              info: () => { },
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

            // Add __athrd metadata to the session data
            const enrichedData = {
              __athrd: {
                githubUsername: userInfo.username,
                githubRepo: githubRepo,
                ide: provider.id, // Use provider ID as 'ide'
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
              ...sessionData,
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

            if (options.mark) {
              try {
                appendAthrdUrlMarker({
                  cwd: repoCwd,
                  url: athrdUrl,
                });
              } catch (error) {
                console.warn(
                  chalk.yellow(
                    `⚠ Failed to write .athrd-ai-marker for session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
                  ),
                );
              }
            }

            console.log(
              chalk.green(
                `✓ ${session.customTitle || "Untitled Chat"
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
