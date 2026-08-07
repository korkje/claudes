import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { disableAlias, enableAlias, isAliasEnabled, shellTargets } from "../src/shells.js";

beforeEach(() => {
    for (const entry of readdirSync(homedir())) {
        rmSync(join(homedir(), entry), { recursive: true, force: true });
    }
});

const target = (id: string) => shellTargets().find(t => t.id === id)!;

describe("shellTargets", () => {
    it("targets the expected startup files", () => {
        expect(target("zsh").rcFile).toBe(join(homedir(), ".zshrc"));
        expect(target("fish").rcFile).toBe(join(homedir(), ".config", "fish", "config.fish"));
    });

    it("prefers ~/.bash_profile when it is the only bash startup file", () => {
        expect(target("bash").rcFile).toBe(join(homedir(), ".bashrc"));
        writeFileSync(join(homedir(), ".bash_profile"), "");
        expect(target("bash").rcFile).toBe(join(homedir(), ".bash_profile"));
        writeFileSync(join(homedir(), ".bashrc"), "");
        expect(target("bash").rcFile).toBe(join(homedir(), ".bashrc"));
    });
});

describe("enable/disableAlias", () => {
    it("appends marker and alias, creating the file and directories", () => {
        enableAlias(target("fish"));
        const content = readFileSync(target("fish").rcFile, "utf8");
        expect(content).toBe("# claudes\nalias claude 'claudes --'\n");
        expect(isAliasEnabled(target("fish"))).toBe(true);
    });

    it("preserves existing content, even without a trailing newline", () => {
        const zsh = target("zsh");
        writeFileSync(zsh.rcFile, "export FOO=bar");
        expect(isAliasEnabled(zsh)).toBe(false);
        enableAlias(zsh);
        expect(readFileSync(zsh.rcFile, "utf8"))
            .toBe('export FOO=bar\n# claudes\nalias claude="claudes --"\n');
        disableAlias(zsh);
        expect(readFileSync(zsh.rcFile, "utf8")).toBe("export FOO=bar\n");
        expect(isAliasEnabled(zsh)).toBe(false);
    });

    it("leaves an unrelated claude alias alone", () => {
        const zsh = target("zsh");
        writeFileSync(zsh.rcFile, 'alias claude="my-own-thing"\n');
        expect(isAliasEnabled(zsh)).toBe(false);
        enableAlias(zsh);
        disableAlias(zsh);
        expect(readFileSync(zsh.rcFile, "utf8")).toBe('alias claude="my-own-thing"\n');
    });
});
