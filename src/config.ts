import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
    // absolute (or ~-prefixed) base path -> account name
    basePaths?: Record<string, string>;
}

export const configPath = join(homedir(), ".claudes.json");

export function loadConfig(): Config {
    try {
        const parsed = JSON.parse(readFileSync(configPath, "utf8"));
        // only known fields survive, so stale keys (e.g. the old "current")
        // get dropped on the next save
        return { basePaths: parsed.basePaths };
    } catch {
        return {};
    }
}

export function saveConfig(config: Config): void {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function expandTilde(path: string): string {
    if (path === "~") return homedir();
    if (path.startsWith("~/")) return join(homedir(), path.slice(2));
    return path;
}

export function contractTilde(path: string): string {
    const home = homedir();
    if (path === home) return "~";
    if (path.startsWith(home + "/")) return "~" + path.slice(home.length);
    return path;
}
