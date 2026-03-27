import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from packages.engine.repository import (
    DBOperatorGCPVM,
    DBOperatorPOSTGRES,
    DBOperatorSQLITE3,
)


def _create_db_operator(args):
    if args.use_gcp_vm:
        if not all([args.bigquery_project_id, args.bigquery_dataset_name]):
            print("Error: --bigquery_project_id and --bigquery_dataset_name are required with --use_gcp_vm")
            sys.exit(1)
        return DBOperatorGCPVM(
            bigquery_location=args.bigquery_location,
            bigquery_project_id=args.bigquery_project_id,
            bigquery_dataset_name=args.bigquery_dataset_name,
        )
    if args.use_postgres:
        required = [
            args.postgres_host,
            args.postgres_database,
            args.postgres_user,
            args.postgres_password,
        ]
        if not all(required):
            print("Error: postgres connection parameters are required with --use_postgres")
            sys.exit(1)
        return DBOperatorPOSTGRES(
            postgres_host=args.postgres_host,
            postgres_port=args.postgres_port,
            postgres_database=args.postgres_database,
            postgres_user=args.postgres_user,
            postgres_password=args.postgres_password,
        )
    if not args.sqlite3_db_file_path:
        print("Error: --sqlite3_db_file_path is required when not using --use_gcp_vm or --use_postgres.")
        sys.exit(1)
    db_path = Path(args.sqlite3_db_file_path)
    if not db_path.exists():
        print(f"Error: SQLite database file not found: {db_path}")
        sys.exit(1)
    return DBOperatorSQLITE3(sqlite3_db_file_path=str(db_path))


def _load_source_pages(json_path: Path):
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"{json_path} must be an array JSON")
    rows = []
    now = datetime.now(timezone.utc).isoformat()
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        page_code = str(entry.get("page_code") or "").strip()
        if not page_code:
            continue
        row = {
            "id": entry.get("id") or page_code or str(uuid.uuid4()),
            "agency_id": entry.get("agency_id"),
            "agency_name": entry.get("agency_name"),
            "top_agency_name": entry.get("top_agency_name") or entry.get("agency_name"),
            "sub_agency_name": entry.get("sub_agency_name"),
            "page_code": page_code,
            "page_name": entry.get("page_name"),
            "source_url": entry.get("source_url"),
            "submitted_source_url": entry.get("submitted_source_url"),
            "extractor_name": entry.get("extractor_name") or "structured_page",
            "page_behavior_json": json.dumps(entry.get("page_behavior_json") or {}),
            "matrix_header_keywords": json.dumps(entry.get("matrix_header_keywords") or []),
            "force_matrix": bool(entry.get("force_matrix")),
            "is_active": bool(entry.get("is_active", True)),
            "created_at": entry.get("created_at") or now,
            "updated_at": entry.get("updated_at") or now,
        }
        rows.append(row)
    return rows


def build_parser():
    parser = argparse.ArgumentParser(description="Sync source_pages JSON into the configured database")
    parser.add_argument("--source-json", default="config/source_pages.generated.json")
    parser.add_argument("--use_gcp_vm", action="store_true")
    parser.add_argument("--use_postgres", action="store_true")
    parser.add_argument("--sqlite3_db_file_path", default=None)
    parser.add_argument("--bigquery_location", default=None)
    parser.add_argument("--bigquery_project_id", default=None)
    parser.add_argument("--bigquery_dataset_name", default=None)
    parser.add_argument("--postgres_host", default=None)
    parser.add_argument("--postgres_port", type=int, default=5432)
    parser.add_argument("--postgres_database", default=None)
    parser.add_argument("--postgres_user", default=None)
    parser.add_argument("--postgres_password", default=None)
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    json_path = Path(args.source_json)
    if not json_path.exists():
        print(f"Error: source JSON not found: {json_path}")
        return 1
    try:
        rows = _load_source_pages(json_path)
    except Exception as exc:
        print(f"Error: failed to read {json_path}: {exc}")
        return 1
    if not rows:
        print(f"Warning: no source definitions found in {json_path}")
        return 0
    operator = _create_db_operator(args)
    operator.sync_source_pages(rows)
    print(f"Synchronized {len(rows)} source definitions from {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
