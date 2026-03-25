# coding: utf-8
"""
Google Sheets から協力会社データを一括インポートするスクリプト。

4つのスプレッドシート × 47シート（都道府県別）のデータを読み取り、
partners_master / partners_categories テーブルに投入する。

Usage:
    python -m packages.engine.cli.import_partners_from_sheets \
        --credentials /path/to/service-account.json \
        --postgres_host localhost \
        --postgres_port 5432 \
        --postgres_database judgesystem \
        --postgres_user postgres \
        --postgres_password password

    # dry-run（DBに書き込まない）
    python -m packages.engine.cli.import_partners_from_sheets \
        --credentials /path/to/service-account.json \
        --dry-run

    # 特定のスプレッドシートのみ
    python -m packages.engine.cli.import_partners_from_sheets \
        --credentials /path/to/service-account.json \
        --spreadsheet-ids 1ZYUUCGhM0CYP1_nbSrYMsFkN8ywJznnrNp8XRCVg_LI

Environment:
    GOOGLE_APPLICATION_CREDENTIALS  サービスアカウントJSONキーのパス
    PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD  PostgreSQL接続情報
"""

import argparse
import os
import sys
import time
import uuid
from datetime import datetime

import gspread
import psycopg2
from google.oauth2.service_account import Credentials

# --- 対象スプレッドシートID ---
DEFAULT_SPREADSHEET_IDS = [
    "1ZYUUCGhM0CYP1_nbSrYMsFkN8ywJznnrNp8XRCVg_LI",
    "14bha1Ksi8Gk7jQZINVJAB9Vt-eQ2jAD-GugkCQQwyuU",
    "1AJxEMQMyiHx5PUcWr9FkvnmWFb1pnzpX5Gvxr-0zz50",
    "1h1wIauQg7urfjtC5QEskS8COYQdaJztHALd6kgwYigg",
]

# --- スプレッドシートのカラム → DB カラムマッピング ---
COLUMN_MAP = {
    "会社名": "name",
    "郵便番号": "postalCode",
    "住所": "address",
    "電話番号": "phone",
    "FAX番号": "fax",
    "メールアドレス": "email",
    "ホームページURL": "url",
    "詳細ページのURL": "detail_url",
}

# カテゴリ系カラム（partners_categories に投入）
CATEGORY_COLUMNS = [
    "カテゴリ1",
    "カテゴリ2",
    "カテゴリ3",
    "業種",
    "取り扱い",
    "営業種目",
    "建設工事",
    "設備工事",
    "不動産",
    "リフォーム",
    "カテゴリ",
    "type",
]

# Google Sheets API スコープ
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]


def generate_partner_id(name: str, address: str) -> str:
    """会社名+住所から決定的なpartner_idを生成（べき等性保証）。"""
    key = f"{name or ''}::{address or ''}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, key))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Google Sheets から協力会社データを一括インポート"
    )
    parser.add_argument(
        "--credentials",
        default=os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"),
        help="GCPサービスアカウントJSONキーのパス (env: GOOGLE_APPLICATION_CREDENTIALS)",
    )
    parser.add_argument(
        "--spreadsheet-ids",
        nargs="+",
        default=None,
        help="対象スプレッドシートID（省略時は全4シート）",
    )
    parser.add_argument(
        "--postgres_host",
        default=os.environ.get("PGHOST", "localhost"),
    )
    parser.add_argument(
        "--postgres_port",
        type=int,
        default=int(os.environ.get("PGPORT", "5432")),
    )
    parser.add_argument(
        "--postgres_database",
        default=os.environ.get("PGDATABASE", "judgesystem"),
    )
    parser.add_argument(
        "--postgres_user",
        default=os.environ.get("PGUSER", "postgres"),
    )
    parser.add_argument(
        "--postgres_password",
        default=os.environ.get("PGPASSWORD", ""),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="読み取りのみ（DBに書き込まない）",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="一度にINSERTする行数（デフォルト: 500）",
    )
    parser.add_argument(
        "--rate-limit-delay",
        type=float,
        default=1.0,
        help="シート間のAPI待機秒数（デフォルト: 1.0）",
    )
    return parser


def connect_sheets(credentials_path: str) -> gspread.Client:
    """Google Sheets API クライアントを初期化。"""
    creds = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
    return gspread.authorize(creds)


def connect_db(args) -> psycopg2.extensions.connection:
    """PostgreSQL に接続。"""
    conn = psycopg2.connect(
        host=args.postgres_host,
        port=args.postgres_port,
        database=args.postgres_database,
        user=args.postgres_user,
        password=args.postgres_password,
    )
    return conn


def read_all_sheets(client: gspread.Client, spreadsheet_ids: list[str], delay: float):
    """全スプレッドシートの全シートを読み取り、行データを生成する。"""
    for ss_idx, ss_id in enumerate(spreadsheet_ids, 1):
        print(f"\n[{ss_idx}/{len(spreadsheet_ids)}] スプレッドシート: {ss_id}")
        try:
            spreadsheet = client.open_by_key(ss_id)
        except gspread.exceptions.SpreadsheetNotFound:
            print(f"  ERROR: スプレッドシートが見つかりません（共有設定を確認してください）")
            continue
        except gspread.exceptions.APIError as e:
            print(f"  ERROR: API エラー: {e}")
            continue

        worksheets = spreadsheet.worksheets()
        print(f"  シート数: {len(worksheets)}")

        for ws_idx, ws in enumerate(worksheets, 1):
            sheet_name = ws.title
            print(f"  [{ws_idx}/{len(worksheets)}] {sheet_name} ... ", end="", flush=True)

            try:
                records = ws.get_all_records(expected_headers=[])
            except gspread.exceptions.APIError as e:
                # レート制限対応: 指数バックオフ
                if "RATE_LIMIT_EXCEEDED" in str(e) or "429" in str(e):
                    records = None
                    for retry in range(3):
                        wait = 60 * (2 ** retry)  # 60s, 120s, 240s
                        print(f"RATE LIMITED, waiting {wait}s (retry {retry + 1}/3)...")
                        time.sleep(wait)
                        try:
                            records = ws.get_all_records(expected_headers=[])
                            break
                        except gspread.exceptions.APIError:
                            continue
                    if records is None:
                        print(f"SKIP (max retries exceeded)")
                        continue
                else:
                    print(f"SKIP (API error: {e})")
                    continue
            except Exception as e:
                print(f"SKIP ({e})")
                continue

            print(f"{len(records)} rows")

            for row in records:
                yield row, sheet_name, ss_id

            # レート制限回避
            if delay > 0:
                time.sleep(delay)


def transform_row(row: dict, sheet_name: str, spreadsheet_id: str):
    """スプレッドシートの行を partners_master / partners_categories 用に変換。"""
    name = str(row.get("会社名", "")).strip()
    if not name:
        return None, []

    address = str(row.get("住所", "")).strip()
    partner_id = generate_partner_id(name, address)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    master = {
        "partner_id": partner_id,
        "name": name,
        "company_name": name,
        "postalCode": str(row.get("郵便番号", "")).strip(),
        "address": address,
        "phone": str(row.get("電話番号", "")).strip(),
        "fax": str(row.get("FAX番号", "")).strip(),
        "email": str(row.get("メールアドレス", "")).strip(),
        "url": str(row.get("ホームページURL", "")).strip(),
        "detail_url": str(row.get("詳細ページのURL", "")).strip(),
        "region": sheet_name,  # シート名 = 都道府県名
        "is_active": True,
        "createdDate": now,
        "updatedDate": now,
    }

    # カテゴリ収集
    categories = []
    for col in CATEGORY_COLUMNS:
        val = str(row.get(col, "")).strip()
        if val and val != "0" and val.lower() != "nan":
            categories.append(val)

    # 重複除去して返す
    seen = set()
    unique_categories = []
    for c in categories:
        if c not in seen:
            seen.add(c)
            unique_categories.append(c)

    return master, unique_categories


def upsert_partners(conn, masters: list[dict], categories_map: dict[str, list[str]], batch_size: int):
    """partners_master と partners_categories に UPSERT。"""
    cur = conn.cursor()

    insert_master_sql = """
        INSERT INTO partners_master (
            partner_id, name, company_name, "postalCode", address,
            phone, fax, email, url, detail_url, region,
            is_active, "createdDate", "updatedDate"
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s
        )
        ON CONFLICT (partner_id) DO UPDATE SET
            name = EXCLUDED.name,
            company_name = EXCLUDED.company_name,
            "postalCode" = EXCLUDED."postalCode",
            address = EXCLUDED.address,
            phone = EXCLUDED.phone,
            fax = EXCLUDED.fax,
            email = EXCLUDED.email,
            url = EXCLUDED.url,
            detail_url = EXCLUDED.detail_url,
            region = EXCLUDED.region,
            "updatedDate" = EXCLUDED."updatedDate"
    """

    insert_category_sql = """
        INSERT INTO partners_categories (partner_id, categories)
        VALUES (%s, %s)
    """

    total = len(masters)
    inserted = 0
    updated = 0

    for i in range(0, total, batch_size):
        batch = masters[i : i + batch_size]

        for m in batch:
            # UPSERT: 存在チェック
            cur.execute(
                "SELECT 1 FROM partners_master WHERE partner_id = %s",
                (m["partner_id"],),
            )
            is_update = cur.fetchone() is not None

            cur.execute(
                insert_master_sql,
                (
                    m["partner_id"], m["name"], m["company_name"],
                    m["postalCode"], m["address"],
                    m["phone"], m["fax"], m["email"], m["url"],
                    m["detail_url"], m["region"],
                    m["is_active"], m["createdDate"], m["updatedDate"],
                ),
            )

            if is_update:
                updated += 1
            else:
                inserted += 1

            # カテゴリ: 既存を削除して再投入
            pid = m["partner_id"]
            cur.execute("DELETE FROM partners_categories WHERE partner_id = %s", (pid,))
            for cat in categories_map.get(pid, []):
                cur.execute(insert_category_sql, (pid, cat))

        conn.commit()
        print(f"  バッチ {i + 1}~{min(i + batch_size, total)}/{total} 完了")

    cur.close()
    return inserted, updated


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    # --- バリデーション ---
    if not args.credentials:
        print("ERROR: --credentials または GOOGLE_APPLICATION_CREDENTIALS が必要です")
        print()
        print("セットアップ手順:")
        print("  1. GCPコンソール → IAM → サービスアカウント → キーを作成（JSON）")
        print("  2. Google Sheets API を有効化")
        print("  3. スプレッドシートをサービスアカウントのメールアドレスに共有")
        print("  4. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json")
        sys.exit(1)

    if not os.path.exists(args.credentials):
        print(f"ERROR: 認証ファイルが見つかりません: {args.credentials}")
        sys.exit(1)

    spreadsheet_ids = args.spreadsheet_ids or DEFAULT_SPREADSHEET_IDS

    print("=" * 60)
    print("協力会社データ インポーター")
    print("=" * 60)
    print(f"  対象スプレッドシート数: {len(spreadsheet_ids)}")
    print(f"  Dry Run: {'はい' if args.dry_run else 'いいえ'}")
    print(f"  バッチサイズ: {args.batch_size}")
    print(f"  レート制限待機: {args.rate_limit_delay}秒")
    print()

    # --- Google Sheets 接続 ---
    print("Google Sheets API に接続中...")
    client = connect_sheets(args.credentials)
    print("  接続成功")

    # --- 全シート読み取り ---
    print("\nデータ読み取り開始...")
    masters = {}  # partner_id -> master dict
    categories_map = {}  # partner_id -> [category, ...]
    skip_count = 0
    duplicate_count = 0

    for row, sheet_name, ss_id in read_all_sheets(client, spreadsheet_ids, args.rate_limit_delay):
        master, cats = transform_row(row, sheet_name, ss_id)
        if master is None:
            skip_count += 1
            continue

        pid = master["partner_id"]
        if pid in masters:
            duplicate_count += 1
            # 既存のカテゴリにマージ
            existing = set(categories_map.get(pid, []))
            existing.update(cats)
            categories_map[pid] = list(existing)
        else:
            masters[pid] = master
            categories_map[pid] = cats

    print(f"\n--- 読み取り結果 ---")
    print(f"  ユニーク企業数: {len(masters)}")
    print(f"  重複スキップ: {duplicate_count}")
    print(f"  空行スキップ: {skip_count}")
    print(f"  カテゴリ総数: {sum(len(v) for v in categories_map.values())}")

    if not masters:
        print("\nインポート対象のデータがありません。終了します。")
        sys.exit(0)

    # --- DB 投入 ---
    if args.dry_run:
        print("\n[DRY RUN] DB書き込みをスキップします")
        # サンプル表示
        sample = list(masters.values())[:3]
        for s in sample:
            print(f"  - {s['name']} ({s['region']}) [{s['partner_id'][:8]}...]")
            cats = categories_map.get(s["partner_id"], [])
            if cats:
                print(f"    カテゴリ: {', '.join(cats[:5])}")
    else:
        print(f"\nPostgreSQL に接続中 ({args.postgres_host}:{args.postgres_port}/{args.postgres_database})...")
        conn = connect_db(args)
        print("  接続成功")

        try:
            print(f"\nデータ投入中 ({len(masters)} 件)...")
            inserted, updated = upsert_partners(
                conn, list(masters.values()), categories_map, args.batch_size
            )
        finally:
            conn.close()

        print(f"\n--- インポート結果 ---")
        print(f"  新規登録: {inserted} 件")
        print(f"  更新: {updated} 件")

    print("\n完了")


if __name__ == "__main__":
    main()
