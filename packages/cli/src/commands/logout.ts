import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { clearCredentials, hasCredentials } from "../utils/credentials.js";

export function logoutCommand(program: Command) {
  program
    .command("logout")
    .description("Log out and clear stored credentials")
    .action(async () => {
      try {
        const isAuthenticated = await hasCredentials();

        if (!isAuthenticated) {
          console.log(chalk.yellow("⚠️  You are not currently authenticated."));
          return;
        }

        const answers = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Are you sure you want to log out?",
            default: false,
          },
        ]);

        if (answers.confirm) {
          await clearCredentials();
          console.log(chalk.green("✓ Successfully logged out!"));
        } else {
          console.log(chalk.blue("Logout cancelled."));
        }
      } catch (error) {
        console.error(chalk.red("Logout failed:"), error);
        process.exit(1);
      }
    });
}
