#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TASK="${1:?Usage: record-run.sh \"task\" [success|fail|partial] [score]}"
RESULT="${2:-success}"
SCORE="${3:-0.8}"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/common.sh"

cd "$PROJECT_ROOT"

echo "=== Agent Skill Bus: 実行結果記録 ==="
echo "  エージェント: judgesystem"
echo "  スキル    : context-and-impact"
echo "  タスク    : $TASK"
echo "  結果      : $RESULT"
echo "  スコア    : $SCORE"
echo ""

exec_agent_skill_bus record-run \
  --agent judgesystem \
  --skill context-and-impact \
  --task "$TASK" \
  --result "$RESULT" \
  --score "$SCORE"
