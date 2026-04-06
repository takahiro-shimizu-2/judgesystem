#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_PATH="${1:?workspace path is required}"
PACKAGE_JSON="$WORKSPACE_PATH/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
  echo "package.json not found for workspace: $WORKSPACE_PATH" >&2
  exit 1
fi

read_package_field() {
  local field_name="$1"

  node - "$PACKAGE_JSON" "$field_name" <<'NODE'
const fs = require('node:fs');

const [, , packageJsonPath, fieldName] = process.argv;
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const value = pkg[fieldName];

if (typeof value === 'string') {
  process.stdout.write(value);
}
NODE
}

has_script() {
  local script_name="$1"

  node - "$PACKAGE_JSON" "$script_name" <<'NODE'
const fs = require('node:fs');

const [, , packageJsonPath, scriptName] = process.argv;
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const script = pkg.scripts?.[scriptName];

if (!script) {
  process.exit(1);
}

if (scriptName === 'test' && script.includes('No tests configured yet')) {
  process.exit(1);
}
NODE
}

run_script() {
  local script_name="$1"
  echo "::group::${WORKSPACE_NAME} - npm run ${script_name}"
  (
    cd "$WORKSPACE_PATH"
    npm run "$script_name"
  )
  echo "::endgroup::"
}

WORKSPACE_NAME="$(read_package_field name)"
if [[ -z "$WORKSPACE_NAME" ]]; then
  WORKSPACE_NAME="$WORKSPACE_PATH"
fi

echo "::group::${WORKSPACE_NAME} - npm ci"
(
  cd "$WORKSPACE_PATH"
  npm ci
)
echo "::endgroup::"

if has_script lint; then
  run_script lint
fi

if has_script typecheck; then
  run_script typecheck
elif [[ -f "$WORKSPACE_PATH/tsconfig.json" ]]; then
  echo "::group::${WORKSPACE_NAME} - npx tsc --noEmit"
  (
    cd "$WORKSPACE_PATH"
    npx tsc --noEmit
  )
  echo "::endgroup::"
fi

if has_script test; then
  run_script test
fi

if has_script build; then
  run_script build
fi
