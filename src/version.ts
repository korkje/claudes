import { readFileSync } from "node:fs";

const REGISTRY_URL = "https://registry.npmjs.org/@korkje%2Fclaudes/latest";

let cached: string | undefined;

export function currentVersion(): string {
    cached ??= JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
    return cached!;
}

export function isNewer(candidate: string, current: string): boolean {
    // plain numeric dotted versions; a pre-release suffix ("1.2.0-beta")
    // parses as its numeric prefix, which is close enough for a hint
    const parse = (version: string) => version.split(".").map(part => parseInt(part, 10) || 0);
    const a = parse(candidate);
    const b = parse(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
}

// resolves with the latest published version if it is newer than this one,
// null otherwise — including on any network problem (the check is a hint,
// never an error)
export async function checkForUpdate(): Promise<string | null> {
    try {
        const response = await fetch(REGISTRY_URL, {
            signal: AbortSignal.timeout(3000),
            headers: { accept: "application/json" },
        });
        if (!response.ok) return null;
        const { version } = await response.json() as { version?: unknown };
        return typeof version === "string" && isNewer(version, currentVersion()) ? version : null;
    } catch {
        return null;
    }
}
