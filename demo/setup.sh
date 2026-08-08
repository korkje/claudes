# Prepares a throwaway HOME for the VHS recording, so the demo never
# touches (or reveals) real Claude Code state.
# Source from the repo root: . demo/setup.sh

DEMO_HOME=$(mktemp -d)
# resolve symlinks (macOS /var -> /private/var) so base path matching
# against the resolved process cwd works
DEMO_HOME=$(cd "$DEMO_HOME" && pwd -P)
mkdir -p "$DEMO_HOME/.claude"
mkdir -p "$DEMO_HOME/dev/personal/blog" "$DEMO_HOME/dev/work/api" "$DEMO_HOME/bin"

# stand-in "claude" that greets like the real thing, since the real one
# would show first-run onboarding in an empty config dir
cat > "$DEMO_HOME/bin/claude" <<'EOF'
#!/bin/sh
dir=$(basename "${CLAUDE_CONFIG_DIR:-$HOME/.claude}")
name=${dir#.claude-}
[ "$name" = ".claude" ] && name="default"
cwd=$(pwd)
case "$cwd" in "$HOME"*) cwd="~${cwd#"$HOME"}" ;; esac
o=$(printf '\033[38;5;208m'); b=$(printf '\033[1m'); c=$(printf '\033[36m'); r=$(printf '\033[0m')
echo
echo "${o}╭──────────────────────────────────────────────╮${r}"
echo "${o}│${r} ${o}✳${r} ${b}Welcome to Claude Code!${r}                    ${o}│${r}"
echo "${o}│${r}                                              ${o}│${r}"
printf "${o}│${r}   account: ${c}%-34s${r}${o}│${r}\n" "$name"
printf "${o}│${r}   cwd:     %-34s${o}│${r}\n" "$cwd"
echo "${o}╰──────────────────────────────────────────────╯${r}"
EOF
chmod +x "$DEMO_HOME/bin/claude"

# run the local build as "claudes"
cat > "$DEMO_HOME/bin/claudes" <<EOF
#!/bin/sh
exec node "$PWD/dist/index.js" "\$@"
EOF
chmod +x "$DEMO_HOME/bin/claudes"

export HOME="$DEMO_HOME"
export PATH="$DEMO_HOME/bin:$PATH"
