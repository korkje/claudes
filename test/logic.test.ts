import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    accountDir,
    accountLabel,
    createAccount,
    DEFAULT_ACCOUNT,
    listAccounts,
    matchBasePath,
    removeAccount,
    validateName,
} from "../src/accounts.js";
import { contractTilde, expandTilde, loadConfig, saveConfig } from "../src/config.js";
import { checkForUpdate, currentVersion, isDevBuild, isNewer, latestVersion, updateCachePath } from "../src/version.js";

export function resetHome(): void {
    for (const entry of readdirSync(homedir())) {
        rmSync(join(homedir(), entry), { recursive: true, force: true });
    }
}

beforeEach(resetHome);

describe("listAccounts", () => {
    it("is empty when nothing exists", () => {
        expect(listAccounts()).toEqual([]);
    });

    it("puts default first when ~/.claude exists, named accounts sorted after", () => {
        mkdirSync(join(homedir(), ".claude"));
        mkdirSync(join(homedir(), ".claude-work"));
        mkdirSync(join(homedir(), ".claude-alpha"));
        expect(listAccounts()).toEqual([DEFAULT_ACCOUNT, "alpha", "work"]);
    });

    it("omits default when ~/.claude does not exist", () => {
        mkdirSync(join(homedir(), ".claude-work"));
        expect(listAccounts()).toEqual(["work"]);
    });

    it("lists a manually created ~/.claude-default as a normal account", () => {
        mkdirSync(join(homedir(), ".claude"));
        mkdirSync(join(homedir(), ".claude-default"));
        expect(listAccounts()).toEqual([DEFAULT_ACCOUNT, "default"]);
        expect(accountDir("default")).toBe(join(homedir(), ".claude-default"));
        expect(accountDir(DEFAULT_ACCOUNT)).toBe(join(homedir(), ".claude"));
    });
});

describe("accountLabel", () => {
    it("labels the default account with its path", () => {
        expect(accountLabel(DEFAULT_ACCOUNT)).toBe("default (~/.claude)");
        expect(accountLabel("work")).toBe("work");
    });
});

describe("validateName", () => {
    it("accepts simple names, including 'default'", () => {
        expect(validateName("work")).toBeNull();
        expect(validateName("default")).toBeNull();
        expect(validateName("a-b_c2")).toBeNull();
    });

    it("rejects names claudes could not have created", () => {
        expect(validateName("bad name")).not.toBeNull();
        expect(validateName("-lead")).not.toBeNull();
        expect(validateName("")).not.toBeNull();
        expect(validateName("x/y")).not.toBeNull();
    });
});

describe("create/removeAccount", () => {
    it("creates and removes account folders", () => {
        createAccount("work");
        expect(existsSync(join(homedir(), ".claude-work"))).toBe(true);
        removeAccount("work");
        expect(existsSync(join(homedir(), ".claude-work"))).toBe(false);
    });

    it("refuses to remove the default account", () => {
        mkdirSync(join(homedir(), ".claude"));
        expect(() => removeAccount(DEFAULT_ACCOUNT)).toThrow();
        expect(existsSync(join(homedir(), ".claude"))).toBe(true);
    });
});

describe("matchBasePath", () => {
    const config = {
        basePaths: {
            "~/dev": "dev",
            "~/dev/personal": "personal",
        },
    };

    it("matches the longest base path", () => {
        expect(matchBasePath(config, join(homedir(), "dev", "other"))).toBe("dev");
        expect(matchBasePath(config, join(homedir(), "dev", "personal", "x"))).toBe("personal");
    });

    it("matches the base directory itself", () => {
        expect(matchBasePath(config, join(homedir(), "dev"))).toBe("dev");
    });

    it("only matches on path boundaries", () => {
        expect(matchBasePath(config, join(homedir(), "devious"))).toBeUndefined();
    });

    it("returns undefined without mappings", () => {
        expect(matchBasePath({}, homedir())).toBeUndefined();
    });
});

describe("config", () => {
    it("round-trips basePaths", () => {
        saveConfig({ basePaths: { "~/x": "work" } });
        expect(loadConfig()).toEqual({ basePaths: { "~/x": "work" } });
    });

    it("drops unknown keys from older versions", () => {
        writeFileSync(
            join(homedir(), ".claudes.json"),
            JSON.stringify({ current: "work", basePaths: { "~/x": "work" } }),
        );
        expect(loadConfig()).toEqual({ basePaths: { "~/x": "work" } });
    });

    it("returns an empty config for missing or corrupt files", () => {
        expect(loadConfig()).toEqual({});
        writeFileSync(join(homedir(), ".claudes.json"), "not json");
        expect(loadConfig()).toEqual({});
    });

    it("expands and contracts tildes", () => {
        expect(expandTilde("~/a/b")).toBe(join(homedir(), "a", "b"));
        expect(contractTilde(join(homedir(), "a"))).toBe("~/a");
        expect(contractTilde("/other/a")).toBe("/other/a");
    });
});

describe("version", () => {
    it("reads the package version, which is the dev placeholder in git", () => {
        expect(currentVersion()).toMatch(/^\d+\.\d+\.\d+/);
        expect(isDevBuild()).toBe(true);
    });

    it("skips the update check for dev builds without touching the network", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        expect(await checkForUpdate()).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it("compares versions numerically", () => {
        expect(isNewer("0.2.0", "0.1.3")).toBe(true);
        expect(isNewer("0.1.10", "0.1.3")).toBe(true);
        expect(isNewer("1.0.0", "0.9.9")).toBe(true);
        expect(isNewer("0.1.3", "0.1.3")).toBe(false);
        expect(isNewer("0.1.2", "0.1.3")).toBe(false);
    });

    it("ranks a release above its own pre-releases only", () => {
        expect(isNewer("0.2.0", "0.2.0-next.1")).toBe(true);
        expect(isNewer("0.2.0-next.1", "0.2.0")).toBe(false);
        expect(isNewer("0.2.0-next.2", "0.2.0-next.1")).toBe(false);
        expect(isNewer("0.1.9", "0.2.0-next.1")).toBe(false);
        expect(isNewer("0.2.1", "0.2.0-next.1")).toBe(true);
        expect(isNewer("0.1.3.1", "0.1.3")).toBe(true);
    });
});

describe("update check cache", () => {
    const registryAnswer = (version: string) =>
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ version })));
    const hour = 60 * 60 * 1000;

    it("asks the registry once, then reuses the answer for a day", async () => {
        const fetchSpy = registryAnswer("1.2.3");
        const t0 = Date.parse("2026-09-02T10:00:00Z");
        expect(await latestVersion(t0)).toBe("1.2.3");
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(updateCachePath()).toBe(join(homedir(), ".cache", "claudes", "update-check.json"));
        expect(JSON.parse(readFileSync(updateCachePath(), "utf8"))).toEqual({
            checkedAt: "2026-09-02T10:00:00.000Z",
            latest: "1.2.3",
        });

        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ version: "1.2.4" })));
        expect(await latestVersion(t0 + 23 * hour)).toBe("1.2.3");
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        expect(await latestVersion(t0 + 25 * hour)).toBe("1.2.4");
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        fetchSpy.mockRestore();
    });

    it("ignores a malformed cache and does not cache failures", async () => {
        mkdirSync(join(homedir(), ".cache", "claudes"), { recursive: true });
        writeFileSync(updateCachePath(), "not json");
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
        expect(await latestVersion()).toBeNull();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(readFileSync(updateCachePath(), "utf8")).toBe("not json");
        fetchSpy.mockRestore();
    });

    it("honours XDG_CACHE_HOME", () => {
        process.env.XDG_CACHE_HOME = join(homedir(), "xdg-cache");
        try {
            expect(updateCachePath()).toBe(join(homedir(), "xdg-cache", "claudes", "update-check.json"));
        } finally {
            delete process.env.XDG_CACHE_HOME;
        }
    });
});
