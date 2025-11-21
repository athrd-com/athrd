import chalk from "chalk";
import { loadCredentials } from "./credentials.js";

export async function requireAuth(): Promise<string> {
  const credentials = await loadCredentials();

  if (!credentials || !credentials.token) {
    console.error(
      chalk.red("❌ You must be authenticated to use this command.")
    );
    console.log(chalk.yellow("Please run: athrd auth"));
    process.exit(1);
  }

  return credentials.token;
}

export async function getToken(): Promise<string | null> {
  const credentials = await loadCredentials();
  return credentials?.token || null;
}
