# Prepares a throwaway HOME for the VHS recording, so the demo never
# touches (or reveals) real Claude Code state.
# Source from the repo root: . demo/setup.sh

REPO=$PWD
VER=$(claude --version 2>/dev/null | awk '{print $1}')

DEMO_HOME=$(mktemp -d)
# resolve symlinks (macOS /var -> /private/var) so base path matching
# against the resolved process cwd works
DEMO_HOME=$(cd "$DEMO_HOME" && pwd -P)
mkdir -p "$DEMO_HOME/.claude"
mkdir -p "$DEMO_HOME/dev/personal/blog" "$DEMO_HOME/dev/work/api" "$DEMO_HOME/bin"

# stand-in "claude": prints a redacted replica of the real welcome
# screen (the real binary would show first-run onboarding here, since
# auth is keychain-bound to real config dirs)
cat > "$DEMO_HOME/bin/claude" <<EOF
#!/bin/sh
cwd=\$(pwd)
case "\$cwd" in "\$HOME"*) cwd="~\${cwd#"\$HOME"}" ;; esac
exec sh "$REPO/demo/welcome.sh" "${VER:-2.x.x}" "\$cwd"
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
