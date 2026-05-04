const quietLogLevels = new Set(["silent", "error"]);

const isTruthy = (value) =>
  typeof value === "string" && ["1", "true", "yes"].includes(value.toLowerCase());

const shouldSkip =
  isTruthy(process.env.ATHRD_SKIP_POSTINSTALL) ||
  isTruthy(process.env.CI) ||
  quietLogLevels.has(process.env.npm_config_loglevel || "");

if (!shouldSkip) {
  console.log(`
athrd installed.

Next:
  athrd login

During login, athrd can install hooks for automatic thread syncing.
You can also install hooks later with:
  athrd hooks install
`);
}
