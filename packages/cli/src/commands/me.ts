import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import { exec } from "child_process";
import { Command } from "commander";
import { promisify } from "util";
import { loadCredentials } from "../utils/credentials.js";

const execAsync = promisify(exec);

export function meCommand(program: Command) {
  program
    .command("me", { hidden: true })
    .description("Show current user and repository information")
    .action(async () => {
      try {
        const credentials = await loadCredentials();

        if (!credentials) {
          console.error(
            chalk.red("❌ Not authenticated. Please run 'athrd auth' first.")
          );
          process.exit(1);
        }

        const octokit = new Octokit({ auth: credentials.token });
        const { data: user } = await octokit.rest.users.getAuthenticated();

        console.log(chalk.bold("\n👤 User Information:"));
        console.log(chalk.dim("Username:"), chalk.green(user.login));
        console.log(chalk.dim("ID:      "), chalk.green(user.id));

        try {
          const { stdout } = await execAsync("git remote get-url origin");
          const remoteUrl = stdout.trim();

          // Parse owner/repo from URL
          // Supports:
          // https://github.com/owner/repo.git
          // git@github.com:owner/repo.git
          let repoInfo = remoteUrl;
          const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^.]+)/);
          if (match) {
            repoInfo = `${match[1]}/${match[2]}`;
          }

          console.log(chalk.bold("\n📦 Repository Information:"));
          console.log(chalk.dim("Current: "), chalk.blue(repoInfo));

          if (match) {
            const owner = match[1];
            try {
              const { data: ownerData } =
                await octokit.rest.users.getByUsername({
                  username: owner,
                });

              if (ownerData.type === "Organization") {
                console.log(chalk.dim("Org ID:  "), chalk.blue(ownerData.id));
              }
            } catch (error) {
              // Ignore error fetching owner details
            }
          }
        } catch (error) {
          // Ignore git errors, just don't show repo info
        }

        console.log(); // Empty line at end
      } catch (error) {
        console.error(chalk.red("❌ Failed to get user information:"), error);
        process.exit(1);
      }
    });
}
