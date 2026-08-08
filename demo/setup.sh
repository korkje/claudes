# Prepares a throwaway HOME for the VHS recording, so the demo never
# touches real Claude Code accounts — with one exception: the final
# launch execs the real, logged-in claude (see below).
# Source from the repo root: . demo/setup.sh

REAL_HOME=$HOME
REAL_CLAUDE=$(command -v claude)

# fixed path (not mktemp) so the folder-trust seed below stays valid
# across re-recordings
DEMO_HOME="$REAL_HOME/.cache/claudes-demo-home"
rm -rf "$DEMO_HOME"
mkdir -p "$DEMO_HOME/dev/personal/blog" "$DEMO_HOME/dev/work/api" "$DEMO_HOME/bin"

# the real default account's config, reachable from the fake HOME, so the
# final launch is authenticated and shows "~/dev/personal/blog" as cwd
ln -s "$REAL_HOME/.claude" "$DEMO_HOME/.claude"
ln -s "$REAL_HOME/.claude.json" "$DEMO_HOME/.claude.json"

# The demo accounts created on screen have no credentials (Claude Code
# auth is keychain-bound per config dir), so launching them would show
# the login screen. To end the recording on the real thing, this shim
# quietly execs the real claude on the real default account instead
# (CLAUDE_CONFIG_DIR dropped -> $HOME/.claude.json via the symlinks).
cat > "$DEMO_HOME/bin/claude" <<EOF
#!/bin/sh
exec env -u CLAUDE_CONFIG_DIR -u CLAUDE_CODE_CHILD_SESSION -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT "$REAL_CLAUDE" "\$@"
EOF
chmod +x "$DEMO_HOME/bin/claude"

# pre-trust the demo cwd in the real config so the recording skips the
# folder-trust dialog (one benign key; remove the projects entry for
# this path from ~/.claude.json to undo)
BLOG="$DEMO_HOME/dev/personal/blog"
if [ "$(jq --arg p "$BLOG" '.projects[$p].hasTrustDialogAccepted == true' "$REAL_HOME/.claude.json")" != "true" ]; then
    TMP=$(mktemp) &&
        jq --arg p "$BLOG" '.projects[$p] = ((.projects[$p] // {}) + {hasTrustDialogAccepted: true})' \
            "$REAL_HOME/.claude.json" > "$TMP" &&
        mv "$TMP" "$REAL_HOME/.claude.json"
fi

# run the local build as "claudes"
cat > "$DEMO_HOME/bin/claudes" <<EOF
#!/bin/sh
exec node "$PWD/dist/index.js" "\$@"
EOF
chmod +x "$DEMO_HOME/bin/claudes"

export HOME="$DEMO_HOME"
export PATH="$DEMO_HOME/bin:$PATH"
