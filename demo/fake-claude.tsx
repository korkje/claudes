// Stand-in for the real claude binary in demo recordings: fills the
// terminal with a simplified Claude Code-style screen, with no personal
// info (the real binary would show first-run onboarding here anyway,
// since auth is keychain-bound to real config dirs).
import { basename } from "node:path";
import { Box, render, Text, useInput, useStdout } from "ink";

const CORAL = "#de775f";

function contractHome(path: string): string {
    const home = process.env.HOME;
    if (home && path.startsWith(home)) return "~" + path.slice(home.length);
    return path;
}

function FakeClaude() {
    useInput(() => {}); // keep the session open until the recording ends
    const { stdout } = useStdout();
    const dir = basename(process.env.CLAUDE_CONFIG_DIR ?? ".claude");
    const account = dir === ".claude" ? "default" : dir.replace(/^\.claude-/, "");

    return (
        <Box flexDirection="column" height={(stdout?.rows ?? 24) - 1}>
            <Box borderStyle="round" borderColor={CORAL} flexDirection="column" paddingX={1}>
                <Text>
                    <Text color={CORAL}>✳</Text> <Text bold>Welcome to Claude Code!</Text>
                </Text>
                <Text> </Text>
                <Text>
                    <Text dimColor>account:</Text> <Text color="cyan">{account}</Text>
                    <Text dimColor> · Fable 5 · {contractHome(process.cwd())}</Text>
                </Text>
            </Box>
            <Box flexGrow={1} />
            <Box borderStyle="round" borderColor="gray" paddingX={1}>
                <Text color={CORAL}>❯ </Text>
                <Text dimColor>Try "write a test for &lt;filepath&gt;"</Text>
            </Box>
            <Text dimColor>{"  "}? for shortcuts</Text>
        </Box>
    );
}

render(<FakeClaude />);
