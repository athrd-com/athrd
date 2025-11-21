import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device";
import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { config } from "../config.js";
import { saveCredentials } from "../utils/credentials.js";

export function authCommand(program: Command) {
  program
    .command("auth")
    .description("Authenticate with GitHub")
    .action(async () => {
      try {
        console.log(chalk.blue("🔐 Authenticating with GitHub..."));

        if (!config.github.clientId) {
          console.error(
            chalk.red(
              "❌ GitHub OAuth App Client ID is not configured. Please set GITHUB_CLIENT_ID environment variable."
            )
          );
          process.exit(1);
        }

        console.log(chalk.cyan("\n📱 Starting GitHub Device Flow...\n"));

        // Create device auth
        const auth = createOAuthDeviceAuth({
          clientType: "oauth-app",
          clientId: config.github.clientId,
          scopes: ["gist", "read:user", "user:email"],
          onVerification: async (verification) => {
            console.log(chalk.bold("Please authorize this app by visiting:"));
            console.log(chalk.blue.underline(verification.verification_uri));
            console.log(
              chalk.yellow(
                `\nEnter code: ${chalk.bold(verification.user_code)}\n`
              )
            );

            // Open browser automatically
            try {
              await open(verification.verification_uri);
              console.log(chalk.green("✓ Browser opened automatically\n"));
            } catch (error) {
              console.log(
                chalk.yellow("⚠️  Could not open browser automatically\n")
              );
            }

            console.log(chalk.dim("Waiting for authorization..."));
          },
        });

        // Authenticate and get token
        const { token } = await auth({ type: "oauth" });

        // Save the token
        await saveCredentials({ token });
        console.log(chalk.green("\n✓ Authentication successful!"));
        console.log(chalk.dim(`Token: ${token.substring(0, 10)}...\n`));
      } catch (error) {
        if (error instanceof Error) {
          console.error(
            chalk.red("\n❌ Authentication failed:"),
            error.message
          );
        } else {
          console.error(chalk.red("\n❌ Authentication failed:"), error);
        }
        process.exit(1);
      }
    });
}
