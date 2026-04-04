#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONTEXT_AND_IMPACT_TARGET_ROOT="$PROJECT_ROOT" \
  exec bash "$SCRIPT_DIR/estack-plan.sh" init "$@"
