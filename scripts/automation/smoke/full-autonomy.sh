#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

npm run typecheck
npx tsx scripts/agents-parallel-exec.ts --help >/dev/null
npx tsx scripts/automation/smoke/planning-artifacts.ts
npx tsx scripts/automation/smoke/analysis-only-planning.ts
npx tsx scripts/automation/smoke/autonomous-agent-trigger.ts
npx tsx scripts/automation/smoke/omega-integration-learning.ts
npx tsx scripts/automation/smoke/worktree-lifecycle.ts
npx tsx scripts/automation/smoke/quality-pipeline.ts
npx tsx scripts/automation/smoke/handler-contracts.ts
npx tsx scripts/automation/smoke/webhook-router-semantics.ts
npx tsx scripts/automation/smoke/pr-issue-links.ts
npx tsx scripts/automation/smoke/state-machine.ts
npx tsx scripts/automation/smoke/bridge-contracts.ts
npx tsx scripts/automation/smoke/water-spider.ts
