import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CodexProvider } from "../providers/codex.js";
import { createProviderInstallContext } from "./hooks.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
let logSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;

function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

function readHooksJson(home: string): any {
    return JSON.parse(readFileSync(join(home, ".codex", "hooks.json"), "utf-8"));
}

async function installCodexHook() {
    const provider = new CodexProvider();
    await provider.install(createProviderInstallContext());
}

async function uninstallCodexHook() {
    const provider = new CodexProvider();
    await provider.uninstall(createProviderInstallContext());
}

beforeEach(() => {
    const home = makeTempDir("athrd-codex-hooks-home-");
    process.env.HOME = home;
    mkdirSync(join(home, ".codex"), { recursive: true });
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    process.env.HOME = originalHome;
    logSpy.mockRestore();
    errorSpy.mockRestore();

    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir) {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});

describe("Codex hook install", () => {
    test("writes a Stop hook to hooks.json", async () => {
        const home = process.env.HOME!;

        await installCodexHook();

        const config = readHooksJson(home);
        expect(config).toEqual({
            hooks: {
                Stop: [
                    {
                        hooks: [
                            {
                                type: "command",
                                command: `bash '${join(home, ".athrd", "hook.sh")}' codex`,
                                timeout: 30,
                            },
                        ],
                    },
                ],
            },
        });
    });

    test("preserves existing hooks and does not duplicate the athrd hook", async () => {
        const home = process.env.HOME!;
        writeFileSync(
            join(home, ".codex", "hooks.json"),
            JSON.stringify(
                {
                    hooks: {
                        Stop: [
                            {
                                hooks: [
                                    {
                                        type: "command",
                                        command: "echo keep",
                                    },
                                ],
                            },
                        ],
                        PreToolUse: [
                            {
                                matcher: "Bash",
                                hooks: [{ type: "command", command: "echo bash" }],
                            },
                        ],
                    },
                },
                null,
                2,
            ),
        );

        await installCodexHook();
        await installCodexHook();

        const config = readHooksJson(home);
        const stopHooks = config.hooks.Stop.flatMap((group: any) => group.hooks);
        const athrdHooks = stopHooks.filter((hook: any) =>
            typeof hook.command === "string" &&
            hook.command.includes("hook.sh") &&
            hook.command.endsWith(" codex"),
        );

        expect(config.hooks.PreToolUse).toHaveLength(1);
        expect(stopHooks.some((hook: any) => hook.command === "echo keep")).toBe(true);
        expect(athrdHooks).toHaveLength(1);
    });
});

describe("Codex hook uninstall", () => {
    test("removes only the athrd Codex Stop hook", async () => {
        const home = process.env.HOME!;
        writeFileSync(
            join(home, ".codex", "hooks.json"),
            JSON.stringify(
                {
                    hooks: {
                        Stop: [
                            {
                                hooks: [
                                    {
                                        type: "command",
                                        command: `bash '${join(home, ".athrd", "hook.sh")}' codex`,
                                        timeout: 30,
                                    },
                                ],
                            },
                            {
                                hooks: [
                                    {
                                        type: "command",
                                        command: "echo keep",
                                    },
                                ],
                            },
                        ],
                    },
                },
                null,
                2,
            ),
        );

        await uninstallCodexHook();

        expect(readHooksJson(home)).toEqual({
            hooks: {
                Stop: [
                    {
                        hooks: [
                            {
                                type: "command",
                                command: "echo keep",
                            },
                        ],
                    },
                ],
            },
        });
    });
});
