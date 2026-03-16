#!/usr/bin/env python
# coding: utf-8

"""
BigQuery から PostgreSQL へのデータ移行スクリプト

対象テーブル：
- bid_requirements
- bid_announcements
- announcements_documents_master

実行方法：
    # プロジェクトルート、またはどのディレクトリからでも実行可能
    # スクリプトが自動的にプロジェクトルートに移動します

使用方法：
    # 基本的な使用（デフォルト3テーブル、一括INSERT、最速）
    python source/bid_announcement_judgement_tools/migrate_bq_to_postgres.py \
        --bigquery_location "asia-northeast1" \
        --bigquery_project_id YOUR_PROJECT_ID \
        --bigquery_dataset_name YOUR_DATASET \
        --postgres_host localhost \
        --postgres_port 5432 \
        --postgres_database biddb \
        --postgres_user postgres \
        --postgres_password YOUR_PASSWORD

    # 特定のテーブルのみ移行
    python source/bid_announcement_judgement_tools/migrate_bq_to_postgres.py \
        --bigquery_location "asia-northeast1" \
        --bigquery_project_id YOUR_PROJECT_ID \
        --bigquery_dataset_name YOUR_DATASET \
        --postgres_host localhost \
        --postgres_port 5432 \
        --postgres_database biddb \
        --postgres_user postgres \
        --postgres_password YOUR_PASSWORD \
        --tables bid_announcements bid_requirements

    # メモリ不足時のみchunk_sizeを指定（遅くなります）
    python source/bid_announcement_judgement_tools/migrate_bq_to_postgres.py \
        --bigquery_location "asia-northeast1" \
        --bigquery_project_id YOUR_PROJECT_ID \
        --bigquery_dataset_name YOUR_DATASET \
        --postgres_host localhost \
        --postgres_port 5432 \
        --postgres_database biddb \
        --postgres_user postgres \
        --postgres_password YOUR_PASSWORD \
        --chunk_size 5000

    # 既存テーブルを削除して再作成（型を再定義）
    python source/bid_announcement_judgement_tools/migrate_bq_to_postgres.py \
        --bigquery_location "asia-northeast1" \
        --bigquery_project_id YOUR_PROJECT_ID \
        --bigquery_dataset_name YOUR_DATASET \
        --postgres_host localhost \
        --postgres_port 5432 \
        --postgres_database biddb \
        --postgres_user postgres \
        --postgres_password YOUR_PASSWORD \
        --force_recreate
"""

import argparse
import sys
import os
from pathlib import Path

# プロジェクトルートに移動（main.pyが相対パスでdata/を参照するため）
script_dir = Path(__file__).parent
project_root = script_dir.parent.parent
os.chdir(project_root)

# main.pyをimport可能にする
sys.path.insert(0, str(script_dir))

from main import DBOperatorGCPVM, DBOperatorPOSTGRES

def create_table_if_needed(pg_operator, table_name, force_recreate=False):
    """
    PostgreSQLにテーブルが存在しない場合、DBOperatorのcreateメソッドで作成

    Args:
        pg_operator: PostgreSQL DBOperator
        table_name: テーブル名
        force_recreate: 既存テーブルを削除して再作成するか

    Returns:
        bool: 成功したかどうか
    """
    table_exists = pg_operator.ifTableExists(table_name)

    if table_exists and not force_recreate:
        print(f"ℹ️  Table {table_name} already exists in PostgreSQL (will append data)")
        return True

    if table_exists and force_recreate:
        print(f"🗑️  Dropping existing table {table_name}...")
        pg_operator.dropTable(table_name)

    print(f"🔨 Creating table {table_name} with proper schema...")

    try:
        # テーブルごとにcreateメソッドを呼び出す
        if table_name == "bid_announcements":
            pg_operator.createBidAnnouncementsV2(table_name)
        elif table_name == "bid_requirements":
            pg_operator.createBidRequirements(table_name)
        elif table_name == "announcements_documents_master":
            # announcements_documents_masterのcreateメソッドは未実装の可能性
            # 存在しない場合はスキップ（to_sqlで自動作成）
            print(f"⚠️  No create method for {table_name}, will use pandas auto-creation")
            return True
        else:
            print(f"⚠️  Unknown table {table_name}, will use pandas auto-creation")
            return True

        print(f"✅ Table {table_name} created successfully")
        return True
    except Exception as e:
        print(f"❌ Error creating table: {str(e)}")
        return False

def migrate_table(bq_operator, pg_operator, table_name, chunk_size=None, force_recreate=False):
    """
    BigQueryからPostgreSQLにテーブルをマイグレーション

    Args:
        bq_operator: BigQuery DBOperator
        pg_operator: PostgreSQL DBOperator
        table_name: テーブル名
        chunk_size: アップロード時のチャンクサイズ（Noneなら一括INSERT、最速）
        force_recreate: 既存テーブルを削除して再作成するか
    """
    print(f"\n{'='*60}")
    print(f"Migrating table: {table_name}")
    print(f"{'='*60}")

    # BigQueryからテーブルが存在するか確認
    if not bq_operator.ifTableExists(table_name):
        print(f"❌ Table {table_name} does not exist in BigQuery")
        return False

    # BigQueryから全データ取得
    print(f"📥 Fetching data from BigQuery...")
    sql = f"SELECT * FROM `{bq_operator.project_id}.{bq_operator.dataset_name}.{table_name}`"
    try:
        df = bq_operator.any_query(sql)
        print(f"✅ Fetched {len(df)} rows from BigQuery")
    except Exception as e:
        print(f"❌ Error fetching data: {str(e)}")
        return False

    if len(df) == 0:
        print(f"⚠️  Table {table_name} is empty, skipping upload")
        return True

    # PostgreSQLにテーブルを作成（必要に応じて）
    if not create_table_if_needed(pg_operator, table_name, force_recreate):
        return False

    # PostgreSQLにアップロード
    if chunk_size:
        print(f"📤 Uploading data to PostgreSQL (chunk_size={chunk_size})...")
    else:
        print(f"📤 Uploading data to PostgreSQL (bulk insert - fastest)...")

    try:
        # テーブルが既に存在する場合は append、存在しない場合は fail
        if_exists_mode = "append" if pg_operator.ifTableExists(table_name) else "fail"

        # uploadDataToTableは if_exists="replace" を使うので、直接to_sqlを呼ぶ
        if chunk_size:
            df.to_sql(table_name, pg_operator.engine, if_exists=if_exists_mode, index=False, chunksize=chunk_size)
        else:
            df.to_sql(table_name, pg_operator.engine, if_exists=if_exists_mode, index=False)

        print(f"✅ Successfully uploaded {len(df)} rows to PostgreSQL")
        return True
    except Exception as e:
        print(f"❌ Error uploading data: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Migrate tables from BigQuery to PostgreSQL")

    # BigQuery parameters
    parser.add_argument("--bigquery_location", required=True, help="BigQuery location")
    parser.add_argument("--bigquery_project_id", required=True, help="BigQuery project ID")
    parser.add_argument("--bigquery_dataset_name", required=True, help="BigQuery dataset name")

    # PostgreSQL parameters
    parser.add_argument("--postgres_host", required=True, help="PostgreSQL host")
    parser.add_argument("--postgres_port", type=int, default=5432, help="PostgreSQL port")
    parser.add_argument("--postgres_database", required=True, help="PostgreSQL database")
    parser.add_argument("--postgres_user", required=True, help="PostgreSQL user")
    parser.add_argument("--postgres_password", required=True, help="PostgreSQL password")

    # Optional parameters
    parser.add_argument("--chunk_size", type=int, default=None,
                       help="Chunk size for upload (default: None for bulk insert, fastest)")
    parser.add_argument("--tables", nargs="+",
                       default=["bid_requirements", "bid_announcements", "announcements_documents_master"],
                       help="Tables to migrate")
    parser.add_argument("--force_recreate", action="store_true",
                       help="Drop and recreate tables even if they exist")

    args = parser.parse_args()

    print("\n" + "="*60)
    print("BigQuery to PostgreSQL Migration")
    print("="*60)

    # DBOperator作成
    print("\n📡 Connecting to BigQuery...")
    try:
        bq_operator = DBOperatorGCPVM(
            bigquery_location=args.bigquery_location,
            bigquery_project_id=args.bigquery_project_id,
            bigquery_dataset_name=args.bigquery_dataset_name
        )
        print("✅ Connected to BigQuery")
    except Exception as e:
        print(f"❌ Failed to connect to BigQuery: {str(e)}")
        sys.exit(1)

    print("\n📡 Connecting to PostgreSQL...")
    try:
        pg_operator = DBOperatorPOSTGRES(
            postgres_host=args.postgres_host,
            postgres_port=args.postgres_port,
            postgres_database=args.postgres_database,
            postgres_user=args.postgres_user,
            postgres_password=args.postgres_password
        )
        print("✅ Connected to PostgreSQL")
    except Exception as e:
        print(f"❌ Failed to connect to PostgreSQL: {str(e)}")
        sys.exit(1)

    # テーブルごとに移行
    results = {}
    for table_name in args.tables:
        success = migrate_table(bq_operator, pg_operator, table_name, args.chunk_size, args.force_recreate)
        results[table_name] = success

    # 結果サマリー
    print("\n" + "="*60)
    print("Migration Summary")
    print("="*60)
    for table_name, success in results.items():
        status = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"{table_name}: {status}")

    # 全て成功したかチェック
    if all(results.values()):
        print("\n🎉 All tables migrated successfully!")
        sys.exit(0)
    else:
        print("\n⚠️  Some tables failed to migrate")
        sys.exit(1)

if __name__ == "__main__":
    main()
