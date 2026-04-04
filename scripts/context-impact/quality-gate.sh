#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/common.sh"

cd "$PROJECT_ROOT"
exec_context_and_impact_script "src/quality/ensemble_judge.py" "$@"
