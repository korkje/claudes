import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Box, Text, useApp, useInput, type Key } from "ink";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    accountDir,
    accountExists,
    accountLabel,
    createAccount,
    DEFAULT_ACCOUNT,
    listAccounts,
    matchBasePath,
    removeAccount,
    validateName,
} from "./accounts.js";
import { contractTilde, expandTilde, loadConfig, saveConfig, type Config } from "./config.js";
import { currentShell, disableAlias, enableAlias, isAliasEnabled, shellTargets } from "./shells.js";
import { checkForUpdate, currentVersion } from "./version.js";

type Screen =
    | { id: "list" }
    | { id: "confirmDelete"; name: string }
    | { id: "alias" };

// inline editor state: the "+ new account" / "+ add path" row the cursor
// is on turns into a text input
type Editing =
    | { type: "account" }
    | { type: "path"; account: string };

// the account list is a flat list of rows: accounts, and for expanded
// accounts their base paths plus an "+ add path" row, indented below
type Row =
    | { type: "account"; name: string }
    | { type: "path"; base: string; account: string }
    | { type: "addPath"; account: string }
    | { type: "newAccount" };

// accounts that only exist as mapping targets (folder deleted, or never
// created) are listed after the real ones, so their mappings stay visible
// and removable instead of silently doing nothing
function withMissing(accounts: string[], basePaths: Record<string, string>): string[] {
    const missing = [...new Set(Object.values(basePaths))]
        .filter(name => !accounts.includes(name) && !accountExists(name))
        .sort();
    return [...accounts, ...missing];
}

function buildRows(accounts: string[], basePaths: Record<string, string>, expanded: Set<string>): Row[] {
    const rows: Row[] = [];
    for (const name of withMissing(accounts, basePaths)) {
        rows.push({ type: "account", name });
        if (expanded.has(name)) {
            for (const [base, account] of Object.entries(basePaths).sort()) {
                if (account === name) rows.push({ type: "path", base, account });
            }
            rows.push({ type: "addPath", account: name });
        }
    }
    rows.push({ type: "newAccount" });
    return rows;
}

interface MenuAction {
    input: string;
    key: Key;
    index: number;
}

function Menu({ title, items, index, onIndexChange, footer, notice, onAction, isActive = true }: {
    title: string;
    items: ReactNode[];
    index: number;
    onIndexChange: (index: number) => void;
    footer: string;
    notice?: string | null;
    onAction: (action: MenuAction) => void;
    // false while an inline editor owns the keyboard
    isActive?: boolean;
}) {
    useInput((input, key) => {
        const count = items.length;
        if (count > 0 && (key.upArrow || input === "k")) {
            onIndexChange((index - 1 + count) % count);
        } else if (count > 0 && (key.downArrow || input === "j")) {
            onIndexChange((index + 1) % count);
        } else {
            onAction({ input, key, index });
        }
    }, { isActive });

    return (
        <Box flexDirection="column">
            <Text bold>{title}</Text>
            {items.map((item, i) => (
                <Text key={i} color={i === index ? "cyan" : undefined}>
                    {i === index ? "❯ " : "  "}
                    {item}
                </Text>
            ))}
            {notice ? <Text color="yellow">{notice}</Text> : null}
            <Text dimColor>{footer}</Text>
        </Box>
    );
}

function TextInput({ initial = "", onChange, onSubmit, onCancel }: {
    initial?: string;
    onChange?: () => void;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(initial);
    // rapid keystrokes can be processed before a re-render, so the freshest
    // value lives in a ref and state only drives rendering
    const ref = useRef(initial);
    const update = (next: string) => {
        ref.current = next;
        setValue(next);
        onChange?.();
    };

    useInput((input, key) => {
        if (key.escape) {
            onCancel();
        } else if (key.backspace || key.delete) {
            update(ref.current.slice(0, -1));
        } else if (key.return || (input && !key.ctrl && !key.meta)) {
            // input may arrive chunked (e.g. paste) — \r/\n in a chunk means submit
            const next = ref.current + (input ?? "").replace(/[\r\n]/g, "");
            if (key.return || /[\r\n]/.test(input)) {
                update(next);
                onSubmit(next.trim());
            } else {
                update(next);
            }
        }
    });

    return (
        <Text>
            <Text color="cyan">{value}</Text>
            <Text inverse> </Text>
        </Text>
    );
}

function ConfirmScreen({ message, hint, onResult }: {
    message: string;
    hint?: string;
    onResult: (confirmed: boolean) => void;
}) {
    useInput((input, key) => {
        if (input === "y" || input === "Y") onResult(true);
        else if (input === "n" || input === "N" || key.escape || key.return) onResult(false);
    });
    return (
        <Box flexDirection="column">
            <Text color="red">{message}</Text>
            {hint ? <Text dimColor>{hint}</Text> : null}
            <Text dimColor>y confirm · n/esc cancel</Text>
        </Box>
    );
}

// on macOS Claude Code keeps the login token in the Keychain (keyed to the
// config dir), so removing the folder alone leaves that entry behind
const DELETE_HINT = process.platform === "darwin"
    ? "The account's login token may remain in the macOS Keychain — run /logout inside it first to clear that too."
    : undefined;

export function App({ onLaunch, countdownSeconds = 3, checkUpdate = checkForUpdate }: {
    onLaunch: (name: string) => void;
    countdownSeconds?: number;
    checkUpdate?: () => Promise<string | null>;
}) {
    const { exit } = useApp();
    const [config, setConfig] = useState<Config>(() => loadConfig());
    const [accounts, setAccounts] = useState<string[]>(() => listAccounts());
    const [screen, setScreen] = useState<Screen>({ id: "list" });
    const [notice, setNotice] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<Editing | null>(null);
    const [editError, setEditError] = useState<string | null>(null);
    const [aliasIndex, setAliasIndex] = useState(() => {
        const shell = currentShell();
        const preselect = shellTargets().findIndex(t => t.id === shell);
        return preselect >= 0 ? preselect : 0;
    });

    const cwd = process.cwd();
    const matched = matchBasePath(config, cwd);
    const [listIndex, setListIndex] = useState(() => {
        const preselect = matched ? withMissing(accounts, config.basePaths ?? {}).indexOf(matched) : -1;
        return preselect >= 0 ? preselect : 0;
    });

    // with a path match, count down and auto-launch; navigation or a
    // shortcut cancels (unbound keys are ignored)
    const [countdown, setCountdown] = useState<number | null>(() =>
        matched && accountExists(matched) ? countdownSeconds : null,
    );
    useEffect(() => {
        if (countdown === null) return;
        if (countdown === 0) {
            onLaunch(matched!);
            exit();
            return;
        }
        const timer = setTimeout(() => setCountdown(c => (c === null ? null : c - 1)), 1000);
        return () => clearTimeout(timer);
    }, [countdown]);

    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    useEffect(() => {
        let mounted = true;
        checkUpdate().then(version => {
            if (mounted && version) setLatestVersion(version);
        });
        return () => { mounted = false; };
    }, []);

    const updateConfig = (next: Config) => {
        saveConfig(next);
        setConfig(next);
    };

    const cancelEdit = () => {
        setEditing(null);
        setEditError(null);
    };

    const submitNewAccount = (name: string) => {
        if (!name) return setEditError("Enter a name");
        const error = validateName(name);
        if (error) return setEditError(error);
        if (accountExists(name)) return setEditError(`Account "${name}" already exists`);
        createAccount(name);
        const next = listAccounts();
        setAccounts(next);
        setListIndex(Math.max(0, buildRows(next, config.basePaths ?? {}, expanded)
            .findIndex(r => r.type === "account" && r.name === name)));
        setNotice(`Created ${contractTilde(accountDir(name))}`);
        cancelEdit();
    };

    const submitNewPath = (account: string, value: string) => {
        if (!value) return setEditError("Enter a directory");
        const abs = resolve(expandTilde(value));
        if (!existsSync(abs) || !statSync(abs).isDirectory()) {
            return setEditError(`Not a directory: ${abs}`);
        }
        const base = contractTilde(abs);
        const previous = config.basePaths?.[base];
        if (previous === account) {
            setNotice(`${base} is already mapped to ${accountLabel(account)}`);
        } else {
            updateConfig({ ...config, basePaths: { ...config.basePaths, [base]: account } });
            // a base can map to one account only, so say when this moved it
            setNotice(`${base} → ${accountLabel(account)}${previous ? ` (was ${accountLabel(previous)})` : ""}`);
        }
        cancelEdit();
    };

    // drop every mapping that points at an account
    const dropMappings = (account: string): { dropped: number; basePaths: Record<string, string> } => {
        const nextPaths = { ...config.basePaths };
        let dropped = 0;
        for (const [base, name] of Object.entries(nextPaths)) {
            if (name === account) {
                delete nextPaths[base];
                dropped++;
            }
        }
        updateConfig({ ...config, basePaths: nextPaths });
        return { dropped, basePaths: nextPaths };
    };

    if (screen.id === "confirmDelete") {
        const { name } = screen;
        return (
            <ConfirmScreen
                message={`Delete "${accountLabel(name)}" and its folder ${contractTilde(accountDir(name))} (settings, history, plugins)?`}
                hint={DELETE_HINT}
                onResult={confirmed => {
                    if (confirmed) {
                        removeAccount(name);
                        const { basePaths: nextPaths } = dropMappings(name);
                        const next = listAccounts();
                        setAccounts(next);
                        const nextExpanded = new Set(expanded);
                        nextExpanded.delete(name);
                        setExpanded(nextExpanded);
                        const rowCount = buildRows(next, nextPaths, nextExpanded).length;
                        setListIndex(i => Math.max(0, Math.min(i, rowCount - 1)));
                        setNotice(`Removed ${contractTilde(accountDir(name))}`);
                    }
                    setScreen({ id: "list" });
                }}
            />
        );
    }

    if (screen.id === "alias") {
        const targets = shellTargets();
        const shell = currentShell();
        return (
            <Menu
                title={'Alias claude → "claudes --" in shell startup files'}
                items={targets.map(target => {
                    const tags = [
                        isAliasEnabled(target) ? "enabled" : null,
                        target.id === shell ? "your shell" : null,
                    ].filter(Boolean).join(", ");
                    return (
                        <Text key={target.id}>
                            {target.id.padEnd(5)}
                            <Text dimColor>{contractTilde(target.rcFile)}</Text>
                            {tags ? <Text dimColor> ({tags})</Text> : null}
                        </Text>
                    );
                })}
                index={aliasIndex}
                onIndexChange={setAliasIndex}
                notice={notice}
                footer="↵ toggle · esc back"
                onAction={({ input, key, index }) => {
                    const target = targets[index];
                    if (key.return && target) {
                        const rc = contractTilde(target.rcFile);
                        if (isAliasEnabled(target)) {
                            disableAlias(target);
                            setNotice(`Removed from ${rc}`);
                        } else {
                            enableAlias(target);
                            setNotice(`Added to ${rc} — takes effect in new shells`);
                        }
                    } else if (key.escape) {
                        setNotice(null);
                        setScreen({ id: "list" });
                    }
                }}
            />
        );
    }

    // main list
    const basePaths = config.basePaths ?? {};
    const rows = buildRows(accounts, basePaths, expanded);
    const items: ReactNode[] = rows.map(row => {
        if (row.type === "account") {
            let tag: string | null = null;
            if (row.name === matched && countdown !== null) {
                tag = `(${countdown}) launching…`;
            } else {
                const tags = [
                    row.name === matched ? "path match" : null,
                    accountExists(row.name) ? null : "folder missing",
                ].filter(Boolean);
                if (tags.length) tag = `(${tags.join(", ")})`;
            }
            return (
                <Text key={`account:${row.name}`}>
                    {accountLabel(row.name)}
                    {tag ? <Text dimColor> {tag}</Text> : null}
                </Text>
            );
        }
        if (row.type === "path") {
            return <Text key={`path:${row.base}`}>{"  "}{row.base}</Text>;
        }
        if (row.type === "addPath") {
            if (editing?.type === "path" && editing.account === row.account) {
                return (
                    <Text key={`addPath:${row.account}`}>
                        {"  "}+{" "}
                        <TextInput
                            initial={contractTilde(cwd)}
                            onChange={() => setEditError(null)}
                            onSubmit={value => submitNewPath(row.account, value)}
                            onCancel={cancelEdit}
                        />
                        {editError ? <Text color="red">  {editError}</Text> : null}
                    </Text>
                );
            }
            return <Text key={`addPath:${row.account}`} dimColor>{"  "}+ add path</Text>;
        }
        if (editing?.type === "account") {
            return (
                <Text key="newAccount">
                    +{" "}
                    <TextInput
                        onChange={() => setEditError(null)}
                        onSubmit={submitNewAccount}
                        onCancel={cancelEdit}
                    />
                    {editError ? <Text color="red">  {editError}</Text> : null}
                </Text>
            );
        }
        return <Text key="newAccount" dimColor>+ new account</Text>;
    });

    // no need to advertise the alias once it's enabled for the user's shell
    const hideAliasHint = shellTargets().some(
        target => target.id === currentShell() && isAliasEnabled(target),
    );

    const setPathsOpen = (account: string, open: boolean) => {
        if (expanded.has(account) === open) return;
        const next = new Set(expanded);
        if (open) next.add(account);
        else next.delete(account);
        setExpanded(next);
        // keep the cursor on the toggled account's own row
        setListIndex(Math.max(0, buildRows(accounts, basePaths, next)
            .findIndex(r => r.type === "account" && r.name === account)));
    };

    return (
        <Box flexDirection="column">
            <Menu
                title="Select account"
                items={items}
                index={listIndex}
                onIndexChange={index => {
                    setCountdown(null);
                    setListIndex(index);
                }}
                notice={notice}
                footer={editing
                    ? "↵ apply · esc cancel"
                    : `↵ launch · d delete · p paths${hideAliasHint ? "" : " · a alias"} · esc quit`}
                isActive={editing === null}
                onAction={({ input, key, index }) => {
                    setNotice(null);
                    if (key.return || key.escape || key.leftArrow || key.rightArrow
                        || ["d", "p", "a"].includes(input)) {
                        setCountdown(null);
                    }
                    const row = rows[index];
                    if (!row) return;
                    if (key.return) {
                        if (row.type === "account" && !accountExists(row.name)) {
                            setNotice(`${contractTilde(accountDir(row.name))} does not exist — recreate it via "+ new account", or d drops its mappings`);
                        } else if (row.type === "account") {
                            onLaunch(row.name);
                            exit();
                        } else if (row.type === "addPath") {
                            setEditing({ type: "path", account: row.account });
                        } else if (row.type === "newAccount") {
                            setEditing({ type: "account" });
                        }
                    } else if (input === "p" && row.type !== "newAccount") {
                        const account = row.type === "account" ? row.name : row.account;
                        setPathsOpen(account, !expanded.has(account));
                    } else if ((key.rightArrow || key.leftArrow) && row.type !== "newAccount") {
                        // undocumented: right opens, left closes
                        const account = row.type === "account" ? row.name : row.account;
                        setPathsOpen(account, key.rightArrow);
                    } else if (input === "d") {
                        if (row.type === "account") {
                            if (row.name === DEFAULT_ACCOUNT) {
                                setNotice("The default account (~/.claude) cannot be deleted");
                            } else if (!accountExists(row.name)) {
                                // nothing on disk to confirm: just forget the mappings
                                const { dropped } = dropMappings(row.name);
                                const nextExpanded = new Set(expanded);
                                nextExpanded.delete(row.name);
                                setExpanded(nextExpanded);
                                setListIndex(i => Math.max(0, i - 1));
                                setNotice(`Dropped ${dropped} mapping${dropped === 1 ? "" : "s"} to "${row.name}"`);
                            } else {
                                setScreen({ id: "confirmDelete", name: row.name });
                            }
                        } else if (row.type === "path") {
                            const nextPaths = { ...basePaths };
                            delete nextPaths[row.base];
                            updateConfig({ ...config, basePaths: nextPaths });
                            setListIndex(i => Math.max(0, Math.min(i, rows.length - 2)));
                        }
                    } else if (input === "a") {
                        setScreen({ id: "alias" });
                    } else if (key.escape) {
                        exit();
                    }
                }}
            />
            {latestVersion ? (
                <Text color="yellow">
                    update available: {currentVersion()} → {latestVersion} · npm i -g @korkje/claudes
                </Text>
            ) : null}
        </Box>
    );
}
