#coding: utf-8

import argparse

from packages.engine.application.services import BidAnnouncementsApplication


def build_parser():
    parser = argparse.ArgumentParser()

    # モード切り替え系
    parser.add_argument("--use_gcp_vm", action="store_true")
    parser.add_argument("--use_postgres", action="store_true")
    parser.add_argument("--stop_processing", action="store_true")

    # DB接続設定
    parser.add_argument("--sqlite3_db_file_path", default=None)
    parser.add_argument("--bigquery_location", default=None)
    parser.add_argument("--bigquery_project_id", default=None)
    parser.add_argument("--bigquery_dataset_name", default=None)
    parser.add_argument("--postgres_host", default=None)
    parser.add_argument("--postgres_port", default=5432, type=int)
    parser.add_argument("--postgres_database", default=None)
    parser.add_argument("--postgres_user", default=None)
    parser.add_argument("--postgres_password", default=None)

    # Step0 関連
    parser.add_argument("--input_list_file", default=None,
                        help="リスト_防衛省入札_1.txt のパス（step0_prepare_documentsの入力）")
    parser.add_argument("--run_step0_prepare_documents", action="store_true",
                        help="step0_prepare_documents（HTML取得・リンク抽出・フォーマット）を実行")
    parser.add_argument("--run_step0_only", action="store_true",
                        help="step0のみ実行して終了（データベース不要でテスト可能）")
    parser.add_argument("--run_markdown_from_db", action="store_true",
                        help="既存DBデータを使ってMarkdown生成のみ実行")
    parser.add_argument("--markdown_document_ids", default=None,
                        help="[--run_markdown_from_db専用] Markdown再生成対象document_id（カンマ区切り）")
    parser.add_argument("--markdown_document_ids_file", default=None,
                        help="[--run_markdown_from_db専用] Markdown再生成対象document_idをJSON/テキストファイルで指定")
    parser.add_argument("--markdown_include_existing", action="store_true",
                        help="[--run_markdown_from_db専用] 既にmarkdown_pathがあるドキュメントも対象に含める")
    parser.add_argument("--markdown_overwrite_files", action="store_true",
                        help="[--run_markdown_from_db専用] 既存のMarkdownファイルを上書き生成する")
    parser.add_argument("--run_ocr_json_from_db", action="store_true",
                        help="既存DBデータを使ってOCR JSON生成のみ実行")
    parser.add_argument("--ocr_json_document_ids", default=None,
                        help="[--run_ocr_json_from_db専用] OCR JSON再生成対象document_id（カンマ区切り）")
    parser.add_argument("--ocr_json_document_ids_file", default=None,
                        help="[--run_ocr_json_from_db専用] OCR JSON再生成対象document_idをJSON/テキストファイルで指定")
    parser.add_argument("--ocr_json_include_existing", action="store_true",
                        help="[--run_ocr_json_from_db専用] 既にocr_json_pathがあるドキュメントも対象に含める")
    parser.add_argument("--ocr_json_overwrite_files", action="store_true",
                        help="[--run_ocr_json_from_db専用] 既存のOCR JSONファイルを上書き生成する")
    parser.add_argument("--mark_missing_pdfs", action="store_true",
                        help="save_path を走査し file_404_flag を更新する")
    parser.add_argument("--file_404_check_limit", type=int, default=None,
                        help="--mark_missing_pdfs 実行時の最大チェック件数")
    parser.add_argument("--file_404_include_flagged", action="store_true",
                        help="file_404_flag=TRUE の行も対象に含める")
    parser.add_argument("--step0_output_base_dir", default="output",
                        help="step0の出力ベースディレクトリ（デフォルト: output）")
    parser.add_argument("--step0_topAgencyName", default="防衛省",
                        help="トップ機関名（デフォルト: 防衛省）")
    parser.add_argument("--step0_no_merge", action="store_true",
                        help="過去の結果とマージしない")
    parser.add_argument("--step0_skip_db_save", action="store_true",
                        help="step0結果をDBに保存せず終了する")
    parser.add_argument("--step0_timestamp", default=None,
                        help="既存のタイムスタンプディレクトリを使用（YYYYMMDDHHMM形式）")
    parser.add_argument("--step0_do_fetch_html", action="store_true",
                        help="HTML取得処理を実行")
    parser.add_argument("--step0_do_extract_links", action="store_true",
                        help="リンク抽出処理を実行")
    parser.add_argument("--step0_do_format_documents", action="store_true",
                        help="フォーマット処理を実行")
    parser.add_argument("--step0_do_download_pdfs", action="store_true",
                        help="PDFダウンロード処理を実行")
    parser.add_argument("--step0_do_markdown", action="store_true",
                        help="PDFからMarkdown要約を生成")
    parser.add_argument("--step0_do_ocr_json", action="store_true",
                        help="PDFからOCR JSONを生成")
    parser.add_argument("--step0_do_count_pages", action="store_true",
                        help="ページ数カウント処理を実行")
    parser.add_argument("--step0_do_ocr", action="store_true",
                        help="Gemini OCR処理を実行")
    parser.add_argument("--step0_google_api_key", default="data/sec/google_ai_studio_api_key_mizu.txt",
                        help="Google AI Studio API キーファイルのパス（Vertex AI未使用時に参照）")
    parser.add_argument("--gemini_use_vertex_ai", action="store_true",
                        help="Vertex AI 経由で Gemini を利用する")
    parser.add_argument("--vertex_ai_project_id", default=None,
                        help="Vertex AI プロジェクト ID（未指定時は BigQuery project を利用）")
    parser.add_argument("--vertex_ai_location", default="asia-northeast1",
                        help="Vertex AI のリージョン（デフォルト: asia-northeast1）")
    parser.add_argument("--gemini_model", default="gemini-2.5-flash",
                        help="Gemini APIで使用するモデル名")
    parser.add_argument("--gemini_max_output_tokens", type=int, default=None,
                        help="Gemini 応答時の max_output_tokens（未指定時はデフォルト値）")
    parser.add_argument("--step0_ocr_max_concurrency", type=int, default=5,
                        help="OCR並列実行数")
    parser.add_argument("--step0_ocr_max_api_calls_per_run", type=int, default=1000,
                        help="1回の実行での最大API呼び出し数")

    # その他
    parser.add_argument("--step3_remove_table", action="store_true")
    parser.add_argument("--ocr_json_debug_output_path", default=None,
                        help="OCR JSON 生成対象の document_id とパスを書き出すCSVパス（デバッグ用途）")

    return parser


def parse_args(argv=None):
    parser = build_parser()
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    app = BidAnnouncementsApplication(args)
    app.run()


if __name__ == "__main__":
    main()
