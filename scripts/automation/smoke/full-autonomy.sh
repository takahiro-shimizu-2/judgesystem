#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

npm run typecheck
npx tsx scripts/agents-parallel-exec.ts --help >/dev/null
npx tsx scripts/automation/smoke/handler-contracts.ts
