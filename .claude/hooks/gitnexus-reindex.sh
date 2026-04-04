#!/usr/bin/env bash
# gitnexus-reindex.sh — PostToolUse hook for GitNexus auto-reindex
#
# Triggers after Bash tool calls. Only runs `npx gitnexus analyze`
# when the command was a git commit or git merge.
#
# Claude Code hook spec:
#   exit 0 = allow (always allow, this is post-hook)
#   stdout = feedback to Claude
set -uo pipefail

# Read tool input from stdin
INPUT=$(cat 2>/dev/null) || INPUT="{}"

# Extract the command that was executed
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('command', ''))
except:
    pass
" 2>/dev/null)

# Only trigger on git commit or git merge
case "$COMMAND" in
  git\ commit*|git\ merge*)
    ;;
  *)
    exit 0
    ;;
esac

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
META="$PROJECT_ROOT/.gitnexus/meta.json"

# Check if GitNexus index exists
if [ ! -f "$META" ]; then
  exit 0
fi

# Check if embeddings exist to preserve them
HAS_EMBEDDINGS=$(python3 -c "
import json
try:
    with open('$META') as f:
        m = json.load(f)
    print('yes' if m.get('stats', {}).get('embeddings', 0) > 0 else 'no')
except:
    print('no')
" 2>/dev/null)

# Run reindex in background (don't block the user)
if [ "$HAS_EMBEDDINGS" = "yes" ]; then
  (cd "$PROJECT_ROOT" && npx gitnexus analyze --embeddings >/dev/null 2>&1) &
  echo "GitNexus: reindexing with embeddings (background)"
else
  (cd "$PROJECT_ROOT" && npx gitnexus analyze >/dev/null 2>&1) &
  echo "GitNexus: reindexing (background)"
fi

exit 0
