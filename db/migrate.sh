#!/usr/bin/env bash
set -euo pipefail

# Lightweight migration runner using psql
# Usage: ./db/migrate.sh
#
# Environment variables:
#   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD

MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

echo "=== Database Migration Runner ==="
echo "Host: ${PGHOST:-localhost}:${PGPORT:-5432}"
echo "Database: ${PGDATABASE:-postgres}"
echo ""

# Create migration tracking table if not exists
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
SQL

# Apply migrations in order
for migration in "$MIGRATIONS_DIR"/*.sql; do
  filename="$(basename "$migration")"

  # Skip schema reference doc
  if [[ "$filename" == "001_schema_reference.sql" ]]; then
    echo "SKIP $filename (reference doc)"
    continue
  fi

  # Check if already applied
  applied=$(psql -tAc "SELECT COUNT(*) FROM schema_migrations WHERE version = '$filename'")
  if [[ "$applied" -gt 0 ]]; then
    echo "SKIP $filename (already applied)"
    continue
  fi

  echo "APPLY $filename ..."
  psql -v ON_ERROR_STOP=1 -f "$migration"
  psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (version) VALUES ('$filename')"
  echo "  done: $filename applied"
done

echo ""
echo "=== Migration complete ==="
