# coding: utf-8
"""
bid_announcements.orderer_id (text) を agency_master.agency_name と照合し、
bid_announcements.agency_no を設定するマッピングスクリプト。

前提:
  - 20260404010000_agency_master_redesign.sql が適用済み
  - agency_master にデータが投入済み

Usage:
    python db/scripts/map_orderer_to_agency.py

    # Dry-run (変更せず結果のみ表示)
    python db/scripts/map_orderer_to_agency.py --dry-run

    # 部分一致の閾値を変更 (デフォルト: 0.6)
    python db/scripts/map_orderer_to_agency.py --threshold 0.5

Environment:
    PGHOST      PostgreSQL host     (default: localhost)
    PGPORT      PostgreSQL port     (default: 5432)
    PGDATABASE  Database name       (default: judgesystem)
    PGUSER      Database user       (default: postgres)
    PGPASSWORD  Database password   (default: postgres)
"""

import argparse
import os
import sys
from difflib import SequenceMatcher

# ---------------------------------------------------------------------------
# psycopg2 is available in the Docker/production environment.
# If running locally without it, fail early with a helpful message.
# ---------------------------------------------------------------------------
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Database connection
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
# Matching logic
# ---------------------------------------------------------------------------

def normalize(text):
    """Normalize a Japanese agency name for comparison."""
    if text is None:
        return ""
    # Strip whitespace (full-width and half-width)
    t = text.strip().replace("\u3000", "").replace(" ", "")
    return t


def similarity(a, b):
    """Return 0-1 similarity ratio between two strings."""
    return SequenceMatcher(None, a, b).ratio()


def match_orderer_to_agency(orderer_id, agency_map, threshold):
    """
    Try to match an orderer_id string to an agency_master entry.

    Returns:
        (agency_no, match_type)
        match_type: 'exact' | 'partial' | None
    """
    norm = normalize(orderer_id)
    if not norm:
        return None, None

    # 1) Exact match
    if norm in agency_map:
        return agency_map[norm], "exact"

    # 2) Substring match: orderer_id contains agency_name or vice-versa
    for agency_norm, agency_no in agency_map.items():
        if agency_norm and (agency_norm in norm or norm in agency_norm):
            return agency_no, "partial"

    # 3) Fuzzy match above threshold
    best_score = 0.0
    best_no = None
    for agency_norm, agency_no in agency_map.items():
        if not agency_norm:
            continue
        score = similarity(norm, agency_norm)
        if score > best_score:
            best_score = score
            best_no = agency_no

    if best_score >= threshold:
        return best_no, "partial"

    return None, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(
        description="Map bid_announcements.orderer_id to agency_master.agency_no"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show results without updating the database",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.6,
        help="Minimum similarity for fuzzy matching (0-1, default: 0.6)",
    )
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    print("=" * 70)
    print("orderer_id -> agency_no Mapping")
    print("=" * 70)
    if args.dry_run:
        print("  ** DRY RUN MODE (no database changes) **")
    print(f"  Fuzzy threshold: {args.threshold}")
    print()

    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            # ---------------------------------------------------------------
            # 1. Build agency name -> agency_no map
            # ---------------------------------------------------------------
            cur.execute("SELECT agency_no, agency_name FROM agency_master")
            agency_rows = cur.fetchall()

            agency_map = {}
            for row in agency_rows:
                norm = normalize(row["agency_name"])
                if norm:
                    agency_map[norm] = row["agency_no"]

            print(f"  agency_master entries: {len(agency_rows)}")
            print(f"  Normalized map entries: {len(agency_map)}")
            print()

            # ---------------------------------------------------------------
            # 2. Get distinct orderer_id values that need mapping
            # ---------------------------------------------------------------
            cur.execute("""
                SELECT DISTINCT orderer_id
                FROM bid_announcements
                WHERE orderer_id IS NOT NULL
                  AND TRIM(orderer_id) <> ''
                  AND agency_no IS NULL
            """)
            orderer_rows = cur.fetchall()
            print(f"  orderer_id values to map: {len(orderer_rows)}")
            print()

            # ---------------------------------------------------------------
            # 3. Match each orderer_id
            # ---------------------------------------------------------------
            exact_count = 0
            partial_matches = []
            no_match = []
            update_pairs = []  # (agency_no, orderer_id)

            for row in orderer_rows:
                oid = row["orderer_id"]
                agency_no, match_type = match_orderer_to_agency(
                    oid, agency_map, args.threshold
                )

                if match_type == "exact":
                    exact_count += 1
                    update_pairs.append((agency_no, oid))
                elif match_type == "partial":
                    # Find the agency name for logging
                    agency_name = ""
                    for name_norm, ano in agency_map.items():
                        if ano == agency_no:
                            agency_name = name_norm
                            break
                    partial_matches.append((oid, agency_no, agency_name))
                    update_pairs.append((agency_no, oid))
                else:
                    no_match.append(oid)

            # ---------------------------------------------------------------
            # 4. Report results
            # ---------------------------------------------------------------
            print("--- Results ---")
            print(f"  Exact matches:   {exact_count}")
            print(f"  Partial matches: {len(partial_matches)}")
            print(f"  No match:        {len(no_match)}")
            print()

            if partial_matches:
                print("--- Partial Matches (manual review recommended) ---")
                for oid, ano, aname in partial_matches:
                    print(f"  orderer_id: {oid!r}")
                    print(f"    -> agency_no={ano} ({aname})")
                    print()

            if no_match:
                print("--- No Match ---")
                for oid in no_match:
                    print(f"  orderer_id: {oid!r}")
                print()

            # ---------------------------------------------------------------
            # 5. Apply updates
            # ---------------------------------------------------------------
            if not args.dry_run and update_pairs:
                print(f"Updating {len(update_pairs)} rows...")
                cur.executemany(
                    """
                    UPDATE bid_announcements
                    SET agency_no = %s
                    WHERE orderer_id = %s
                      AND agency_no IS NULL
                    """,
                    update_pairs,
                )
                conn.commit()
                print(f"  Done. {len(update_pairs)} orderer_id values mapped.")
            elif args.dry_run and update_pairs:
                print(f"DRY RUN: Would update {len(update_pairs)} rows.")
            else:
                print("No updates to apply.")

    finally:
        conn.close()

    print()
    print("Complete.")


if __name__ == "__main__":
    main()
