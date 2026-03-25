# coding: utf-8
"""
Google Sheets から協力会社データを取得し、seed.sh 用のTSVファイルを生成する。

4つのスプレッドシート × 47シート（都道府県別）のデータを読み取り、
data/master/ 配下に partners_master.txt と partners_categories.txt を出力する。
DB投入は既存の seed.sh に任せる。

Usage:
    # TSVファイル生成（data/master/ に出力）
    python db/scripts/fetch_partners_from_sheets.py \
        --credentials /path/to/service-account.json

    # 出力先を指定
    python db/scripts/fetch_partners_from_sheets.py \
        --credentials /path/to/service-account.json \
        --output-dir ./data/master

    # 特定のスプレッドシートのみ
    python db/scripts/fetch_partners_from_sheets.py \
        --credentials /path/to/service-account.json \
        --spreadsheet-ids 1ZYUUCGhM0CYP1_nbSrYMsFkN8ywJznnrNp8XRCVg_LI

    # DB投入（TSV生成後）
    ./db/seeds/seed.sh ./data/master

Environment:
    GOOGLE_APPLICATION_CREDENTIALS  サービスアカウントJSONキーのパス
"""

import argparse
import csv
import os
import sys
import time
import uuid

import gspread
from google.oauth2.service_account import Credentials

# --- 対象スプレッドシートID ---
DEFAULT_SPREADSHEET_IDS = [
    "1ZYUUCGhM0CYP1_nbSrYMsFkN8ywJznnrNp8XRCVg_LI",
    "14bha1Ksi8Gk7jQZINVJAB9Vt-eQ2jAD-GugkCQQwyuU",
    "1AJxEMQMyiHx5PUcWr9FkvnmWFb1pnzpX5Gvxr-0zz50",
    "1h1wIauQg7urfjtC5QEskS8COYQdaJztHALd6kgwYigg",
]

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

# seed.sh が期待する partners_master.txt のカラム順
MASTER_COLUMNS = [
    "partner_id",
    "no",
    "name",
    "postalCode",
    "address",
    "phone",
    "email",
    "fax",
    "url",
    "surveyCount",
    "rating",
    "resultCount",
    "representative",
    "establishment_date",
    "capital",
    "employeeCount",
    "detail_url",
    "region",
]

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]


def generate_partner_id(name: str, address: str) -> str:
    """会社名+住所から決定的なpartner_idを生成（べき等性保証）。"""
    key = f"{name or ''}::{address or ''}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, key))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Google Sheets から協力会社データを取得し、seed.sh 用TSVを生成"
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
        "--output-dir",
        default="data/master",
        help="TSV出力先ディレクトリ（デフォルト: data/master）",
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
                if "RATE_LIMIT_EXCEEDED" in str(e) or "429" in str(e):
                    records = None
                    for retry in range(3):
                        wait = 60 * (2 ** retry)
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
                yield row, sheet_name

            if delay > 0:
                time.sleep(delay)


def transform_row(row: dict, sheet_name: str):
    """スプレッドシートの行を seed.sh 用のデータに変換。"""
    name = str(row.get("会社名", "")).strip()
    if not name:
        return None, []

    address = str(row.get("住所", "")).strip()
    partner_id = generate_partner_id(name, address)

    # seed.sh のカラム順に合わせた辞書
    master = {
        "partner_id": partner_id,
        "no": "",  # SERIAL なので空（DBが自動採番）
        "name": name,
        "postalCode": str(row.get("郵便番号", "")).strip(),
        "address": address,
        "phone": str(row.get("電話番号", "")).strip(),
        "email": str(row.get("メールアドレス", "")).strip(),
        "fax": str(row.get("FAX番号", "")).strip(),
        "url": str(row.get("ホームページURL", "")).strip(),
        "surveyCount": "0",
        "rating": "",
        "resultCount": "0",
        "representative": "",
        "establishment_date": "",
        "capital": "",
        "employeeCount": "0",
        "detail_url": str(row.get("詳細ページのURL", "")).strip(),
        "region": sheet_name,  # シート名 = 都道府県名
    }

    # カテゴリ収集（重複除去）
    seen = set()
    categories = []
    for col in CATEGORY_COLUMNS:
        val = str(row.get(col, "")).strip()
        if val and val != "0" and val.lower() != "nan" and val not in seen:
            seen.add(val)
            categories.append(val)

    return master, categories


def write_tsv_files(masters: dict, categories_map: dict, output_dir: str):
    """seed.sh 用の TSV ファイルを出力する。"""
    os.makedirs(output_dir, exist_ok=True)

    # --- partners_master.txt ---
    master_path = os.path.join(output_dir, "partners_master.txt")
    with open(master_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter="\t", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(MASTER_COLUMNS)  # ヘッダー
        for m in masters.values():
            writer.writerow([m[col] for col in MASTER_COLUMNS])
    print(f"  {master_path} ({len(masters)} rows)")

    # --- partners_categories.txt ---
    cat_path = os.path.join(output_dir, "partners_categories.txt")
    cat_count = 0
    with open(cat_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter="\t", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["partner_id", "categories"])  # ヘッダー
        for pid, cats in categories_map.items():
            for cat in cats:
                writer.writerow([pid, cat])
                cat_count += 1
    print(f"  {cat_path} ({cat_count} rows)")

    return master_path, cat_path


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

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
    print("協力会社データ フェッチャー (TSV生成)")
    print("=" * 60)
    print(f"  対象スプレッドシート数: {len(spreadsheet_ids)}")
    print(f"  出力先: {args.output_dir}")
    print(f"  レート制限待機: {args.rate_limit_delay}秒")
    print()

    # --- Google Sheets 接続 ---
    print("Google Sheets API に接続中...")
    client = connect_sheets(args.credentials)
    print("  接続成功")

    # --- 全シート読み取り ---
    print("\nデータ読み取り開始...")
    masters = {}
    categories_map = {}
    skip_count = 0
    duplicate_count = 0

    for row, sheet_name in read_all_sheets(client, spreadsheet_ids, args.rate_limit_delay):
        master, cats = transform_row(row, sheet_name)
        if master is None:
            skip_count += 1
            continue

        pid = master["partner_id"]
        if pid in masters:
            duplicate_count += 1
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
        print("\nデータがありません。終了します。")
        sys.exit(0)

    # --- TSV出力 ---
    print(f"\nTSVファイル出力中...")
    write_tsv_files(masters, categories_map, args.output_dir)

    print(f"\n完了！DB投入は以下のコマンドで実行してください:")
    print(f"  ./db/seeds/seed.sh {args.output_dir}")


if __name__ == "__main__":
    main()
