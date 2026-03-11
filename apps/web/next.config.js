import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = dirname(dirname(appRoot));

/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: ["pg"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default config;
