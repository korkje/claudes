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

function renderApp(props: { countdownSeconds?: number } = {}) {
    const onLaunch = vi.fn();
    const app = render(<App onLaunch={onLaunch} {...props} />);
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
        stdin.write("\r"); // only row is "+ new account"
        await delay();
        expect(lastFrame()).toContain("New account");
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
    it("adds a mapping for the cwd via the paths screen", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { stdin, lastFrame, unmount } = renderApp();
        await delay();
        stdin.write("p");
        await delay();
        expect(lastFrame()).toContain("(none configured)");
        stdin.write("a");
        await delay();
        expect(lastFrame()).toContain(process.cwd());
        stdin.write("\r"); // accept prefilled cwd
        await delay();
        expect(lastFrame()).toContain("Account for");
        stdin.write("\r"); // assign to the first account (default)
        await delay();
        expect(loadConfig().basePaths).toEqual({ [process.cwd()]: "~/.claude" });
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

    it("is cancelled by navigation", async () => {
        mapCwd("work");
        const { stdin, lastFrame, onLaunch, unmount } = renderApp({ countdownSeconds: 5 });
        await delay();
        expect(lastFrame()).toContain("Launching");
        stdin.write("j");
        await delay();
        expect(lastFrame()).not.toContain("Launching");
        expect(onLaunch).not.toHaveBeenCalled();
        unmount();
    });

    it("ignores unbound keys", async () => {
        mapCwd("work");
        const { stdin, lastFrame, onLaunch, unmount } = renderApp({ countdownSeconds: 5 });
        await delay();
        stdin.write("x");
        await delay();
        expect(lastFrame()).toContain("Launching");
        expect(onLaunch).not.toHaveBeenCalled();
        unmount();
    });

    it("does not start without a path match", async () => {
        mkdirSync(join(homedir(), ".claude"));
        const { lastFrame, unmount } = renderApp({ countdownSeconds: 5 });
        await delay();
        expect(lastFrame()).not.toContain("Launching");
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

    it("hides the alias hint when already enabled for the current shell", async () => {
        mkdirSync(join(homedir(), ".claude"));
        writeFileSync(join(homedir(), ".zshrc"), 'alias claude="claudes --"\n');
        const { lastFrame, unmount } = renderApp();
        await delay();
        expect(lastFrame()).not.toContain("a alias");
        unmount();
    });
});
