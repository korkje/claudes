import { render } from "ink";
import { accountExists, DEFAULT_ACCOUNT, matchBasePath } from "./accounts.js";
import { App } from "./App.js";
import { loadConfig } from "./config.js";
import { launchClaude } from "./launch.js";
import { currentVersion } from "./version.js";

const HELP = `claudes — multi-account launcher for Claude Code

Usage:
  claudes              interactive UI
  claudes -- <args>    interactive UI, launching claude with <args> passed
                       through untouched

The interactive UI picks, creates, and manages accounts, then launches
claude with CLAUDE_CONFIG_DIR pointing at the selected one:

  ↑/↓ or j/k   move
  enter        launch the selected account (or create one via "+ new account")
  d            delete account (asks for confirmation)
  p            manage base paths (directory → account auto-selection)
  q / esc      quit

When stdin is not a TTY (pipes, scripts) the UI is skipped and the account
resolves automatically: the base path match for the working directory, or
else the default.

Tip: pressing a in the UI aliases claude to "claudes --", so plain claude
always goes through the account selector.

Config: ~/.claudes.json · accounts: ~/.claude-<name> · "default (~/.claude)"
is your regular Claude Code config`;

function fail(message: string): never {
    console.error(`claudes: ${message}`);
    process.exit(1);
}

// non-TTY resolution: base path match > default
function resolveAccount(): string {
    const config = loadConfig();
    const matched = matchBasePath(config, process.cwd());
    if (matched && accountExists(matched)) return matched;
    return DEFAULT_ACCOUNT;
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const splitAt = argv.indexOf("--");
    const args = splitAt === -1 ? argv : argv.slice(0, splitAt);
    const claudeArgs = splitAt === -1 ? [] : argv.slice(splitAt + 1);

    for (const arg of args) {
        if (arg === "-h" || arg === "--help") {
            console.log(HELP);
            return;
        }
        if (arg === "-v" || arg === "--version") {
            console.log(currentVersion());
            return;
        }
        fail(`unexpected argument "${arg}" — claudes is interactive, see: claudes --help`);
    }

    if (!process.stdin.isTTY) {
        launchClaude(resolveAccount(), claudeArgs);
        return;
    }

    let selected: string | null = null;
    const { waitUntilExit } = render(<App onLaunch={name => { selected = name; }} />);
    await waitUntilExit();
    if (selected !== null) {
        launchClaude(selected, claudeArgs);
    }
}

await main();
