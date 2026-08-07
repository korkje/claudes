import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// isolate every test file in a throwaway HOME before any source module
// (which may capture paths at import time) gets loaded; realpath because
// macOS tmpdirs live behind a /var -> /private/var symlink and base path
// matching compares against the child process's resolved cwd
const home = realpathSync(mkdtempSync(join(tmpdir(), "claudes-test-")));
process.env.HOME = home;
process.env.SHELL = "/bin/zsh";
delete process.env.ZDOTDIR;
delete process.env.XDG_CONFIG_HOME;
delete process.env.CLAUDE_CONFIG_DIR;
