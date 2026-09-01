import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expandTilde, type Config } from "./config.js";

// sentinel id for ~/.claude — can never collide with a folder-derived name
// since validateName rejects it, and it's what basePaths mappings store
export const DEFAULT_ACCOUNT = "~/.claude";

const PREFIX = ".claude-";

export function accountLabel(name: string): string {
    return name === DEFAULT_ACCOUNT ? "default (~/.claude)" : name;
}

export function accountDir(name: string): string {
    return name === DEFAULT_ACCOUNT
        ? join(homedir(), ".claude")
        : join(homedir(), PREFIX + name);
}

export function accountExists(name: string): boolean {
    return name === DEFAULT_ACCOUNT || existsSync(accountDir(name));
}

// "default" (~/.claude) comes first when it exists; named accounts follow sorted
export function listAccounts(): string[] {
    const hasDefault = existsSync(join(homedir(), ".claude"));
    let entries;
    try {
        entries = readdirSync(homedir(), { withFileTypes: true });
    } catch {
        return hasDefault ? [DEFAULT_ACCOUNT] : [];
    }
    const named = entries
        .filter(e => e.isDirectory() && e.name.startsWith(PREFIX))
        .map(e => e.name.slice(PREFIX.length))
        .filter(Boolean)
        .sort();
    return hasDefault ? [DEFAULT_ACCOUNT, ...named] : named;
}

export function validateName(name: string): string | null {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
        return `Invalid account name "${name}" (use letters, digits, "-", "_")`;
    }
    return null;
}

export function createAccount(name: string): void {
    mkdirSync(accountDir(name), { recursive: true });
}

export function removeAccount(name: string): void {
    if (name === DEFAULT_ACCOUNT) {
        throw new Error("refusing to remove the default account (~/.claude)");
    }
    rmSync(accountDir(name), { recursive: true, force: true });
}

// Longest-prefix match of cwd against configured base paths.
export function matchBasePath(config: Config, cwd: string): string | undefined {
    let best: string | undefined;
    let bestLength = -1;
    const target = resolve(cwd);
    for (const [base, name] of Object.entries(config.basePaths ?? {})) {
        const abs = resolve(expandTilde(base));
        const isMatch = target === abs || target.startsWith(abs + sep);
        if (isMatch && abs.length > bestLength) {
            best = name;
            bestLength = abs.length;
        }
    }
    return best;
}

export interface LoginInfo {
    email: string;
    organization?: string;
}

// Claude Code's state file: ~/.claude.json for the default config dir,
// <dir>/.claude.json for any other CLAUDE_CONFIG_DIR
export function stateFile(name: string): string {
    return name === DEFAULT_ACCOUNT ? join(homedir(), ".claude.json") : join(accountDir(name), ".claude.json");
}

// Who the account is logged in as, from the oauthAccount block of the
// state file. The format is undocumented, so anything unexpected reads as
// "not logged in" (null) rather than an error.
export function loginInfo(name: string): LoginInfo | null {
    try {
        const { oauthAccount } = JSON.parse(readFileSync(stateFile(name), "utf8")) as {
            oauthAccount?: { emailAddress?: unknown; organizationName?: unknown };
        };
        if (typeof oauthAccount?.emailAddress !== "string") return null;
        const organization = oauthAccount.organizationName;
        return {
            email: oauthAccount.emailAddress,
            ...(typeof organization === "string" && organization ? { organization } : {}),
        };
    } catch {
        return null;
    }
}
