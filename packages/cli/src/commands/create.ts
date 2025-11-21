import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { requireAuth } from "../utils/auth.js";

export function createCommand(program: Command) {
  program
    .command("create")
    .description("Create a new item")
    .action(async () => {
      try {
        await requireAuth();

        console.log(chalk.blue("📝 Creating a new item..."));

        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: "Enter item name:",
            validate: (input) => {
              if (!input || input.trim() === "") {
                return "Name cannot be empty";
              }
              return true;
            },
          },
          {
            type: "input",
            name: "description",
            message: "Enter item description (optional):",
          },
          {
            type: "list",
            name: "type",
            message: "Select item type:",
            choices: ["Type A", "Type B", "Type C"],
          },
          {
            type: "confirm",
            name: "confirm",
            message: "Create this item?",
            default: true,
          },
        ]);

        if (answers.confirm) {
          console.log(chalk.green("\n✓ Item created successfully!"));
          console.log(chalk.dim("\nDetails:"));
          console.log(chalk.dim(`  Name: ${answers.name}`));
          console.log(
            chalk.dim(`  Description: ${answers.description || "N/A"}`)
          );
          console.log(chalk.dim(`  Type: ${answers.type}`));

          // TODO: Implement actual create functionality
          console.log(
            chalk.yellow("\n⚠️  Backend integration to be implemented.")
          );
        } else {
          console.log(chalk.blue("Creation cancelled."));
        }
      } catch (error) {
        console.error(chalk.red("Create command failed:"), error);
        process.exit(1);
      }
    });
}
