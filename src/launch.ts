import { spawn } from "node:child_process";
import { accountDir, DEFAULT_ACCOUNT } from "./accounts.js";

export function launchClaude(name: string, args: string[]): void {
    const env = { ...process.env };
    if (name === DEFAULT_ACCOUNT) {
        delete env.CLAUDE_CONFIG_DIR;
    } else {
        env.CLAUDE_CONFIG_DIR = accountDir(name);
    }

    const child = spawn("claude", args, { stdio: "inherit", env });

    // claudes only wraps claude: it must live exactly as long as the child.
    // A Ctrl+C reaches both processes from the terminal, so ignore it here
    // and let claude decide (it may keep running); a SIGTERM aimed at
    // claudes alone is forwarded so claude does not get orphaned.
    process.on("SIGINT", () => {});
    process.on("SIGTERM", () => { child.kill("SIGTERM"); });

    child.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            console.error("claudes: could not find \"claude\" on your PATH");
        } else {
            console.error(`claudes: failed to launch claude: ${error.message}`);
        }
        process.exit(1);
    });
    child.on("exit", (code, signal) => {
        process.exit(code ?? (signal ? 1 : 0));
    });
}
