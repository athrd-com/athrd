import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface GitHookState {
  managedByAthrd: true;
  updatedGlobalHooksPath: boolean;
  previousHooksPath: string | null;
  targetHooksPath: string;
  backupHookPath: string | null;
}

function getAthrdDir(): string {
  if (process.env.ATHRD_HOME) {
    return process.env.ATHRD_HOME;
  }
  return path.join(os.homedir(), ".athrd");
}

function getGlobalHooksDir(): string {
  return path.join(getAthrdDir(), "git-hooks");
}

function getCommitMsgHookPath(): string {
  return path.join(getGlobalHooksDir(), "commit-msg");
}

function getStatePath(): string {
  return path.join(getGlobalHooksDir(), "state.json");
}

function getCommitMsgHookPathForDir(hooksDir: string): string {
  return path.join(hooksDir, "commit-msg");
}

function pathsEqual(left: string | null, right: string | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return path.resolve(left) === path.resolve(right);
}

function getCurrentGlobalHooksPath(): string | null {
  try {
    const value = execFileSync(
      "git",
      ["config", "--global", "--get", "core.hooksPath"],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      },
    ).trim();
    return value || null;
  } catch {
    return null;
  }
}

function getRepoRoot(cwd?: string): string | null {
  try {
    const value = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return value || null;
  } catch {
    return null;
  }
}

function getLocalHooksPath(cwd?: string): string | null {
  try {
    const value = execFileSync(
      "git",
      ["config", "--local", "--get", "core.hooksPath"],
      {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      },
    ).trim();
    return value || null;
  } catch {
    return null;
  }
}

function setGlobalHooksPath(hooksPath: string): void {
  execFileSync("git", ["config", "--global", "core.hooksPath", hooksPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function unsetGlobalHooksPath(): void {
  execFileSync("git", ["config", "--global", "--unset", "core.hooksPath"], {
    stdio: ["pipe", "pipe", "ignore"],
  });
}

function loadState(): GitHookState | null {
  const statePath = getStatePath();
  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (parsed?.managedByAthrd === true) {
      return {
        managedByAthrd: true,
        updatedGlobalHooksPath: parsed.updatedGlobalHooksPath === true,
        previousHooksPath:
          typeof parsed.previousHooksPath === "string"
            ? parsed.previousHooksPath
            : null,
        targetHooksPath:
          typeof parsed.targetHooksPath === "string"
            ? parsed.targetHooksPath
            : getGlobalHooksDir(),
        backupHookPath:
          typeof parsed.backupHookPath === "string" ? parsed.backupHookPath : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveState(state: GitHookState): void {
  fs.mkdirSync(getGlobalHooksDir(), { recursive: true });
  fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
}

function removeState(): void {
  const statePath = getStatePath();
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
}

function isAthrdManagedHook(hookPath: string): boolean {
  if (!fs.existsSync(hookPath)) {
    return false;
  }
  try {
    const content = fs.readFileSync(hookPath, "utf-8");
    return content.includes("# ATHRD_MANAGED_COMMIT_MSG");
  } catch {
    return false;
  }
}

function toBashSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function getCommitMsgHookScriptContent(backupHookPath: string | null): string {
  const backupHookValue = backupHookPath ? toBashSingleQuoted(backupHookPath) : "''";
  return `#!/bin/bash
# ATHRD_MANAGED_COMMIT_MSG
MSG_FILE="$1"
TRAILER_KEY="Agent-Session:"
BACKUP_HOOK=${backupHookValue}

if [ -z "$MSG_FILE" ] || [ ! -f "$MSG_FILE" ]; then
  exit 0
fi

run_hook_if_present() {
  HOOK_PATH="$1"
  if [ -z "$HOOK_PATH" ] || [ ! -x "$HOOK_PATH" ]; then
    return 0
  fi

  HOOK_REAL=$(realpath "$HOOK_PATH" 2>/dev/null || echo "$HOOK_PATH")
  SELF_REAL=$(realpath "$0" 2>/dev/null || echo "$0")
  if [ "$HOOK_REAL" = "$SELF_REAL" ]; then
    return 0
  fi

  "$HOOK_PATH" "$@"
  return $?
}

if [ -n "$BACKUP_HOOK" ]; then
  run_hook_if_present "$BACKUP_HOOK" "$@"
  BACKUP_STATUS=$?
  if [ $BACKUP_STATUS -ne 0 ]; then
    exit $BACKUP_STATUS
  fi
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

LEGACY_HOOK="$REPO_ROOT/.git/hooks/commit-msg"
run_hook_if_present "$LEGACY_HOOK" "$@"
LEGACY_STATUS=$?
if [ $LEGACY_STATUS -ne 0 ]; then
  exit $LEGACY_STATUS
fi

CONFIG_FILE="$REPO_ROOT/.athrdrc"
if [ -f "$CONFIG_FILE" ]; then
  HOOK_SETTING=$(awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      eq = index($0, "=")
      if (eq == 0) next
      key = substr($0, 1, eq - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key != "disabled") next

      value = substr($0, eq + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
    }
  ' "$CONFIG_FILE" | tail -n 1 | tr '[:upper:]' '[:lower:]')

  case "$HOOK_SETTING" in
    true|1|yes|on)
      exit 0
      ;;
  esac
fi

MARKER_FILE="$REPO_ROOT/.agent-session-marker"
if [ ! -s "$MARKER_FILE" ]; then
  exit 0
fi

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t athrd-hook)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

URLS_FILE="$TMP_DIR/urls.txt"
EXISTING_FILE="$TMP_DIR/existing_trailers.txt"
COMBINED_FILE="$TMP_DIR/combined_trailers.txt"
NEW_TRAILERS_FILE="$TMP_DIR/new_trailers.txt"
STRIPPED_MSG_FILE="$TMP_DIR/stripped_message.txt"
OUT_FILE="$TMP_DIR/message.out"

awk '{
  line=$0
  gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
  if (line != "") print line
}' "$MARKER_FILE" | awk '!seen[$0]++' > "$URLS_FILE"

if [ ! -s "$URLS_FILE" ]; then
  : > "$MARKER_FILE"
  exit 0
fi

if ! awk -v key="$TRAILER_KEY" '
  index($0, key) == 1 {
    line = substr($0, length(key) + 1)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
    if (line != "") print line
  }
' "$MSG_FILE" | awk '!seen[$0]++' > "$EXISTING_FILE"; then
  exit 1
fi

cat "$EXISTING_FILE" "$URLS_FILE" | awk '!seen[$0]++' > "$COMBINED_FILE"

if [ -s "$EXISTING_FILE" ]; then
  grep -Fvxf "$EXISTING_FILE" "$COMBINED_FILE" > "$NEW_TRAILERS_FILE" || true
else
  cp "$COMBINED_FILE" "$NEW_TRAILERS_FILE"
fi

# Nothing new to add; clear marker and exit.
if [ ! -s "$NEW_TRAILERS_FILE" ]; then
  : > "$MARKER_FILE"
  exit 0
fi

if ! awk -v key="$TRAILER_KEY" '
  index($0, key) == 1 { next }
  { print }
' "$MSG_FILE" > "$STRIPPED_MSG_FILE"; then
  exit 1
fi

cp "$STRIPPED_MSG_FILE" "$OUT_FILE"
if [ -s "$OUT_FILE" ]; then
  printf "\\n" >> "$OUT_FILE"
fi

if [ -s "$EXISTING_FILE" ]; then
  while IFS= read -r line; do
    printf "%s %s\\n" "$TRAILER_KEY" "$line" >> "$OUT_FILE"
  done < "$EXISTING_FILE"
fi

while IFS= read -r line; do
  printf "%s %s\\n" "$TRAILER_KEY" "$line" >> "$OUT_FILE"
done < "$NEW_TRAILERS_FILE"

mv "$OUT_FILE" "$MSG_FILE"
: > "$MARKER_FILE"
exit 0
`;
}

function writeCommitMsgHook(
  hooksDir: string,
  backupHookPath: string | null,
): void {
  const hookPath = getCommitMsgHookPathForDir(hooksDir);
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(hookPath, getCommitMsgHookScriptContent(backupHookPath), {
    mode: 0o755,
  });
}

export function installGlobalCommitMsgHook(): void {
  const globalHooksDir = getGlobalHooksDir();
  const currentHooksPath = getCurrentGlobalHooksPath();
  const state = loadState();
  let updatedGlobalHooksPath = false;
  let previousHooksPath: string | null = null;
  let targetHooksPath = currentHooksPath ?? globalHooksDir;
  let backupHookPath: string | null = null;

  if (state?.managedByAthrd) {
    writeCommitMsgHook(state.targetHooksPath, state.backupHookPath);
    if (!pathsEqual(currentHooksPath, state.targetHooksPath)) {
      setGlobalHooksPath(state.targetHooksPath);
    }
    return;
  }

  if (!currentHooksPath) {
    setGlobalHooksPath(globalHooksDir);
    updatedGlobalHooksPath = true;
    previousHooksPath = null;
    targetHooksPath = globalHooksDir;
  }

  const targetHookPath = getCommitMsgHookPathForDir(targetHooksPath);
  if (fs.existsSync(targetHookPath) && !isAthrdManagedHook(targetHookPath)) {
    backupHookPath = `${targetHookPath}.athrd-backup-${Date.now()}`;
    fs.renameSync(targetHookPath, backupHookPath);
  }

  writeCommitMsgHook(targetHooksPath, backupHookPath);

  saveState({
    managedByAthrd: true,
    updatedGlobalHooksPath,
    previousHooksPath,
    targetHooksPath,
    backupHookPath,
  });
}

export function uninstallGlobalCommitMsgHook(): void {
  const globalHooksDir = getGlobalHooksDir();
  const state = loadState();
  const currentHooksPath = getCurrentGlobalHooksPath();

  if (state?.managedByAthrd) {
    const hookPath = getCommitMsgHookPathForDir(state.targetHooksPath);
    if (fs.existsSync(hookPath) && isAthrdManagedHook(hookPath)) {
      fs.unlinkSync(hookPath);
    }

    if (state.backupHookPath && fs.existsSync(state.backupHookPath)) {
      fs.renameSync(state.backupHookPath, hookPath);
    }

    if (state.updatedGlobalHooksPath && currentHooksPath === globalHooksDir) {
      if (state.previousHooksPath) {
        setGlobalHooksPath(state.previousHooksPath);
      } else {
        try {
          unsetGlobalHooksPath();
        } catch {
          // Ignore missing key
        }
      }
    }
    removeState();
  }

  if (
    fs.existsSync(globalHooksDir) &&
    fs.readdirSync(globalHooksDir).length === 0
  ) {
    fs.rmdirSync(globalHooksDir);
  }
}

export function ensureRepoCommitMsgHookCompatibility(cwd?: string): void {
  const repoRoot = getRepoRoot(cwd);
  if (!repoRoot) {
    return;
  }

  const localHooksPath = getLocalHooksPath(cwd);
  if (!localHooksPath) {
    return;
  }

  const resolvedHooksDir = path.isAbsolute(localHooksPath)
    ? localHooksPath
    : path.resolve(repoRoot, localHooksPath);

  const hookPath = getCommitMsgHookPathForDir(resolvedHooksDir);
  if (isAthrdManagedHook(hookPath)) {
    return;
  }

  let backupHookPath: string | null = null;
  if (fs.existsSync(hookPath)) {
    backupHookPath = `${hookPath}.athrd-backup-${Date.now()}`;
    fs.renameSync(hookPath, backupHookPath);
  }

  writeCommitMsgHook(resolvedHooksDir, backupHookPath);
}
