import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { loadConfig } from "../src/config.js";

const delay = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

beforeEach(() => {
    for (const entry of readdirSync(homedir())) {
        rmSync(join(homedir(), entry), { recursive: true, force: true });
    }
});

function renderApp(props: { countdownSeconds?: number; checkUpdate?: () => Promise<string | null> } = {}) {
    const onLaunch = vi.fn();
    const app = render(<App onLaunch={onLaunch} checkUpdate={async () => null} {...props} />);
    return { ...app, onLaunch };
}

describe("account list", () => {
    it("shows the labeled default first, accounts, and the create row", async () => {
        mkdirSync(join(homedir(), ".claude"));
        mkdirSync(join(homedir(), ".claude-work"));
        const { lastFrame, unmount } = renderApp();
        await delay();
        const frame = lastFrame()!;
        expect(frame).toContain("default (~/.claude)");
        expect(frame).toContain("work");
        expect(frame).toContain("+ new account");
        expect(frame.indexOf("default")).toBeLessThan(frame.indexOf("work"));
        unmount();
    });

    it("launches the selected account on enter", async () => {
        mkdirSync(join(homedir(), ".claude"));
        mkdirSync(join(homedir(), ".claude-work"));
        const { stdin, onLaunch, unmount } = renderApp();
        await delay();
        stdin.write("j");
        await delay();
        stdin.write("\r");
        await delay();
        expect(onLaunch).toHaveBeenCalledWith("work");
        unmount();
    });
});

describe("create", () => {
    it("creates an account from the create row and returns to the list", async () => {
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("\r"); // only row is "+ new account" — becomes an input
        await delay();
        expect(lastFrame()).toContain("↵ apply");
        stdin.write("work\r");
        await delay();
        expect(existsSync(join(homedir(), ".claude-work"))).toBe(true);
        expect(lastFrame()).toContain("Created ~/.claude-work");
        expect(lastFrame()).toContain("Select account");
        unmount();
    });

    it("rejects duplicate and invalid names inline", async () => {
        mkdirSync(join(homedir(), ".claude-work"));
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("j"); // from "work" to the create row
        await delay();
        stdin.write("\r");
        await delay();
        stdin.write("work\r");
        await delay();
        expect(lastFrame()).toContain("already exists");
        unmount();
    });
});

describe("delete", () => {
    it("deletes an account after confirmation and cleans up its mappings", async () => {
        mkdirSync(join(homedir(), ".claude-work"));
        writeFileSync(
            join(homedir(), ".claudes.json"),
            JSON.stringify({ basePaths: { "~/dev": "work", "~/other": "personal" } }),
        );
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("d");
        await delay();
        expect(lastFrame()).toContain('Delete "work"');
        stdin.write("y");
        await delay();
        expect(existsSync(join(homedir(), ".claude-work"))).toBe(false);
        expect(lastFrame()).toContain("Removed ~/.claude-work");
        expect(loadConfig().basePaths).toEqual({ "~/other": "personal" });
        unmount();
    });

    it("keeps the account when the confirmation is declined", async () => {
        mkdirSync(join(homedir(), ".claude-work"));
        const { stdin, unmount } = renderApp();
        await delay();
        stdin.write("d");
        await delay();
        stdin.write("n");
        await delay();
        expect(existsSync(join(homedir(), ".claude-work"))).toBe(true);
        unmount();
    });

    it("refuses to delete the default account", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("d");
        await delay();
        expect(lastFrame()).toContain("cannot be deleted");
        unmount();
    });
});

describe("base paths", () => {
    it("p expands and collapses an account's paths inline", async () => {
        mkdirSync(join(homedir(), ".claude"));
        writeFileSync(
            join(homedir(), ".claudes.json"),
            JSON.stringify({ basePaths: { "~/dev": "~/.claude" } }),
        );
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        expect(lastFrame()).not.toContain("~/dev");
        stdin.write("p");
        await delay();
        expect(lastFrame()).toContain("~/dev");
        expect(lastFrame()).toContain("+ add path");
        stdin.write("p");
        await delay();
        expect(lastFrame()).not.toContain("~/dev");
        expect(lastFrame()).not.toContain("+ add path");
        unmount();
    });

    it("adds a mapping for the cwd to the expanded account", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("p");
        await delay();
        stdin.write("j"); // onto the indented "+ add path" row
        await delay();
        stdin.write("\r");
        await delay();
        expect(lastFrame()).toContain(process.cwd()); // inline input, cwd prefilled
        stdin.write("\r"); // accept prefilled cwd — assigns to that account
        await delay();
        expect(loadConfig().basePaths).toEqual({ [process.cwd()]: "~/.claude" });
        expect(lastFrame()).toContain("Select account");
        expect(lastFrame()).toContain(process.cwd()); // visible under the account
        unmount();
    });

    it("esc leaves the path input, then quits from the list", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const ESC = "\u001B";
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("p");
        await delay();
        stdin.write("j");
        await delay();
        stdin.write("\r");
        await delay();
        expect(lastFrame()).toContain(process.cwd()); // inline input open
        stdin.write(ESC); // esc -> cancel the inline input
        await delay(600); // lone escape can be held briefly by the input parser
        expect(lastFrame()).not.toContain(process.cwd());
        expect(lastFrame()).toContain("+ add path"); // row restored
        stdin.write("p"); // collapse again (cursor is within the account's rows)
        await delay();
        expect(lastFrame()).not.toContain("+ add path");
        stdin.write(ESC); // esc on the list -> quit
        await delay(600);
        stdin.write("p"); // exited: input is no longer handled
        await delay();
        expect(lastFrame()).not.toContain("+ add path");
        unmount();
    });

    it("right/left arrows expand and collapse (undocumented)", async () => {
        mkdirSync(join(homedir(), ".claude"));
        writeFileSync(
            join(homedir(), ".claudes.json"),
            JSON.stringify({ basePaths: { "~/dev": "~/.claude" } }),
        );
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("[C"); // right -> open
        await delay();
        expect(lastFrame()).toContain("~/dev");
        stdin.write("[B"); // down onto the path row
        await delay();
        stdin.write("[D"); // left -> close from a child row
        await delay();
        expect(lastFrame()).not.toContain("~/dev");
        expect(lastFrame()).not.toContain("← close"); // hint stays undocumented
        unmount();
    });

    it("lists a mapping to a missing account, refuses to launch it, and d drops the mappings", async () => {
        mkdirSync(join(homedir(), ".claude"));
        writeFileSync(
            join(homedir(), ".claudes.json"),
            JSON.stringify({ basePaths: { "~/dev": "gone", "~/other": "gone", "~/mine": "~/.claude" } }),
        );
        const { stdin, lastFrame, onLaunch, unmount } = renderApp();
        await delay();
        expect(lastFrame()).toContain("gone (folder missing)");
        stdin.write("j"); // onto the missing account
        await delay();
        stdin.write("p");
        await delay();
        expect(lastFrame()).toContain("~/dev");
        expect(lastFrame()).toContain("~/other");
        stdin.write("\r");
        await delay();
        expect(onLaunch).not.toHaveBeenCalled();
        expect(lastFrame()).toContain("~/.claude-gone does not exist");
        stdin.write("d");
        await delay();
        expect(lastFrame()).toContain('Dropped 2 mappings to "gone"');
        expect(lastFrame()).not.toContain("gone (folder missing)");
        expect(loadConfig().basePaths).toEqual({ "~/mine": "~/.claude" });
        unmount();
    });

    it("says when adding a path moves it from another account", async () => {
        mkdirSync(join(homedir(), ".claude"));
        mkdirSync(join(homedir(), ".claude-work"));
        writeFileSync(
            join(homedir(), ".claudes.json"),
            JSON.stringify({ basePaths: { [process.cwd()]: "work" } }),
        );
        const { stdin, lastFrame, unmount } = renderApp({ countdownSeconds: 5 });
        await delay();
        stdin.write("k"); // from the preselected "work" up to default (cancels the countdown)
        await delay();
        stdin.write("p"); // expand default
        await delay();
        stdin.write("j"); // onto its "+ add path" row
        await delay();
        stdin.write("\r"); // open the input, prefilled with cwd
        await delay();
        stdin.write("\r"); // accept
        await delay();
        expect(lastFrame()).toContain(`${process.cwd()} → default (~/.claude) (was work)`);
        expect(loadConfig().basePaths).toEqual({ [process.cwd()]: "~/.claude" });
        unmount();
    });

    it("deletes the selected mapping with d", async () => {
        mkdirSync(join(homedir(), ".claude"));
        writeFileSync(
            join(homedir(), ".claudes.json"),
            JSON.stringify({ basePaths: { "~/dev": "~/.claude" } }),
        );
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("p");
        await delay();
        expect(lastFrame()).toContain("~/dev");
        stdin.write("j"); // onto the ~/dev row
        await delay();
        stdin.write("d");
        await delay();
        expect(lastFrame()).not.toContain("~/dev");
        expect(loadConfig().basePaths).toEqual({});
        unmount();
    });
});

describe("countdown", () => {
    function mapCwd(account: string) {
        mkdirSync(join(homedir(), `.claude-${account}`));
        writeFileSync(
            join(homedir(), ".claudes.json"),
            JSON.stringify({ basePaths: { [process.cwd()]: account } }),
        );
    }

    it("auto-launches the path match when it expires", async () => {
        mapCwd("work");
        const { onLaunch, unmount } = renderApp({ countdownSeconds: 0 });
        await delay();
        expect(onLaunch).toHaveBeenCalledWith("work");
        unmount();
    });

    it("shows the countdown on the matched account's row", async () => {
        mapCwd("work");
        const { lastFrame, unmount } = renderApp({ countdownSeconds: 5 });
        await delay();
        expect(lastFrame()).toMatch(/work \(5\) launching…/);
        expect(lastFrame()).not.toContain("(path match)");
        unmount();
    });

    it("is cancelled by navigation, restoring the path match tag", async () => {
        mapCwd("work");
        const { stdin, lastFrame, onLaunch, unmount } = renderApp({ countdownSeconds: 5 });
        await delay();
        expect(lastFrame()).toContain("launching…");
        stdin.write("j");
        await delay();
        expect(lastFrame()).not.toContain("launching…");
        expect(lastFrame()).toContain("(path match)");
        expect(onLaunch).not.toHaveBeenCalled();
        unmount();
    });

    it("ignores unbound keys", async () => {
        mapCwd("work");
        const { stdin, lastFrame, onLaunch, unmount } = renderApp({ countdownSeconds: 5 });
        await delay();
        stdin.write("x");
        await delay();
        expect(lastFrame()).toContain("launching…");
        expect(onLaunch).not.toHaveBeenCalled();
        unmount();
    });

    it("does not start without a path match", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { lastFrame, unmount } = renderApp({ countdownSeconds: 5 });
        await delay();
        expect(lastFrame()).not.toContain("launching…");
        unmount();
    });
});

describe("update check", () => {
    it("shows a notice when a newer version is available", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { lastFrame, unmount } = renderApp({ checkUpdate: async () => "99.0.0" });
        await delay();
        expect(lastFrame()).toContain("update available:");
        expect(lastFrame()).toContain("99.0.0");
        expect(lastFrame()).toContain("npm i -g @korkje/claudes");
        unmount();
    });

    it("shows nothing when up to date", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { lastFrame, unmount } = renderApp();
        await delay();
        expect(lastFrame()).not.toContain("update available:");
        unmount();
    });
});

describe("alias", () => {
    it("toggles the alias from the alias screen", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        expect(lastFrame()).toContain("a alias");
        stdin.write("a");
        await delay();
        expect(lastFrame()).toContain("your shell");
        stdin.write("\r");
        await delay();
        expect(lastFrame()).toContain("Added to ~/.zshrc");
        expect(existsSync(join(homedir(), ".zshrc"))).toBe(true);
        stdin.write("\r");
        await delay();
        expect(lastFrame()).toContain("Removed from ~/.zshrc");
        unmount();
    });

    it("shows the alias hint while the alias is not enabled", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { lastFrame, unmount } = renderApp();
        await delay();
        expect(lastFrame()).toContain("a alias");
        unmount();
    });

    it("hides the alias hint once the alias is enabled for the current shell", async () => {
        mkdirSync(join(homedir(), ".claude"));
        writeFileSync(join(homedir(), ".zshrc"), 'alias claude="claudes --"\n');
        const { lastFrame, unmount } = renderApp();
        await delay();
        expect(lastFrame()).not.toContain("a alias");
        unmount();
    });
});
