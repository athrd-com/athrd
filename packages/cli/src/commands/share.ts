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

export function shareCommand(program: Command) {
  program
    .command("share")
    .description("Share AI chat threads from VS Code, Cursor, and more")
    .option("-n, --number <count>", "Number of chats to display", "20")
    .option("-i, --ide <ide>", "Filter by IDE (vscode, gemini, claude, cursor)")
    .option("--vscode", "Filter by VS Code")
    .option("--gemini", "Filter by Gemini")
    .option("--claude", "Filter by Claude")
    .option("--cursor", "Filter by Cursor")
    .action(async (options) => {
      try {
        console.log(chalk.blue("📋 Finding AI chat threads...\n"));

        // Find sessions from all providers
        const allSessions = await Promise.all(
          providers.map((p) => p.findSessions())
        );
        let sessions = allSessions.flat();

        // Determine filter
        let filterIde = options.ide;
        if (options.vscode) filterIde = "vscode";
        if (options.gemini) filterIde = "gemini";
        if (options.claude) filterIde = "claude";
        if (options.cursor) filterIde = "cursor";

        if (filterIde) {
          sessions = sessions.filter(
            (s) => s.source.toLowerCase() === filterIde.toLowerCase()
          );
        }

        if (sessions.length === 0) {
          console.log(chalk.yellow("No chat sessions found."));
          return;
        }

        // Sort by most recent lastMessageDate
        sessions.sort(
          (a: ChatSession, b: ChatSession) =>
            b.lastMessageDate - a.lastMessageDate
        );

        // Limit to requested number
        const limit = parseInt(options.number) || 20;
        const displaySessions = sessions.slice(0, limit);

        console.log(
          chalk.cyan(
            `Found ${sessions.length} chat sessions. Showing ${displaySessions.length} most recent:\n`
          )
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
            `(${provider?.name || session.source})`
          );

          const shortId = session.sessionId.slice(0, 8);
          const idLabel = chalk.dim(`[${shortId}]`);

          return {
            name: `${title} ${workspace} ${sourceLabel} ${dateStr} ${messages}`,
            value: session,
            short: title,
          };
        });

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

        if (answers.selectedSessions.length === 0) {
          console.log(chalk.yellow("\nNo chats selected."));
          return;
        }

        console.log(
          chalk.green(
            `\n✓ Selected ${answers.selectedSessions.length} chat thread(s):`
          )
        );

        answers.selectedSessions.forEach((session: ChatSession) => {
          console.log(
            chalk.cyan(`  • ${session.customTitle || "Untitled Chat"}`)
          );
        });

        // Upload to private gists
        console.log(chalk.blue("\n📤 Uploading..."));

        try {
          const token = await requireAuth();
          const octokit = new Octokit({ auth: token });

          // Fetch GitHub user info once
          const userInfo = await getGitHubUserInfo(octokit);

          const gistUrls: string[] = [];

          for (const session of answers.selectedSessions) {
            const provider = getProvider(session.source);
            if (!provider) {
              console.warn(
                chalk.yellow(
                  `Provider not found for session ${session.sessionId}`
                )
              );
              continue;
            }

            const sessionData = await provider.parseSession(session);

            // Get GitHub repo for this session
            const githubRepo = session.workspacePath
              ? getGitHubRepo(session.workspacePath)
              : null;

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

            const response = await octokit.gists.create({
              files: {
                [fileName]: { content },
              },
              description: session.customTitle || "AI Chat Thread",
              public: false,
            });

            gistUrls.push(response.data.html_url || "");
            console.log(
              chalk.green(
                `✓ ${session.customTitle || "Untitled Chat"
                }: https://athrd.com/threads/${response.data.id}`
              )
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
