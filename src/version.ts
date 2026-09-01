import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const REGISTRY_URL = "https://registry.npmjs.org/@korkje%2Fclaudes/latest";

// what package.json carries in git; releases stamp the real version from
// the release tag at publish time
const DEV_VERSION = "0.0.0-dev";

// how long a registry answer is reused before asking again
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cached: string | undefined;

export function currentVersion(): string {
    cached ??= JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
    return cached!;
}

export function isDevBuild(): boolean {
    return currentVersion() === DEV_VERSION;
}

// MAJOR.MINOR.PATCH plus an optional pre-release suffix ("1.2.0-next.1")
function parse(version: string): { core: number[]; pre: string | undefined } {
    const dash = version.indexOf("-");
    const [core, pre] = dash === -1 ? [version, undefined] : [version.slice(0, dash), version.slice(dash + 1)];
    return { core: core.split(".").map(part => parseInt(part, 10) || 0), pre };
}

export function isNewer(candidate: string, current: string): boolean {
    const a = parse(candidate);
    const b = parse(current);
    for (let i = 0; i < Math.max(a.core.length, b.core.length); i++) {
        const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }
    // same core: the release is newer than any of its pre-releases; two
    // pre-releases are not ordered (the registry's "latest" is never one)
    return b.pre !== undefined && a.pre === undefined;
}

// the last registry answer, so a launch normally costs no network request
export function updateCachePath(): string {
    const cacheHome = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
    return join(cacheHome, "claudes", "update-check.json");
}

interface UpdateCache {
    checkedAt: string; // ISO timestamp
    latest: string;
}

function readCache(now: number): string | null {
    try {
        const { checkedAt, latest } = JSON.parse(readFileSync(updateCachePath(), "utf8")) as Partial<UpdateCache>;
        if (typeof latest !== "string" || typeof checkedAt !== "string") return null;
        const age = now - Date.parse(checkedAt);
        return age >= 0 && age < CACHE_TTL_MS ? latest : null;
    } catch {
        return null;
    }
}

function writeCache(entry: UpdateCache): void {
    try {
        mkdirSync(dirname(updateCachePath()), { recursive: true });
        writeFileSync(updateCachePath(), JSON.stringify(entry, null, 2) + "\n");
    } catch {
        // a read-only or missing cache dir just means asking again next time
    }
}

async function fetchLatest(now: number): Promise<string | null> {
    try {
        const response = await fetch(REGISTRY_URL, {
            signal: AbortSignal.timeout(3000),
            headers: { accept: "application/json" },
        });
        if (!response.ok) return null;
        const { version } = await response.json() as { version?: unknown };
        if (typeof version !== "string") return null;
        writeCache({ checkedAt: new Date(now).toISOString(), latest: version });
        return version;
    } catch {
        return null;
    }
}

// the latest published version: from the cache while it is fresh, else
// from the registry (which refreshes the cache); null when neither answers
export async function latestVersion(now = Date.now()): Promise<string | null> {
    return readCache(now) ?? await fetchLatest(now);
}

// resolves with the latest published version if it is newer than this one,
// null otherwise — including on any network problem (the check is a hint,
// never an error) and for dev builds, which have no version to compare
export async function checkForUpdate(): Promise<string | null> {
    if (isDevBuild()) return null;
    const latest = await latestVersion();
    return latest !== null && isNewer(latest, currentVersion()) ? latest : null;
}
