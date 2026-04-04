#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCAL_BIN="$PROJECT_ROOT/node_modules/.bin/agent-skill-bus"
SIBLING_DIR="$PROJECT_ROOT/../agent-skill-bus"

if [ -x "$LOCAL_BIN" ]; then
  exec "$LOCAL_BIN" dashboard "$@"
fi

if [ -f "$SIBLING_DIR/package.json" ]; then
  exec npx --prefix "$SIBLING_DIR" agent-skill-bus dashboard "$@"
fi

cat >&2 <<'EOF'
agent-skill-bus is not installed locally.

This dashboard command is an optional external bridge. Install agent-skill-bus in node_modules
or place the sibling repository at ../agent-skill-bus before running `npm run pipeline:dashboard`.
EOF
exit 1
