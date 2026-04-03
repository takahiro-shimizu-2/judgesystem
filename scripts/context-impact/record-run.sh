#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TASK="${1:?Usage: record-run.sh \"task\" [success|fail|partial] [score]}"
RESULT="${2:-success}"
SCORE="${3:-0.8}"

cd "$PROJECT_ROOT"
exec bash "$PROJECT_ROOT/../context-and-impact/src/skill-bus/record-run.sh" \
  judgesystem \
  context-and-impact \
  "$TASK" \
  "$RESULT" \
  "$SCORE"
