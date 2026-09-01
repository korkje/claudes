# Prepares a throwaway HOME for the VHS recordings, so the demos never
# touch (or reveal) real Claude Code state.
# Source from the repo root: . demo/setup.sh [mapped]
#   mapped: seed base path mappings (for the auto-launch demo)

REPO=$PWD

DEMO_HOME=$(mktemp -d)
# resolve symlinks (macOS /var -> /private/var) so base path matching
# against the resolved process cwd works
DEMO_HOME=$(cd "$DEMO_HOME" && pwd -P)
mkdir -p "$DEMO_HOME/.claude" "$DEMO_HOME/.claude-personal" "$DEMO_HOME/.claude-work"
mkdir -p "$DEMO_HOME/dev/personal/blog" "$DEMO_HOME/dev/work/api" "$DEMO_HOME/bin"

# fake logins, in the shape of Claude Code's state file (~/.claude.json for
# the default config dir, <dir>/.claude.json otherwise)
login() { printf '{ "oauthAccount": { "emailAddress": "%s"%s } }\n' "$1" "${2:+, \"organizationName\": \"$2\"}"; }
login name@example.com            > "$DEMO_HOME/.claude.json"
login name@personal.example       > "$DEMO_HOME/.claude-personal/.claude.json"
login name@acme.example Acme      > "$DEMO_HOME/.claude-work/.claude.json"

if [ "$1" = "mapped" ]; then
    cat > "$DEMO_HOME/.claudes.json" <<'EOF'
{
  "basePaths": {
    "~/dev/personal": "personal",
    "~/dev/work": "work"
  }
}
EOF
fi

# stand-in "claude": an Ink screen with no personal info (build first:
# npm run demo does this)
cat > "$DEMO_HOME/bin/claude" <<EOF
#!/bin/sh
exec node "$REPO/demo/.build/fake-claude.js"
EOF
chmod +x "$DEMO_HOME/bin/claude"

# run the local build as "claudes"
cat > "$DEMO_HOME/bin/claudes" <<EOF
#!/bin/sh
exec node "$REPO/dist/index.js" "\$@"
EOF
chmod +x "$DEMO_HOME/bin/claudes"

export HOME="$DEMO_HOME"
export PATH="$DEMO_HOME/bin:$PATH"
export SHELL=/bin/zsh
