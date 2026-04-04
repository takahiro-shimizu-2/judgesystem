#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <backend|frontend>"
  exit 1
fi

if [[ "$TARGET" != "backend" && "$TARGET" != "frontend" ]]; then
  echo "Unsupported target: $TARGET"
  exit 1
fi

resolve_service_name() {
  if [[ "$TARGET" == "backend" ]]; then
    if [[ -n "${AUTOMATION_CLOUD_RUN_BACKEND_SERVICE_NAME:-}" ]]; then
      printf '%s' "$AUTOMATION_CLOUD_RUN_BACKEND_SERVICE_NAME"
      return
    fi
  else
    if [[ -n "${AUTOMATION_CLOUD_RUN_FRONTEND_SERVICE_NAME:-}" ]]; then
      printf '%s' "$AUTOMATION_CLOUD_RUN_FRONTEND_SERVICE_NAME"
      return
    fi
  fi

  printf '%s' "${AUTOMATION_CLOUD_RUN_SERVICE_NAME:-}"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name"
    exit 1
  fi
}

run_or_echo() {
  local -a cmd=("$@")
  if [[ "${AUTOMATION_CLOUD_RUN_DRY_RUN:-false}" == "true" ]]; then
    printf '[dry-run] '
    printf '%q ' "${cmd[@]}"
    printf '\n'
    return 0
  fi

  "${cmd[@]}"
}

if [[ -n "${AUTOMATION_CLOUD_RUN_PROJECT_ID:-}" ]]; then
  run_or_echo gcloud config set project "${AUTOMATION_CLOUD_RUN_PROJECT_ID}"
fi

SERVICE_NAME="$(resolve_service_name)"

if [[ "$TARGET" == "backend" ]]; then
  require_env AUTOMATION_CLOUD_RUN_FRONTEND_URL

  CMD=(
    bash
    scripts/backend_gcloud_command_sample.sh
    --frontend_url "${AUTOMATION_CLOUD_RUN_FRONTEND_URL}"
  )

  if [[ -n "${AUTOMATION_CLOUD_RUN_PROJECT_ID:-}" ]]; then
    CMD+=(--project_id "${AUTOMATION_CLOUD_RUN_PROJECT_ID}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_DATASET_NAME:-}" ]]; then
    CMD+=(--dataset_name "${AUTOMATION_CLOUD_RUN_DATASET_NAME}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_CLOUD_SQL_INSTANCE:-}" ]]; then
    CMD+=(--cloud_sql_instance "${AUTOMATION_CLOUD_RUN_CLOUD_SQL_INSTANCE}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_CONNECTION_TYPE:-}" ]]; then
    CMD+=(--connection_type "${AUTOMATION_CLOUD_RUN_CONNECTION_TYPE}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_PG_HOST:-}" ]]; then
    CMD+=(--pg_host "${AUTOMATION_CLOUD_RUN_PG_HOST}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_PG_USER:-}" ]]; then
    CMD+=(--pg_user "${AUTOMATION_CLOUD_RUN_PG_USER}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_PG_PASSWORD:-}" ]]; then
    CMD+=(--pg_password "${AUTOMATION_CLOUD_RUN_PG_PASSWORD}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_PG_DATABASE:-}" ]]; then
    CMD+=(--pg_database "${AUTOMATION_CLOUD_RUN_PG_DATABASE}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_PG_PORT:-}" ]]; then
    CMD+=(--pg_port "${AUTOMATION_CLOUD_RUN_PG_PORT}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_PG_SSLMODE:-}" ]]; then
    CMD+=(--pg_sslmode "${AUTOMATION_CLOUD_RUN_PG_SSLMODE}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_PG_SCHEMA:-}" ]]; then
    CMD+=(--pg_schema "${AUTOMATION_CLOUD_RUN_PG_SCHEMA}")
  fi
  if [[ -n "${AUTOMATION_CLOUD_RUN_ENABLE_CONTACT_DELETE:-}" ]]; then
    CMD+=(--enable_contact_delete "${AUTOMATION_CLOUD_RUN_ENABLE_CONTACT_DELETE}")
  fi
  if [[ -n "$SERVICE_NAME" ]]; then
    CMD+=(--service_name "$SERVICE_NAME")
  fi

  run_or_echo "${CMD[@]}"
  exit 0
fi

require_env AUTOMATION_CLOUD_RUN_BACKEND_URL

CMD=(
  bash
  scripts/frontend_gcloud_command_sample.sh
  --url "${AUTOMATION_CLOUD_RUN_BACKEND_URL}"
)

if [[ -n "$SERVICE_NAME" ]]; then
  CMD+=(--service_name "$SERVICE_NAME")
fi

run_or_echo "${CMD[@]}"
