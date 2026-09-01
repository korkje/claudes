import { readFileSync } from "node:fs";

const REGISTRY_URL = "https://registry.npmjs.org/@korkje%2Fclaudes/latest";

// what package.json carries in git; releases stamp the real version from
// the release tag at publish time
const DEV_VERSION = "0.0.0-dev";

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

// resolves with the latest published version if it is newer than this one,
// null otherwise — including on any network problem (the check is a hint,
// never an error) and for dev builds, which have no version to compare
export async function checkForUpdate(): Promise<string | null> {
    if (isDevBuild()) return null;
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
