#!/usr/bin/env python3
# coding: utf-8
"""
PostgreSQL テーブルの簡易バックアップスクリプト。

main.py の Postgres 接続オプションと同じ引数で接続情報を受け取り、
指定テーブルを {tablename}_{YYYYMMDDHHMM} 形式でコピーします。
"""

import argparse
from datetime import datetime

import psycopg2
from psycopg2 import sql


DEFAULT_TABLES = [
    "announcements_competing_companies_master",
    "announcements_competing_company_bids_master",
    "announcements_documents_master",
    "announcements_estimated_amounts",
    "backend_evaluation_statuses",
    "bid_announcements",
    "bid_orderers",
    "bid_requirements",
    "company_bid_judgement",
    "company_master",
    "evaluation_assignees",
    "insufficient_requirements",
    "office_master",
    "partners_branches",
    "partners_categories",
    "partners_master",
    "partners_past_projects",
    "partners_qualifications_orderer_items",
    "partners_qualifications_orderers",
    "partners_qualifications_unified",
    "similar_cases_competitors",
    "similar_cases_master",
    "sufficient_requirements",
    "workflow_contacts",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="指定した Postgres テーブルを {name}_YYYYMMDDHHMM にバックアップします。"
    )
    parser.add_argument("--postgres_host", required=True)
    parser.add_argument("--postgres_port", type=int, default=5432)
    parser.add_argument("--postgres_database", required=True)
    parser.add_argument("--postgres_user", required=True)
    parser.add_argument("--postgres_password", required=True)
    parser.add_argument("--schema", default="public", help="対象スキーマ（デフォルト: public）")
    parser.add_argument(
        "--timestamp",
        default=datetime.now().strftime("%Y%m%d%H%M"),
        help="バックアップ名に使うタイムスタンプ（YYYYMMDDHHMM）。未指定なら現在時刻。",
    )
    parser.add_argument(
        "--tables",
        nargs="+",
        default=DEFAULT_TABLES,
        help="バックアップ対象テーブル（省略時は既定リスト）",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="既に同名バックアップがあれば DROP して再作成する",
    )
    return parser.parse_args()


def table_exists(cur, schema, table_name):
    cur.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = %s AND table_name = %s
        )
        """,
        (schema, table_name),
    )
    return cur.fetchone()[0]


def drop_table(cur, schema, table_name):
    cur.execute(
        sql.SQL("DROP TABLE {}.{}").format(
            sql.Identifier(schema),
            sql.Identifier(table_name),
        )
    )


def create_backup(cur, schema, source_table, backup_table):
    cur.execute(
        sql.SQL("CREATE TABLE {}.{} AS TABLE {}.{}").format(
            sql.Identifier(schema),
            sql.Identifier(backup_table),
            sql.Identifier(schema),
            sql.Identifier(source_table),
        )
    )


def main():
    args = parse_args()
    conn = psycopg2.connect(
        host=args.postgres_host,
        port=args.postgres_port,
        dbname=args.postgres_database,
        user=args.postgres_user,
        password=args.postgres_password,
    )

    schema = args.schema
    tables = args.tables
    timestamp = args.timestamp

    with conn:
        with conn.cursor() as cur:
            for table in tables:
                backup_name = f"{table}_{timestamp}"
                print(f"[INFO] Backing up {schema}.{table} -> {schema}.{backup_name}")

                if not table_exists(cur, schema, table):
                    print(f"  [WARN] source table missing. skipped.")
                    continue

                if table_exists(cur, schema, backup_name):
                    if args.force:
                        print("  [INFO] Existing backup found. Dropping before recreate.")
                        drop_table(cur, schema, backup_name)
                    else:
                        print("  [SKIP] Backup already exists. Use --force to overwrite.")
                        continue

                create_backup(cur, schema, table, backup_name)
                print("  [DONE]")

    conn.close()


if __name__ == "__main__":
    main()
