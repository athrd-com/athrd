import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface GitHookState {
  managedByAthrd: true;
  previousHooksPath: string | null;
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
        previousHooksPath:
          typeof parsed.previousHooksPath === "string"
            ? parsed.previousHooksPath
            : null,
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

function getCommitMsgHookScriptContent(): string {
  return `#!/bin/bash
MSG_FILE="$1"
TRAILER_KEY="Agent-Session:"

if [ -z "$MSG_FILE" ] || [ ! -f "$MSG_FILE" ]; then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$REPO_ROOT" ]; then
  exit 0
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
      if (key != "commit_msg_hook") next

      value = substr($0, eq + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
    }
  ' "$CONFIG_FILE" | tail -n 1 | tr '[:upper:]' '[:lower:]')

  case "$HOOK_SETTING" in
    false|0|no|off)
      exit 0
      ;;
  esac
fi

LEGACY_HOOK="$REPO_ROOT/.git/hooks/commit-msg"
SELF_PATH="$0"

if [ -x "$LEGACY_HOOK" ]; then
  LEGACY_REAL=$(realpath "$LEGACY_HOOK" 2>/dev/null || echo "$LEGACY_HOOK")
  SELF_REAL=$(realpath "$SELF_PATH" 2>/dev/null || echo "$SELF_PATH")
  if [ "$LEGACY_REAL" != "$SELF_REAL" ]; then
    "$LEGACY_HOOK" "$@"
    LEGACY_STATUS=$?
    if [ $LEGACY_STATUS -ne 0 ]; then
      exit $LEGACY_STATUS
    fi
  fi
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

function writeCommitMsgHook(): void {
  const hooksDir = getGlobalHooksDir();
  const hookPath = getCommitMsgHookPath();
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(hookPath, getCommitMsgHookScriptContent(), { mode: 0o755 });
}

export function installGlobalCommitMsgHook(): void {
  const globalHooksDir = getGlobalHooksDir();
  const currentHooksPath = getCurrentGlobalHooksPath();
  const state = loadState();

  writeCommitMsgHook();

  if (state?.managedByAthrd) {
    if (currentHooksPath !== globalHooksDir) {
      setGlobalHooksPath(globalHooksDir);
    }
    return;
  }

  saveState({
    managedByAthrd: true,
    previousHooksPath:
      currentHooksPath && currentHooksPath !== globalHooksDir
        ? currentHooksPath
        : null,
  });

  if (currentHooksPath !== globalHooksDir) {
    setGlobalHooksPath(globalHooksDir);
  }
}

export function uninstallGlobalCommitMsgHook(): void {
  const globalHooksDir = getGlobalHooksDir();
  const hookPath = getCommitMsgHookPath();
  const state = loadState();
  const currentHooksPath = getCurrentGlobalHooksPath();

  if (state?.managedByAthrd) {
    if (currentHooksPath === globalHooksDir) {
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

  if (fs.existsSync(hookPath)) {
    fs.unlinkSync(hookPath);
  }

  const hooksDir = getGlobalHooksDir();
  if (fs.existsSync(hooksDir) && fs.readdirSync(hooksDir).length === 0) {
    fs.rmdirSync(hooksDir);
  }
}
