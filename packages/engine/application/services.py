#coding: utf-8

import json
import sys
from pathlib import Path
from typing import List, Optional

from source.bid_announcement_judgement_tools.domain.bid_judgement import BidJudgementSan
from source.bid_announcement_judgement_tools.repository.db_operator import (
    TablenamesConfig,
    DBOperatorGCPVM,
    DBOperatorSQLITE3,
    DBOperatorPOSTGRES,
)


class BidAnnouncementsApplication:
    """
    CLI 層から渡された引数をもとに BidJudgementSan を実行するアプリケーション層。
    """

    def __init__(self, args):
        self.args = args
        self.tablenamesconfig = TablenamesConfig
        self.db_operator = self._create_db_operator()
        vertex_ai_project_id = args.vertex_ai_project_id or args.bigquery_project_id
        self.use_gcs = bool(args.use_gcp_vm or args.use_postgres)
        self.service = BidJudgementSan(
            tablenamesconfig=self.tablenamesconfig,
            db_operator=self.db_operator,
            gemini_model=args.gemini_model,
            google_api_key_path=args.step0_google_api_key,
            gemini_use_vertex_ai=args.gemini_use_vertex_ai,
            vertex_ai_project_id=vertex_ai_project_id,
            vertex_ai_location=args.vertex_ai_location,
            gemini_max_output_tokens=args.gemini_max_output_tokens,
            ocr_json_debug_output_path=args.ocr_json_debug_output_path,
        )

    def run(self):
        """
        CLI からのリクエストを処理し適切なユースケースを実行する。
        """
        if self.args.stop_processing:
            sys.exit(1)

        markdown_document_ids = self._resolve_document_ids(
            enabled=self.args.run_markdown_from_db,
            ids_arg=self.args.markdown_document_ids,
            ids_file=self.args.markdown_document_ids_file,
            arg_name="markdown_document_ids",
            file_option_name="--markdown_document_ids_file",
            mode="markdown",
        )
        ocr_json_document_ids = self._resolve_document_ids(
            enabled=self.args.run_ocr_json_from_db,
            ids_arg=self.args.ocr_json_document_ids,
            ids_file=self.args.ocr_json_document_ids_file,
            arg_name="ocr_json_document_ids",
            file_option_name="--ocr_json_document_ids_file",
            mode="ocr_json",
        )

        if self.args.mark_missing_pdfs:
            self.service.mark_missing_pdfs(
                include_flagged=self.args.file_404_include_flagged,
                limit=self.args.file_404_check_limit,
            )
            sys.exit(0)

        if self.args.run_step0_only:
            self._run_step0()
            print("\n--run_step0_only specified. Exiting after step0.")
            sys.exit(0)

        if self.args.run_markdown_from_db:
            self._regenerate_markdown(markdown_document_ids)
            sys.exit(0)

        if self.args.run_ocr_json_from_db:
            self._regenerate_ocr_json(ocr_json_document_ids)
            sys.exit(0)

        if self.args.run_step0_prepare_documents:
            self._run_step0()

        self.service.step3(remove_table=self.args.step3_remove_table)
        print("Ended step3.")

    def _create_db_operator(self):
        """
        引数に応じて適切な DBOperator を生成する。
        """
        if self.args.use_gcp_vm:
            return DBOperatorGCPVM(
                bigquery_location=self.args.bigquery_location,
                bigquery_project_id=self.args.bigquery_project_id,
                bigquery_dataset_name=self.args.bigquery_dataset_name,
            )
        if self.args.use_postgres:
            operator = DBOperatorPOSTGRES(
                postgres_host=self.args.postgres_host,
                postgres_port=self.args.postgres_port,
                postgres_database=self.args.postgres_database,
                postgres_user=self.args.postgres_user,
                postgres_password=self.args.postgres_password,
            )
            operator.ensureBackendEvaluationStatusesTable()
            return operator
        db_path = self.args.sqlite3_db_file_path
        if not db_path:
            print("Error: --sqlite3_db_file_path is required when not using --use_gcp_vm or --use_postgres.")
            sys.exit(1)
        path_obj = Path(db_path)
        if not path_obj.exists():
            print(f"Error: SQLite database file not found: {db_path}")
            sys.exit(1)
        return DBOperatorSQLITE3(
            sqlite3_db_file_path=str(path_obj),
        )

    def _run_step0(self):
        """
        step0 処理を実行する。
        """
        if not self.args.input_list_file:
            print("Error: --input_list_file is required when running step0.")
            sys.exit(1)

        self.service.step0_prepare_documents(
            input_list_file=self.args.input_list_file,
            output_base_dir=self.args.step0_output_base_dir,
            timestamp=self.args.step0_timestamp,
            topAgencyName=self.args.step0_topAgencyName,
            no_merge=self.args.step0_no_merge,
            skip_db_save=self.args.step0_skip_db_save,
            use_gcs=self.use_gcs,
            do_fetch_html=self.args.step0_do_fetch_html,
            do_extract_links=self.args.step0_do_extract_links,
            do_format_documents=self.args.step0_do_format_documents,
            do_download_pdfs=self.args.step0_do_download_pdfs,
            do_markdown=self.args.step0_do_markdown,
            do_ocr_json=self.args.step0_do_ocr_json,
            do_count_pages=self.args.step0_do_count_pages,
            do_ocr=self.args.step0_do_ocr,
            google_api_key=self.args.step0_google_api_key,
            ocr_max_concurrency=self.args.step0_ocr_max_concurrency,
            ocr_max_api_calls_per_run=self.args.step0_ocr_max_api_calls_per_run,
        )

    def _regenerate_markdown(self, document_ids: Optional[List[str]]):
        """
        Markdown 再生成ユースケース。
        """
        self.service.regenerate_markdown_from_database(
            use_gcs=self.use_gcs,
            google_api_key=self.args.step0_google_api_key,
            max_concurrency=self.args.step0_ocr_max_concurrency,
            max_api_calls_per_run=self.args.step0_ocr_max_api_calls_per_run,
            document_ids=document_ids,
            only_missing=(not self.args.markdown_include_existing),
            overwrite_files=self.args.markdown_overwrite_files,
            include_file_404_flagged=self.args.file_404_include_flagged,
        )

    def _regenerate_ocr_json(self, document_ids: Optional[List[str]]):
        """
        OCR JSON 再生成ユースケース。
        """
        self.service.regenerate_ocr_json_from_database(
            use_gcs=self.use_gcs,
            google_api_key=self.args.step0_google_api_key,
            max_concurrency=self.args.step0_ocr_max_concurrency,
            max_api_calls_per_run=self.args.step0_ocr_max_api_calls_per_run,
            document_ids=document_ids,
            only_missing=(not self.args.ocr_json_include_existing),
            overwrite_files=self.args.ocr_json_overwrite_files,
            include_file_404_flagged=self.args.file_404_include_flagged,
        )

    def _resolve_document_ids(
        self,
        enabled: bool,
        ids_arg: Optional[str],
        ids_file: Optional[str],
        arg_name: str,
        file_option_name: str,
        mode: str,
    ) -> Optional[List[str]]:
        """
        CLI オプションで渡された document_id 指定を解析する。
        """
        if not enabled:
            return None

        document_ids: Optional[List[str]] = None
        if ids_arg:
            normalized = self._normalize_document_ids(ids_arg.split(","))
            if not normalized:
                print(f"Error: --{arg_name} is specified but no valid IDs were provided.")
                sys.exit(1)
            document_ids = normalized

        if ids_file:
            file_ids = self._load_ids_from_file(ids_file, mode, file_option_name)
            if not file_ids:
                print(f"Error: {file_option_name} does not contain valid IDs.")
                sys.exit(1)

            if document_ids is None:
                document_ids = file_ids
            else:
                combined = document_ids + file_ids
                # preserve order while removing duplicates
                document_ids = list(dict.fromkeys(combined))

        return document_ids

    def _normalize_document_ids(self, raw_ids):
        """
        document_id 配列をストリップ＋空要素除去する。
        """
        result = []
        if not raw_ids:
            return result
        for doc in raw_ids:
            if doc is None:
                continue
            if not isinstance(doc, str):
                doc = str(doc)
            doc = doc.strip()
            if doc:
                result.append(doc)
        return result

    def _load_ids_from_file(self, file_path: str, mode: str, flag_name: str) -> List[str]:
        """
        ファイルから document_id リストを読み込む。
        """
        path = Path(file_path)
        if not path.exists():
            print(f"Error: {flag_name} not found: {file_path}")
            sys.exit(1)

        if mode == "markdown":
            content = path.read_text(encoding="utf-8").strip()
            file_ids = []
            if content:
                parsed = None
                try:
                    parsed = json.loads(content)
                except json.JSONDecodeError:
                    parsed = None

                if parsed is not None:
                    if isinstance(parsed, list):
                        file_ids = parsed
                    else:
                        print("Error: --markdown_document_ids_file must contain a JSON array when using JSON format.")
                        sys.exit(1)
                else:
                    file_ids = content.splitlines()
            return self._normalize_document_ids(file_ids)

        # mode == "ocr_json"
        if path.suffix.lower() == ".json":
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                print("Error: --ocr_json_document_ids_file must contain valid JSON.")
                sys.exit(1)
            if isinstance(data, list):
                return self._normalize_document_ids(data)
            print("Error: --ocr_json_document_ids_file must contain a JSON array when using JSON format.")
            sys.exit(1)
        return self._normalize_document_ids(path.read_text(encoding="utf-8").splitlines())
