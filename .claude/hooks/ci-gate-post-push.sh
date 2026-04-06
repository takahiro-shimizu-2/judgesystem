#!/usr/bin/env bash
# PostToolUse hook: After git push, wait for CI to start and report status
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

# Wait for CI run to appear (poll up to 30 seconds)
CI_RUN=""
for i in 1 2 3 4 5 6; do
  sleep 5
  CI_RUN=$(gh run list --branch "$BRANCH" --limit 1 --json status,conclusion,name,databaseId,createdAt 2>/dev/null || echo "[]")
  # Check if we got a run that was created recently (within last 60 seconds)
  HAS_RECENT=$(echo "$CI_RUN" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{
        const runs=JSON.parse(d);
        if(runs.length===0){console.log('no');return}
        const created=new Date(runs[0].createdAt);
        const age=(Date.now()-created.getTime())/1000;
        console.log(age<60?'yes':'no');
      }catch(e){console.log('no')}
    })" 2>/dev/null || echo "no")
  if [ "$HAS_RECENT" = "yes" ]; then
    break
  fi
done

# Check for existing failures across all workflows
FAILURES=$(gh run list --status failure --limit 5 --json name,headBranch,databaseId 2>/dev/null || echo "[]")

CONTEXT="[CI Gate] Pushed to $BRANCH.
Current CI run: $CI_RUN
Recent failures across repo: $FAILURES
ACTION REQUIRED: Wait for CI to complete. Run 'gh pr checks <number>' or 'gh run list --branch $BRANCH' to verify all checks pass before proceeding."

node -e "console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:$(node -e "console.log(JSON.stringify(process.argv[1]))" "$CONTEXT")}}))"
