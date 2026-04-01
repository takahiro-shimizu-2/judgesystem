#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONTEXT_AND_IMPACT_TARGET_ROOT="$PROJECT_ROOT" \
  exec bash "$PROJECT_ROOT/../context-and-impact/src/enforcer/estack-plan.sh" init "$@"
