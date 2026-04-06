#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path
import sys


def extract_up_sql(migration_path: Path) -> str:
    found_up = False
    in_up = False
    collected: list[str] = []

    for line in migration_path.read_text(encoding="utf-8").splitlines(keepends=True):
        marker = line.strip().lower()
        if marker == "-- migrate:up":
            found_up = True
            in_up = True
            continue
        if marker == "-- migrate:down":
            break
        if in_up:
            collected.append(line)

    if not found_up:
        raise ValueError(f"Missing -- migrate:up marker in {migration_path}")

    sql = "".join(collected).strip()
    if not sql:
        raise ValueError(f"Empty migrate:up section in {migration_path}")

    return sql


def main() -> int:
    migrations_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("db/migrations")
    migration_paths = sorted(migrations_dir.glob("*.sql"))

    if not migration_paths:
        raise FileNotFoundError(f"No migration files found under {migrations_dir}")

    rendered_chunks: list[str] = []
    for migration_path in migration_paths:
        rendered_chunks.append(f"-- {migration_path.as_posix()}\n")
        rendered_chunks.append(extract_up_sql(migration_path))
        rendered_chunks.append("\n\n")

    sys.stdout.write("".join(rendered_chunks))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
