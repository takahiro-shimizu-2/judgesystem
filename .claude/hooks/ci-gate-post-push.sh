#!/usr/bin/env bash
# PostToolUse hook: After git push, inject CI check reminder into context
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_input?.command||'')}catch(e){console.log('')}})")

# Only fire on git push
if ! echo "$CMD" | grep -q '^git push'; then
  exit 0
fi

BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ -z "$BRANCH" ]; then
  exit 0
fi

# Wait briefly for GitHub to register the run
sleep 3

# Check latest CI run
CI_STATUS=$(gh run list --branch "$BRANCH" --limit 1 --json status,conclusion,name,databaseId 2>/dev/null || echo "[]")

# Also check for existing failures across all workflows
FAILURES=$(gh run list --status failure --limit 5 --json name,headBranch,databaseId 2>/dev/null || echo "[]")

CONTEXT="[CI Gate] Pushed to $BRANCH.
Latest CI run: $CI_STATUS
Recent failures across repo: $FAILURES
IMPORTANT: Verify CI passes before marking work as complete. If CI is still 'in_progress', check again with 'gh pr checks' or 'gh run list' before proceeding."

# Output as hookSpecificOutput to inject into model context
node -e "console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:$(node -e "console.log(JSON.stringify(process.argv[1]))" "$CONTEXT")}}))"
