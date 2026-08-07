# @korkje/claudes

[![npm](https://img.shields.io/npm/v/%40korkje%2Fclaudes)](https://www.npmjs.com/package/@korkje/claudes)

Multi-account launcher for [Claude Code](https://claude.com/claude-code). Keeps any number of independent Claude Code configurations (accounts, settings, history) in `~/.claude-<name>` folders and launches `claude` with `CLAUDE_CONFIG_DIR` pointing at the one you pick.

## Install

```sh
npm install -g @korkje/claudes
```

Requires `claude` on your PATH.

## Usage

```sh
claudes            # interactive UI
claudes -- -r      # skip the UI: auto-resolve the account, pass args to claude
```

Everything is managed from the interactive UI:

| Key | Action |
| --- | --- |
| `↑`/`↓` or `j`/`k` | move |
| `enter` | launch the selected account, or create one via the `+ new account` row |
| `d` | delete account (asks for confirmation) |
| `p` | manage base paths |
| `q` / `esc` | quit |

Your regular `~/.claude` appears as `default (~/.claude)` — listed first (when the folder exists) and impossible to delete. The list preselects the base path match for your working directory, or else the top entry.

## Base paths

The `p` screen maps directories to accounts, so starting `claudes` inside a mapped directory preselects that account (longest match wins) and auto-launches it after a short countdown — navigating or using a shortcut cancels (unbound keys are ignored). Add a mapping with `a` — the directory input defaults to your cwd — then pick the account for it. Remove one with `d`.

## Replacing `claude`

To route plain `claude` through claudes, press `a` in the UI — an interactive toggle that adds/removes the alias in the startup file of your shell (zsh, bash, or fish). It's equivalent to adding this to your `.zshrc`/`.bashrc` yourself:

```sh
alias claude="claudes --"
```

Bare `claude` opens the UI; `claude -r`, `claude --model opus`, etc. skip it, auto-resolve the account (base path match → default), and pass everything through — so `claude` inside a mapped directory silently uses the right account. Since aliases only exist in your interactive shell, IDE integrations and scripts that spawn `claude` still get the real CLI (as does claudes itself — no recursion). For claudes' own help/version, call the unaliased `claudes -h`.

## Non-interactive use

When stdin is not a TTY (pipes, scripts), `claudes` likewise skips the UI and auto-resolves the account.

## Development

`npm test` builds the CLI and runs the vitest suite: unit tests for the config/account/shell logic, Ink component tests that drive the real UI through a fake terminal, and CLI tests against the built bundle with a stubbed `claude`.

## Config

Base path mappings live in `~/.claudes.json`:

```json
{
  "basePaths": {
    "~/Documents/dev/personal": "personal"
  }
}
```
