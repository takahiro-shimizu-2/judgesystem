#!/usr/bin/env bash
set -euo pipefail

while IFS= read -r -d '' script_path; do
  bash -n "$script_path"
done < <(find scripts db -type f -name '*.sh' -print0)
