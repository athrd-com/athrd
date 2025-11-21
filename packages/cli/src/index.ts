#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import updateNotifier from "update-notifier";
import { fileURLToPath } from "url";
import { authCommand } from "./commands/auth.js";

import { shareCommand } from "./commands/share.js";
import { logoutCommand } from "./commands/logout.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
);

// Check for updates
updateNotifier({ pkg }).notify();

const program = new Command();

program.name("@athrd/cli").description("ATHRD CLI tool").version("1.0.0");

// Register commands
authCommand(program);
logoutCommand(program);
shareCommand(program);


program.parse();
