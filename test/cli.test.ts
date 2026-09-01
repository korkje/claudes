import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// spawns the built CLI without a TTY, so this covers the non-interactive
// path: automatic account resolution and arg passthrough to claude
const distEntry = join(process.cwd(), "dist", "index.js");
const binDir = join(homedir(), "stub-bin");
const projDir = join(homedir(), "proj");

function runCli(args: string[], cwd: string, env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [distEntry, ...args], {
        cwd,
        encoding: "utf8",
        env: {
            ...process.env,
            HOME: homedir(),
            PATH: `${binDir}:${process.env.PATH}`,
            ...env,
        },
    });
}

beforeAll(() => {
    if (!existsSync(distEntry)) {
        throw new Error("dist/index.js missing — run npm run build first (npm test does this via pretest)");
    }
    mkdirSync(binDir, { recursive: true });
    const stub = join(binDir, "claude");
    writeFileSync(stub, '#!/bin/sh\necho "CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-<unset>} args=$*"\nexit 7\n');
    chmodSync(stub, 0o755);
    mkdirSync(projDir, { recursive: true });
    mkdirSync(join(homedir(), ".claude-personal"), { recursive: true });
    writeFileSync(join(homedir(), ".claudes.json"), JSON.stringify({ basePaths: { "~/proj": "personal" } }));
});

describe("non-TTY launch", () => {
    it("uses the base path match and passes args through, propagating the exit code", () => {
        const result = runCli(["--", "--print", "hi"], projDir);
        expect(result.stdout).toContain(join(homedir(), ".claude-personal"));
        expect(result.stdout).toContain("args=--print hi");
        expect(result.status).toBe(7);
    });

    it("falls back to the default account and clears an inherited CLAUDE_CONFIG_DIR", () => {
        const result = runCli([], homedir(), { CLAUDE_CONFIG_DIR: "/leftover" });
        expect(result.stdout).toContain("CLAUDE_CONFIG_DIR=<unset>");
        expect(result.status).toBe(7);
    });
});

describe("argument handling", () => {
    it("rejects unexpected arguments", () => {
        const result = runCli(["list"], homedir());
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("unexpected argument");
    });

    it("prints help", () => {
        const result = runCli(["--help"], homedir());
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("multi-account launcher");
    });
});

describe("signals while claude runs", () => {
    // a stub claude that reports when it starts and how it was stopped;
    // "sleep & wait" so the TERM trap fires immediately instead of after sleep
    const stub = join(binDir, "claude");
    const trapStub = [
        "#!/bin/sh",
        "trap 'echo got-term; exit 3' TERM",
        "echo started",
        "sleep 10 & wait $!",
        "",
    ].join("\n");
    const plainStub = '#!/bin/sh\necho "CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-<unset>} args=$*"\nexit 7\n';

    it("survives a SIGINT of its own and forwards SIGTERM to claude", async () => {
        writeFileSync(stub, trapStub);
        try {
            const child = spawn(process.execPath, [distEntry], {
                cwd: homedir(),
                env: { ...process.env, HOME: homedir(), PATH: `${binDir}:${process.env.PATH}` },
                stdio: ["pipe", "pipe", "pipe"],
            });
            let stdout = "";
            child.stdout.on("data", chunk => { stdout += chunk; });
            const exited = new Promise<number | null>(resolve => child.on("exit", code => resolve(code)));
            await vi.waitFor(() => expect(stdout).toContain("started"));

            child.kill("SIGINT");
            await new Promise(resolve => setTimeout(resolve, 300));
            expect(child.exitCode).toBeNull();

            child.kill("SIGTERM");
            expect(await exited).toBe(3);
            expect(stdout).toContain("got-term");
        } finally {
            writeFileSync(stub, plainStub);
        }
    });
});
