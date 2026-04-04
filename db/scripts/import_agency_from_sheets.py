# coding: utf-8
"""
Google Spreadsheet (CSV export) から agency_master を UPSERT 更新する。

標準ライブラリのみ使用 (urllib + csv)。psycopg2 のみ外部依存。

Source:
  https://docs.google.com/spreadsheets/d/11K-4xfjeSJGhqT0Ss4yCkRNvLhor-D7AInPhZRNsHXQ/gviz/tq?tqx=out:csv&gid=532176144

Usage:
    python db/scripts/import_agency_from_sheets.py

    # Dry-run (fetch + parse only, no DB changes)
    python db/scripts/import_agency_from_sheets.py --dry-run

    # Use a local CSV file instead of fetching
    python db/scripts/import_agency_from_sheets.py --file agency.csv

    # Custom DB connection
    PGHOST=db PGDATABASE=mydb python db/scripts/import_agency_from_sheets.py

Environment:
    PGHOST      PostgreSQL host     (default: localhost)
    PGPORT      PostgreSQL port     (default: 5432)
    PGDATABASE  Database name       (default: judgesystem)
    PGUSER      Database user       (default: postgres)
    PGPASSWORD  Database password   (default: postgres)
"""

import argparse
import csv
import io
import os
import sys
import urllib.request
import urllib.error

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SPREADSHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "11K-4xfjeSJGhqT0Ss4yCkRNvLhor-D7AInPhZRNsHXQ"
    "/gviz/tq?tqx=out:csv&gid=532176144"
)

# Spreadsheet column name -> agency_master column name
COLUMN_MAP = {
    "発注機関連番": "agency_no",
    "発注機関名称": "agency_name",
    "上位発注機関連番": "parent_agency_no",
    "発注機関階層レベル": "agency_level",
    "ソート順": "sort_order",
    "管轄地域": "agency_area",
    "公式サイトURL": "official_url",
    "備考": "remarks",
}

# agency_no=1 is the procurement framework root ("全省庁統一").
# Its direct children (parent_agency_no=1) are also framework entries.
PROCUREMENT_FRAMEWORK_ROOT_NO = 1


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_connection():
    """Create a PostgreSQL connection from environment variables."""
    return psycopg2.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        dbname=os.environ.get("PGDATABASE", "judgesystem"),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", "postgres"),
    )


# ---------------------------------------------------------------------------
# CSV Fetch & Parse
# ---------------------------------------------------------------------------

def fetch_csv(url):
    """Fetch CSV text from a URL using urllib (stdlib only)."""
    print(f"  Fetching: {url[:80]}...")
    req = urllib.request.Request(url, headers={"User-Agent": "judgesystem-importer/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
    except urllib.error.URLError as e:
        print(f"  ERROR: Failed to fetch CSV: {e}")
        sys.exit(1)

    # Google Sheets CSV export is UTF-8
    return raw.decode("utf-8")


def load_csv_from_file(path):
    """Load CSV text from a local file."""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def parse_csv(csv_text):
    """
    Parse CSV text into a list of agency dicts.

    Returns:
        list[dict] with keys matching agency_master columns
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    rows = []

    # Build reverse map: spreadsheet header -> db column
    header_to_db = {}
    for sheet_col, db_col in COLUMN_MAP.items():
        header_to_db[sheet_col] = db_col

    for line_no, raw_row in enumerate(reader, start=2):
        record = {}
        for sheet_col, db_col in header_to_db.items():
            value = raw_row.get(sheet_col, "").strip()
            record[db_col] = value if value else None

        # Validate agency_no (required, must be integer)
        if record.get("agency_no") is None:
            print(f"  WARN: Line {line_no} skipped (no agency_no)")
            continue
        try:
            record["agency_no"] = int(record["agency_no"])
        except (ValueError, TypeError):
            print(f"  WARN: Line {line_no} skipped (invalid agency_no: {record['agency_no']!r})")
            continue

        # Convert numeric fields
        for field in ("parent_agency_no", "agency_level", "sort_order"):
            val = record.get(field)
            if val is not None:
                try:
                    record[field] = int(val)
                except (ValueError, TypeError):
                    record[field] = None

        # Determine is_procurement_framework
        agency_no = record["agency_no"]
        parent_no = record.get("parent_agency_no")
        record["is_procurement_framework"] = (
            agency_no == PROCUREMENT_FRAMEWORK_ROOT_NO
            or parent_no == PROCUREMENT_FRAMEWORK_ROOT_NO
        )

        rows.append(record)

    return rows


# ---------------------------------------------------------------------------
# UPSERT
# ---------------------------------------------------------------------------

def upsert_agencies(conn, rows, dry_run=False):
    """
    UPSERT rows into agency_master.

    Uses agency_no as the conflict key. Existing rows are updated,
    new rows are inserted.

    NOTE: agency_master.agency_no does not have a UNIQUE or PRIMARY KEY
    constraint in baseline.sql. We add a temporary unique index if needed,
    or use a DELETE+INSERT approach for safety.
    """
    if not rows:
        print("  No rows to upsert.")
        return

    if dry_run:
        print(f"  DRY RUN: Would upsert {len(rows)} rows.")
        return

    with conn.cursor() as cur:
        # Ensure a unique constraint exists on agency_no for ON CONFLICT.
        # If it already exists, this is a no-op.
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_master_agency_no
            ON agency_master (agency_no)
        """)

        inserted = 0
        updated = 0

        for row in rows:
            cur.execute(
                """
                INSERT INTO agency_master (
                    agency_no, agency_name, parent_agency_no,
                    agency_level, sort_order, agency_area,
                    official_url, remarks,
                    is_procurement_framework,
                    created_at, updated_at
                )
                VALUES (
                    %(agency_no)s, %(agency_name)s, %(parent_agency_no)s,
                    %(agency_level)s, %(sort_order)s, %(agency_area)s,
                    %(official_url)s, %(remarks)s,
                    %(is_procurement_framework)s,
                    NOW(), NOW()
                )
                ON CONFLICT (agency_no) DO UPDATE SET
                    agency_name              = EXCLUDED.agency_name,
                    parent_agency_no         = EXCLUDED.parent_agency_no,
                    agency_level             = EXCLUDED.agency_level,
                    sort_order               = EXCLUDED.sort_order,
                    agency_area              = EXCLUDED.agency_area,
                    official_url             = EXCLUDED.official_url,
                    remarks                  = EXCLUDED.remarks,
                    is_procurement_framework = EXCLUDED.is_procurement_framework,
                    updated_at               = NOW()
                """,
                row,
            )
            # xmax = 0 means a fresh insert; xmax > 0 means an update
            cur.execute("SELECT xmax FROM agency_master WHERE agency_no = %s", (row["agency_no"],))
            xmax_row = cur.fetchone()
            if xmax_row and xmax_row[0] == 0:
                inserted += 1
            else:
                updated += 1

        conn.commit()
        print(f"  Inserted: {inserted}")
        print(f"  Updated:  {updated}")
        print(f"  Total:    {len(rows)}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(
        description="Import agency_master from Google Spreadsheet (CSV export)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and parse only, do not update database",
    )
    parser.add_argument(
        "--file",
        type=str,
        default=None,
        help="Use a local CSV file instead of fetching from Google Sheets",
    )
    parser.add_argument(
        "--url",
        type=str,
        default=SPREADSHEET_CSV_URL,
        help="Override the Spreadsheet CSV URL",
    )
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    print("=" * 70)
    print("agency_master Import from Spreadsheet")
    print("=" * 70)
    if args.dry_run:
        print("  ** DRY RUN MODE **")
    print()

    # ----- Fetch CSV -----
    print("Step 1: Fetch CSV data")
    if args.file:
        print(f"  Source: local file {args.file}")
        csv_text = load_csv_from_file(args.file)
    else:
        print(f"  Source: Google Sheets")
        csv_text = fetch_csv(args.url)

    line_count = csv_text.count("\n")
    print(f"  Lines: {line_count}")
    print()

    # ----- Parse -----
    print("Step 2: Parse CSV")
    rows = parse_csv(csv_text)
    print(f"  Valid rows: {len(rows)}")

    # Summary
    framework_count = sum(1 for r in rows if r["is_procurement_framework"])
    print(f"  Procurement framework entries: {framework_count}")
    print()

    # Preview first 5 rows
    print("  Preview (first 5 rows):")
    for row in rows[:5]:
        flag = " [framework]" if row["is_procurement_framework"] else ""
        print(f"    {row['agency_no']:>5}  {row.get('agency_name', ''):30s}  "
              f"parent={row.get('parent_agency_no', '-'):>5}  "
              f"level={row.get('agency_level', '-')}{flag}")
    if len(rows) > 5:
        print(f"    ... and {len(rows) - 5} more rows")
    print()

    # ----- UPSERT -----
    print("Step 3: UPSERT into agency_master")
    if args.dry_run:
        print(f"  DRY RUN: Would upsert {len(rows)} rows. Skipping DB operations.")
    else:
        conn = get_connection()
        try:
            upsert_agencies(conn, rows, dry_run=False)
        finally:
            conn.close()

    print()
    print("Complete.")


if __name__ == "__main__":
    main()
