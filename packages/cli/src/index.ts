#!/usr/bin/env bun

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import updateNotifier from "update-notifier";
import { fileURLToPath } from "url";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { meCommand } from "./commands/me.js";
import { shareCommand } from "./commands/share.js";
import { hooksCommand } from "./commands/hooks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
);

// Check for updates
updateNotifier({ pkg }).notify();

const program = new Command();

program.name("@athrd/cli").description("ATHRD CLI tool").version(pkg.version);

// Register commands
shareCommand(program);
loginCommand(program);
logoutCommand(program);
meCommand(program);
hooksCommand(program);

program.parse();
