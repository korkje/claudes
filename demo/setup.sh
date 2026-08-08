# Prepares a throwaway HOME with demo accounts for the VHS recording,
# so the demo never touches (or reveals) real Claude Code state.
# Source from the repo root: . demo/setup.sh

DEMO_HOME=$(mktemp -d)
# resolve symlinks (macOS /var -> /private/var) so base path matching
# against the resolved process cwd works
DEMO_HOME=$(cd "$DEMO_HOME" && pwd -P)
mkdir -p "$DEMO_HOME/.claude"
mkdir -p "$DEMO_HOME/dev/personal/blog" "$DEMO_HOME/bin"

cat > "$DEMO_HOME/.claudes.json" <<'EOF'
{
  "basePaths": {
    "~/dev/personal": "personal"
  }
}
EOF

# stand-in "claude" that just announces which account it was launched with
cat > "$DEMO_HOME/bin/claude" <<'EOF'
#!/bin/sh
dir=$(basename "${CLAUDE_CONFIG_DIR:-.claude}")
name=${dir#.claude-}
[ "$name" = ".claude" ] && name="default"
printf '\n\033[1m\342\234\263 claude\033[0m starting with account \033[36m%s\033[0m\n' "$name"
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
