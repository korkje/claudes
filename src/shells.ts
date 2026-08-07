import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export interface ShellTarget {
    id: "zsh" | "bash" | "fish";
    rcFile: string;
    aliasLine: string;
}

const MARKER = "# claudes";

function bashRcFile(): string {
    // prefer whichever startup file already exists; fall back to ~/.bashrc
    const bashrc = join(homedir(), ".bashrc");
    const profile = join(homedir(), ".bash_profile");
    if (!existsSync(bashrc) && existsSync(profile)) return profile;
    return bashrc;
}

export function shellTargets(): ShellTarget[] {
    return [
        {
            id: "zsh",
            rcFile: join(process.env.ZDOTDIR || homedir(), ".zshrc"),
            aliasLine: 'alias claude="claudes --"',
        },
        {
            id: "bash",
            rcFile: bashRcFile(),
            aliasLine: 'alias claude="claudes --"',
        },
        {
            id: "fish",
            rcFile: join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "fish", "config.fish"),
            aliasLine: "alias claude 'claudes --'",
        },
    ];
}

export function currentShell(): string {
    return basename(process.env.SHELL ?? "");
}

function isAliasEntry(line: string): boolean {
    return line.includes("alias claude") && line.includes("claudes --");
}

export function isAliasEnabled(target: ShellTarget): boolean {
    try {
        return readFileSync(target.rcFile, "utf8").split("\n").some(isAliasEntry);
    } catch {
        return false;
    }
}

export function enableAlias(target: ShellTarget): void {
    mkdirSync(dirname(target.rcFile), { recursive: true });
    const existing = existsSync(target.rcFile) ? readFileSync(target.rcFile, "utf8") : "";
    const lead = existing === "" || existing.endsWith("\n") ? "" : "\n";
    appendFileSync(target.rcFile, `${lead}${MARKER}\n${target.aliasLine}\n`);
}

export function disableAlias(target: ShellTarget): void {
    if (!existsSync(target.rcFile)) return;
    const lines = readFileSync(target.rcFile, "utf8").split("\n");
    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.trim() === MARKER && i + 1 < lines.length && isAliasEntry(lines[i + 1]!)) {
            i++; // drop marker + alias line
            continue;
        }
        if (isAliasEntry(line)) continue;
        kept.push(line);
    }
    writeFileSync(target.rcFile, kept.join("\n"));
}
