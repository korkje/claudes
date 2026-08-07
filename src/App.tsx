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
    | { id: "create" }
    | { id: "confirmDelete"; name: string }
    | { id: "paths" }
    | { id: "pathAdd" }
    | { id: "pathAccount"; base: string }
    | { id: "alias" };

interface MenuAction {
    input: string;
    key: Key;
    index: number;
}

function Menu({ title, items, index, onIndexChange, footer, notice, onAction }: {
    title: string;
    items: ReactNode[];
    index: number;
    onIndexChange: (index: number) => void;
    footer: string;
    notice?: string | null;
    onAction: (action: MenuAction) => void;
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
    });

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

function InputScreen({ title, label, initial, hint, validate, onSubmit, onCancel }: {
    title: string;
    label: string;
    initial?: string;
    hint: string;
    validate: (value: string) => string | null;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}) {
    const [error, setError] = useState<string | null>(null);
    return (
        <Box flexDirection="column">
            <Text bold>{title}</Text>
            <Text>
                {label}
                <TextInput
                    initial={initial}
                    onChange={() => setError(null)}
                    onSubmit={value => {
                        const problem = validate(value);
                        if (problem) setError(problem);
                        else onSubmit(value);
                    }}
                    onCancel={onCancel}
                />
            </Text>
            {error ? <Text color="red">{error}</Text> : null}
            <Text dimColor>{hint}</Text>
        </Box>
    );
}

function ConfirmScreen({ message, onResult }: {
    message: string;
    onResult: (confirmed: boolean) => void;
}) {
    useInput((input, key) => {
        if (input === "y" || input === "Y") onResult(true);
        else if (input === "n" || input === "N" || key.escape || key.return) onResult(false);
    });
    return (
        <Box flexDirection="column">
            <Text color="red">{message}</Text>
            <Text dimColor>y confirm · n/esc cancel</Text>
        </Box>
    );
}

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
    const [pathsIndex, setPathsIndex] = useState(0);
    const [accountPickIndex, setAccountPickIndex] = useState(0);
    const [aliasIndex, setAliasIndex] = useState(() => {
        const shell = currentShell();
        const preselect = shellTargets().findIndex(t => t.id === shell);
        return preselect >= 0 ? preselect : 0;
    });

    const cwd = process.cwd();
    const matched = matchBasePath(config, cwd);
    const [listIndex, setListIndex] = useState(() => {
        const preselect = matched ? accounts.indexOf(matched) : -1;
        return preselect >= 0 ? preselect : 0;
    });

    // with a path match, count down and auto-launch; navigation or a
    // shortcut cancels (unbound keys are ignored)
    const [countdown, setCountdown] = useState<number | null>(() =>
        matched && accounts.includes(matched) ? countdownSeconds : null,
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

    if (screen.id === "create") {
        return (
            <InputScreen
                title="New account"
                label="Name: "
                hint="↵ create · esc back"
                validate={name => {
                    if (!name) return "Enter a name";
                    const error = validateName(name);
                    if (error) return error;
                    if (accountExists(name)) return `Account "${name}" already exists`;
                    return null;
                }}
                onSubmit={name => {
                    createAccount(name);
                    const next = listAccounts();
                    setAccounts(next);
                    setListIndex(Math.max(0, next.indexOf(name)));
                    setNotice(`Created ${contractTilde(accountDir(name))}`);
                    setScreen({ id: "list" });
                }}
                onCancel={() => setScreen({ id: "list" })}
            />
        );
    }

    if (screen.id === "confirmDelete") {
        const { name } = screen;
        return (
            <ConfirmScreen
                message={`Delete "${accountLabel(name)}" and all its data (${contractTilde(accountDir(name))})?`}
                onResult={confirmed => {
                    if (confirmed) {
                        removeAccount(name);
                        const nextConfig = { ...config, basePaths: { ...config.basePaths } };
                        for (const [base, account] of Object.entries(nextConfig.basePaths)) {
                            if (account === name) delete nextConfig.basePaths[base];
                        }
                        updateConfig(nextConfig);
                        const next = listAccounts();
                        setAccounts(next);
                        setListIndex(i => Math.min(i, next.length - 1));
                        setNotice(`Removed ${contractTilde(accountDir(name))}`);
                    }
                    setScreen({ id: "list" });
                }}
            />
        );
    }

    if (screen.id === "paths") {
        const entries = Object.entries(config.basePaths ?? {}).sort();
        const pathItems: ReactNode[] = entries.map(([base, name]) => (
            <Text key={base}>{base} <Text dimColor>→</Text> {accountLabel(name)}</Text>
        ));
        pathItems.push(<Text dimColor key="__add">+ add path</Text>);
        return (
            <Menu
                title="Base paths (directory → account)"
                items={pathItems}
                index={pathsIndex}
                onIndexChange={setPathsIndex}
                notice={notice}
                footer="d delete · esc back"
                onAction={({ input, key, index }) => {
                    setNotice(null);
                    if (key.return && index === entries.length) {
                        setScreen({ id: "pathAdd" });
                    } else if (input === "d" && entries[index]) {
                        const [base] = entries[index];
                        const basePaths = { ...config.basePaths };
                        delete basePaths[base];
                        updateConfig({ ...config, basePaths });
                        setPathsIndex(i => Math.max(0, Math.min(i, entries.length - 1)));
                    } else if (key.escape) {
                        setScreen({ id: "list" });
                    }
                }}
            />
        );
    }

    if (screen.id === "pathAdd") {
        return (
            <InputScreen
                title="Add base path"
                label="Directory: "
                initial={contractTilde(cwd)}
                hint="↵ next · esc back"
                validate={value => {
                    if (!value) return "Enter a directory";
                    const abs = resolve(expandTilde(value));
                    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
                        return `Not a directory: ${abs}`;
                    }
                    return null;
                }}
                onSubmit={value => {
                    const base = contractTilde(resolve(expandTilde(value)));
                    setAccountPickIndex(0);
                    setScreen({ id: "pathAccount", base });
                }}
                onCancel={() => setScreen({ id: "paths" })}
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

    if (screen.id === "pathAccount") {
        const { base } = screen;
        return (
            <Menu
                title={`Account for ${base}`}
                items={accounts.map(name => <Text key={name}>{accountLabel(name)}</Text>)}
                index={accountPickIndex}
                onIndexChange={setAccountPickIndex}
                footer="↵ assign · esc back"
                onAction={({ input, key, index }) => {
                    if (key.return && accounts[index]) {
                        updateConfig({
                            ...config,
                            basePaths: { ...config.basePaths, [base]: accounts[index] },
                        });
                        setNotice(`${base} → ${accountLabel(accounts[index])}`);
                        setScreen({ id: "paths" });
                    } else if (key.escape) {
                        setScreen({ id: "paths" });
                    }
                }}
            />
        );
    }

    // main list
    const items: ReactNode[] = accounts.map(name => {
        let tag: string | null = null;
        if (name === matched) {
            tag = countdown !== null ? `(${countdown}) launching…` : "(path match)";
        }
        return (
            <Text key={name}>
                {accountLabel(name)}
                {tag ? <Text dimColor> {tag}</Text> : null}
            </Text>
        );
    });
    items.push(<Text dimColor key="__new">+ new account</Text>);

    // no need to advertise the alias once it's enabled for the user's shell
    const hideAliasHint = shellTargets().some(
        target => target.id === currentShell() && isAliasEnabled(target),
    );

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
                footer={`↵ launch · d delete · p paths${hideAliasHint ? "" : " · a alias"} · esc quit`}
                onAction={({ input, key, index }) => {
                    setNotice(null);
                    if (key.return || key.escape || ["d", "p", "a"].includes(input)) {
                        setCountdown(null);
                    }
                    const onCreateRow = index === accounts.length;
                    const name = accounts[index];
                    if (key.return) {
                        if (onCreateRow) {
                            setScreen({ id: "create" });
                        } else if (name) {
                            onLaunch(name);
                            exit();
                        }
                    } else if (input === "d" && name && !onCreateRow) {
                        if (name === DEFAULT_ACCOUNT) {
                            setNotice("The default account (~/.claude) cannot be deleted");
                        } else {
                            setScreen({ id: "confirmDelete", name });
                        }
                    } else if (input === "p") {
                        setScreen({ id: "paths" });
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
