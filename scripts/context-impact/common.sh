#!/usr/bin/env bash
set -euo pipefail

context_impact_project_root() {
  if [ -n "${PROJECT_ROOT:-}" ]; then
    printf '%s\n' "$PROJECT_ROOT"
    return 0
  fi

  printf '%s\n' "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
}

resolve_context_and_impact_root() {
  if [ -n "${CONTEXT_AND_IMPACT_ROOT:-}" ] && [ -f "${CONTEXT_AND_IMPACT_ROOT}/package.json" ]; then
    printf '%s\n' "$CONTEXT_AND_IMPACT_ROOT"
    return 0
  fi

  local project_root
  project_root="$(context_impact_project_root)"

  if [ -f "$project_root/../context-and-impact/package.json" ]; then
    printf '%s\n' "$project_root/../context-and-impact"
    return 0
  fi

  return 1
}

exec_context_and_impact_script() {
  local relative_path="${1:?relative_path is required}"
  shift

  local context_root
  if context_root="$(resolve_context_and_impact_root)"; then
    case "$relative_path" in
      *.py)
        exec python3 "$context_root/$relative_path" "$@"
        ;;
      *)
        exec bash "$context_root/$relative_path" "$@"
        ;;
    esac
  fi

  cat >&2 <<EOF
context-and-impact is not available.

This command uses an explicit external bridge. Set CONTEXT_AND_IMPACT_ROOT to a valid checkout
or place the sibling repository at ../context-and-impact before running this wrapper.
EOF
  exit 1
}

exec_agent_skill_bus() {
  local subcommand="${1:?subcommand is required}"
  shift

  local project_root
  project_root="$(context_impact_project_root)"

  local local_bin="$project_root/node_modules/.bin/agent-skill-bus"
  local sibling_dir="$project_root/../agent-skill-bus"

  if [ -x "$local_bin" ]; then
    exec "$local_bin" "$subcommand" "$@"
  fi

  if [ -f "$sibling_dir/package.json" ]; then
    exec npx --prefix "$sibling_dir" agent-skill-bus "$subcommand" "$@"
  fi

  cat >&2 <<EOF
agent-skill-bus is not installed locally.

This command uses an explicit external bridge. Install agent-skill-bus in node_modules
or place the sibling repository at ../agent-skill-bus before running this wrapper.
EOF
  exit 1
}
