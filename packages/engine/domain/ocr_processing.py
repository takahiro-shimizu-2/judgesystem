#coding: utf-8
"""
OCR/Markdown/Gemini 関連メソッドを提供する Mixin。

PDF ダウンロード、Markdown 生成、OCR JSON 生成、Vertex AI 経由 Gemini 呼び出し、
_convertJson、DB 再生成系メソッドを含む。
"""

import os
import re
import json
import time
import uuid
import asyncio
import random
from datetime import datetime
from pathlib import Path
from collections import Counter
from concurrent.futures import ProcessPoolExecutor

import pandas as pd
import numpy as np
import requests
from tqdm import tqdm
from google import genai
from google.genai import types

from packages.engine.domain.master import (
    gcs_exists,
    gcs_upload_from_bytes,
    gcs_download_as_bytes,
    list_gcs_files_in_prefix,
    file_exists_gcs_or_local,
    get_pages,
)

# UI が期待するカテゴリ体系に合わせるための定数
GOODS_SERVICE_SEGMENTS = {
    "物品の製造",
    "物品の販売",
    "役務の提供等",
    "物品の買受け",
}

_CONSTRUCTION_CATEGORY_BASE = {
    "土木": "土木一式工事",
    "建築": "建築一式工事",
    "大工": "大工工事",
    "左官": "左官工事",
    "とび・土工・コンクリート": "とび・土工・コンクリート工事",
    "石": "石工事",
    "屋根": "屋根工事",
    "電気": "電気工事",
    "管": "管工事",
    "タイル・れんが・ブロック": "タイル・れんが・ブロック工事",
    "鋼構造物": "鋼構造物工事",
    "鉄筋": "鉄筋工事",
    "舗装": "舗装工事",
    "しゅんせつ": "しゅんせつ工事",
    "板金": "板金工事",
    "ガラス": "ガラス工事",
    "塗装": "塗装工事",
    "防水": "防水工事",
    "内装仕上": "内装仕上工事",
    "機械装置": "機械器具設置工事",
    "熱絶縁": "熱絶縁工事",
    "電気通信": "電気通信工事",
    "造園": "造園工事",
    "さく井": "さく井工事",
    "建具": "建具工事",
    "水道施設": "水道施設工事",
    "消防施設": "消防施設工事",
    "清掃施設": "清掃施設工事",
    "解体": "解体工事",
    "その他": "その他",
    "グラウト": "グラウト",
    "維持": "維持",
    "自然環境共生": "自然環境共生",
    "水環境処理": "水環境処理",
}

# Gemini からの値/HTML 由来の値の双方を正規化できるよう、シノニムを用意
CONSTRUCTION_CATEGORY_MAP = {}
for raw_value, detail_value in _CONSTRUCTION_CATEGORY_BASE.items():
    CONSTRUCTION_CATEGORY_MAP[raw_value] = detail_value
    CONSTRUCTION_CATEGORY_MAP[detail_value] = detail_value


class OcrProcessingMixin:
    """OCR/Markdown/Gemini関連メソッドを提供するMixin"""

    def _create_gemini_client(self):
        """
        Create a Gemini client configured for Vertex AI authentication.
        """
        project_id = self.vertex_ai_project_id
        if not project_id:
            raise ValueError("Vertex AI project ID is required. Specify --vertex_ai_project_id or --bigquery_project_id.")
        return genai.Client(
            vertexai=True,
            project=project_id,
            location=self.vertex_ai_location or "asia-northeast1",
        )


    def _step0_download_pdfs(self, df, use_gcs=False):
        """
        PDF を URL からダウンロードして保存
        """
        SLEEP_AFTER_REQUEST = 0.4
        SLEEP_ON_HTTP_ERROR = 0.4
        SLEEP_ON_REQUEST_ERROR = 0.4

        today_str = datetime.now().strftime("%Y-%m-%d")

        if use_gcs:
            df["save_path"] = df["save_path"].apply(
                lambda x: x.replace("output/pdf/", "gs://ann-files/pdf/") if pd.notna(x) else x
            )
            print("Converted save_path to GCS format (gs://ann-files/pdf/...)")

        pdf_requests_skip_urls = ["dummy"]

        print("Check pdf_is_saved (before url_requests).")
        file_cache = {}

        for i, row in tqdm(df.iterrows(), total=len(df), desc="Checking existing PDFs"):
            p = row["save_path"]
            if p is None or pd.isna(p):
                df.loc[i, "pdf_is_saved"] = False
                continue

            if use_gcs and p.startswith("gs://"):
                parts = p.split("/")
                if len(parts) >= 5:
                    dir_key = "/".join(parts[:5]) + "/"
                    if dir_key not in file_cache:
                        tqdm.write(f"Loading file list for: {dir_key}")
                        file_cache[dir_key] = list_gcs_files_in_prefix(dir_key)
                    df.loc[i, "pdf_is_saved"] = p in file_cache[dir_key]
                else:
                    df.loc[i, "pdf_is_saved"] = gcs_exists(p)
            else:
                p_normalized = os.path.normpath(p)
                dir_key = os.path.dirname(p_normalized)
                if dir_key not in file_cache:
                    if os.path.exists(dir_key):
                        file_cache[dir_key] = {
                            os.path.join(dir_key, f)
                            for f in os.listdir(dir_key)
                            if os.path.isfile(os.path.join(dir_key, f))
                        }
                    else:
                        file_cache[dir_key] = set()
                df.loc[i, "pdf_is_saved"] = p_normalized in file_cache[dir_key]

        print(f"pdf_is_saved status: {df['pdf_is_saved'].value_counts(dropna=False).to_dict()}")

        print("Save pdf by requests.")
        for i, row in tqdm(df.iterrows(), total=len(df), desc="Downloading PDFs"):
            pdfurl = row["url"]
            save_path = row["save_path"]

            if pdfurl is None or pd.isna(pdfurl):
                continue

            if df.loc[i, "pdf_is_saved"] == True:
                continue

            save_path_dirname = os.path.dirname(save_path)
            if not use_gcs and not os.path.exists(save_path_dirname):
                os.makedirs(save_path_dirname, exist_ok=True)

            skip_this_url = False
            for skipurl in pdf_requests_skip_urls:
                if pdfurl.startswith(skipurl):
                    tqdm.write(fr"Skip url: {skipurl}...")
                    skip_this_url = True
                    break
            if skip_this_url:
                continue

            if pdfurl is not None and not pdfurl.startswith("https://tinyurl"):
                df.loc[i, "pdf_is_saved_date"] = today_str

                try:
                    response = requests.get(pdfurl, headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36",
                        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp",
                        "Connection": "keep-alive",
                    })
                    response.raise_for_status()
                except requests.exceptions.HTTPError as e:
                    tqdm.write(f"HTTP error: {pdfurl} -> {e}")
                    time.sleep(SLEEP_ON_HTTP_ERROR)
                    continue
                except requests.exceptions.RequestException as e:
                    tqdm.write(f"Request error: {pdfurl} -> {e}")
                    time.sleep(SLEEP_ON_REQUEST_ERROR)
                    continue

                try:
                    if use_gcs and save_path.startswith("gs://"):
                        content_type = "application/pdf" if str(save_path).lower().endswith(".pdf") else None
                        gcs_upload_from_bytes(save_path, response.content, content_type=content_type)
                        tqdm.write(fr"Saved {save_path}.")
                        df.loc[i, "pdf_is_saved"] = True
                    else:
                        Path(save_path).write_bytes(response.content)
                        tqdm.write(fr"Saved {save_path}.")
                        df.loc[i, "pdf_is_saved"] = True
                except Exception as e:
                    tqdm.write(str(e))

                time.sleep(SLEEP_AFTER_REQUEST)

        return df


    def _build_markdown_path(self, document_id, file_format=None, use_gcs=False):
        """
        Markdownファイルの保存先を生成
        """
        doc_id = str(document_id).strip()
        if not doc_id:
            doc_id = str(uuid.uuid4())
        prefix = doc_id.split("_")[0] if "_" in doc_id else doc_id[:6]
        prefix = prefix or "misc"

        if file_format:
            filename = f"{doc_id}.{file_format}.md"
        else:
            filename = f"{doc_id}.md"

        if use_gcs:
            return f"gs://ann-files/markdown/md_{prefix}/{filename}"
        else:
            return os.path.join("output", "markdown", f"md_{prefix}", filename)

    def _build_ocr_json_path(self, document_id, file_format=None, use_gcs=False):
        """
        OCR JSON ファイルの保存先を生成
        """
        doc_id = str(document_id).strip()
        if not doc_id:
            doc_id = str(uuid.uuid4())
        prefix = doc_id.split("_")[0] if "_" in doc_id else doc_id[:6]
        prefix = prefix or "misc"

        if file_format:
            filename = f"{doc_id}.{file_format}.json"
        else:
            filename = f"{doc_id}.json"

        if use_gcs:
            return f"gs://ann-files/ocr_json/json_{prefix}/{filename}"
        return os.path.join("output", "ocr_json", f"json_{prefix}", filename)

    def _path_exists_with_cache(self, file_path, file_cache):
        """
        save_path が指すファイルの存在をキャッシュ付きでチェック
        """
        if file_path is None or pd.isna(file_path):
            return False

        path_str = str(file_path).strip()
        if not path_str:
            return False

        if path_str.startswith("gs://"):
            parts = path_str.split("/")
            if len(parts) >= 5:
                dir_key = "/".join(parts[:5]) + "/"
                if dir_key not in file_cache:
                    try:
                        file_cache[dir_key] = list_gcs_files_in_prefix(dir_key)
                    except Exception as e:
                        print(f"[WARN] Failed to list GCS prefix {dir_key}: {e}")
                        return file_exists_gcs_or_local(path_str)
                return path_str in file_cache[dir_key]
            return file_exists_gcs_or_local(path_str)

        normalized = os.path.normpath(path_str)
        dir_key = os.path.dirname(normalized)
        if dir_key not in file_cache:
            if os.path.exists(dir_key):
                file_cache[dir_key] = {
                    os.path.join(dir_key, f)
                    for f in os.listdir(dir_key)
                    if os.path.isfile(os.path.join(dir_key, f))
                }
            else:
                file_cache[dir_key] = set()
        return normalized in file_cache[dir_key]

    def _load_ocr_json_extracted_text(self, json_path, use_gcs=False):
        """
        OCR JSON から extracted_text を取得する。存在しない場合は None。
        """
        if not isinstance(json_path, str) or json_path.strip() == "":
            return None

        try:
            if use_gcs and json_path.startswith("gs://"):
                from google.cloud import storage
                storage_client = storage.Client()
                bucket_name, blob_path = json_path.replace("gs://", "", 1).split("/", 1)
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_path)
                content = blob.download_as_text(encoding="utf-8")
            else:
                path_obj = Path(json_path)
                if not path_obj.exists():
                    return None
                content = path_obj.read_text(encoding="utf-8")

            data = json.loads(content)
            extracted = data.get("extracted_text")
            if isinstance(extracted, list):
                extracted = "\n".join(str(x) for x in extracted)
            if isinstance(extracted, (dict, list)):
                extracted = json.dumps(extracted, ensure_ascii=False)
            if isinstance(extracted, str):
                extracted = extracted.strip()
            return extracted or None
        except Exception as e:
            print(f"[WARN] Failed to load OCR JSON ({json_path}): {e}")
            return None


    def _step0_generate_markdown(
        self,
        df_main,
        use_gcs=False,
        max_concurrency=5,
        max_api_calls_per_run=1000,
        force_regenerate=False
    ):
        """
        PDF から Gemini を使って Markdown 要約を生成し保存する
        """
        client = self._create_gemini_client()
        df_main = df_main.copy()
        df_main["document_id"] = df_main["document_id"].astype(str).str.strip()
        doc_title_lookup = {}
        if "document_id" in df_main.columns and "title" in df_main.columns:
            doc_title_lookup = df_main.set_index("document_id")["title"].to_dict()

        def clean_markdown(text):
            if not text:
                return None
            cleaned = text.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-zA-Z0-9_+-]*", "", cleaned).strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
            return cleaned

        doc_to_md_path = {}
        params = []
        skipped_docs = []
        file_cache = {}

        iterator = tqdm(df_main.iterrows(), total=len(df_main), desc="Preparing Markdown tasks")
        for idx, row in iterator:
            document_id = str(row.get("document_id", "")).strip()
            file_format = str(row.get("fileFormat", "")).strip().lower()
            save_path = row.get("save_path")

            if document_id in ("", "nan", "None"):
                continue

            if file_format != "pdf":
                continue

            md_path = self._build_markdown_path(document_id, file_format=file_format, use_gcs=use_gcs)
            key = (document_id, file_format)

            if key in doc_to_md_path:
                continue
            doc_to_md_path[key] = md_path

            if self._path_exists_with_cache(md_path, file_cache) and not force_regenerate:
                mask = (df_main["document_id"] == document_id) & (df_main["fileFormat"] == file_format)
                df_main.loc[mask, "markdown_path"] = md_path
                continue

            if pd.isna(save_path) or not self._path_exists_with_cache(save_path, file_cache):
                skipped_docs.append(f"{document_id}.{file_format}")
                continue

            params.append([
                self._PROMPT_MD,
                document_id,
                file_format,
                self.gemini_model,
                "md",
                use_gcs,
                save_path
            ])

            if len(params) >= max_api_calls_per_run:
                print(f"\nReached Markdown generation limit: {len(params)} documents in this run")
                break

        if skipped_docs:
            print(f"Skipped {len(skipped_docs)} documents without accessible PDFs: {skipped_docs[:5]}")

        if len(params) == 0:
            print("No Markdown generation needed.")
            return df_main

        print(f"Calling Gemini for Markdown generation (documents: {len(params)}, max_concurrency={max_concurrency})")
        start_time = time.time()
        results = asyncio.run(self._call_parallel(client, params, max_concurrency))
        elapsed_time = time.time() - start_time
        print(f"Markdown generation completed in {elapsed_time:.2f} seconds")

        saved_count = 0
        for res in tqdm(results, desc="Processing Markdown responses"):
            document_id = res.get("document_id")
            file_format = res.get("file_format", "pdf")
            key = (document_id, file_format)
            md_path = doc_to_md_path.get(key)

            if res.get("error") is not None:
                tqdm.write(f"Markdown API error for {document_id}.{file_format}: {res.get('error')}")
                continue

            markdown_text = clean_markdown(res.get("result"))
            if not markdown_text:
                tqdm.write(f"No Markdown text returned for {document_id}.{file_format}")
                continue

            try:
                if md_path.startswith("gs://"):
                    gcs_upload_from_bytes(md_path, markdown_text.encode("utf-8"), content_type="text/markdown; charset=utf-8")
                else:
                    path_obj = Path(md_path)
                    path_obj.parent.mkdir(parents=True, exist_ok=True)
                    path_obj.write_text(markdown_text, encoding="utf-8")

                mask = (df_main["document_id"] == document_id) & (df_main["fileFormat"] == file_format)
                df_main.loc[mask, "markdown_path"] = md_path
                saved_count += 1
            except Exception as e:
                tqdm.write(f"Failed to save Markdown for {document_id}.{file_format}: {e}")

        print(f"Markdown saved for {saved_count} documents")
        return df_main

    def _parse_ocr_json_payload(self, raw_text):
        candidate = (raw_text or "").strip()
        if candidate.startswith("```"):
            lines = candidate.splitlines()
            if len(lines) >= 3:
                candidate = "\n".join(lines[1:-1]).strip()
        json_start = candidate.find("{")
        if json_start > 0:
            candidate = candidate[json_start:]
        try:
            payload, _ = json.JSONDecoder().raw_decode(candidate)
        except json.JSONDecodeError:
            return {
                "extracted_text": raw_text or "",
                "normalized_structure": {
                    "raw_response_text": raw_text or "",
                    "parse_error": "invalid_json",
                },
            }

        extracted_text = payload.get("extracted_text")
        if not isinstance(extracted_text, str):
            extracted_text = raw_text or ""

        normalized_structure = payload.get("normalized_structure")
        if not isinstance(normalized_structure, dict):
            normalized_structure = {}
        normalized_structure.setdefault("raw_response_text", raw_text or "")

        return {
            "extracted_text": extracted_text,
            "normalized_structure": normalized_structure,
        }

    def _step0_generate_ocr_json(
        self,
        df_main,
        use_gcs=False,
        max_concurrency=5,
        max_api_calls_per_run=1000,
        force_regenerate=False,
        debug_output_list_path=None
    ):
        """
        Gemini を使って OCR JSON を生成し保存する
        """
        client = self._create_gemini_client()
        df_main = df_main.copy()
        df_main["document_id"] = df_main["document_id"].astype(str).str.strip()

        doc_to_json_path = {}
        params = []
        skipped_docs = []
        debug_records = []
        file_cache = {}

        for _, row in df_main.iterrows():
            document_id = str(row.get("document_id", "")).strip()
            file_format = str(row.get("fileFormat", "")).strip().lower()
            save_path = row.get("save_path")

            if not document_id or file_format != "pdf":
                continue

            json_path = self._build_ocr_json_path(document_id, file_format=file_format, use_gcs=use_gcs)
            key = (document_id, file_format)
            if key in doc_to_json_path:
                continue
            doc_to_json_path[key] = json_path

            if self._path_exists_with_cache(json_path, file_cache) and not force_regenerate:
                mask = (df_main["document_id"] == document_id) & (df_main["fileFormat"] == file_format)
                df_main.loc[mask, "ocr_json_path"] = json_path
                continue

            if pd.isna(save_path) or not self._path_exists_with_cache(save_path, file_cache):
                skipped_docs.append(f"{document_id}.{file_format}")
                continue

            params.append([
                self._PROMPT_OCR_JSON,
                document_id,
                file_format,
                self.gemini_model,
                "ocr_json",
                use_gcs,
                save_path
            ])

            if len(params) >= max_api_calls_per_run:
                print(f"\nReached OCR JSON generation limit: {len(params)} documents in this run")
                break

        if skipped_docs:
            print(f"Skipped {len(skipped_docs)} documents without accessible PDFs: {skipped_docs[:5]}")

        if len(params) == 0:
            print("No OCR JSON generation needed.")
            return df_main

        print(f"Calling Gemini for OCR JSON generation (documents: {len(params)}, max_concurrency={max_concurrency})")
        start_time = time.time()
        results = asyncio.run(self._call_parallel(client, params, max_concurrency))
        elapsed_time = time.time() - start_time
        print(f"OCR JSON generation completed in {elapsed_time:.2f} seconds")

        saved_count = 0
        for res in tqdm(results, desc="Processing OCR JSON responses"):
            document_id = res.get("document_id")
            file_format = res.get("file_format", "pdf")
            key = (document_id, file_format)
            json_path = doc_to_json_path.get(key)

            if res.get("error") is not None:
                tqdm.write(f"OCR JSON API error for {document_id}.{file_format}: {res.get('error')}")
                continue

            payload = self._parse_ocr_json_payload(res.get("result") or "")
            try:
                json_bytes = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
                if json_path.startswith("gs://"):
                    gcs_upload_from_bytes(json_path, json_bytes, content_type="application/json; charset=utf-8")
                else:
                    path_obj = Path(json_path)
                    path_obj.parent.mkdir(parents=True, exist_ok=True)
                    path_obj.write_bytes(json_bytes)

                mask = (df_main["document_id"] == document_id) & (df_main["fileFormat"] == file_format)
                df_main.loc[mask, "ocr_json_path"] = json_path
                debug_records.append({"document_id": document_id, "ocr_json_path": json_path})
                saved_count += 1
            except Exception as e:
                tqdm.write(f"Failed to save OCR JSON for {document_id}.{file_format}: {e}")

        if debug_output_list_path and debug_records:
            try:
                Path(debug_output_list_path).parent.mkdir(parents=True, exist_ok=True)
                pd.DataFrame(debug_records).to_csv(debug_output_list_path, index=False, encoding="utf-8")
                print(f"Debug list written to {debug_output_list_path}")
            except Exception as e:
                print(f"Failed to write debug list: {e}")

        print(f"OCR JSON saved for {saved_count} documents")
        return df_main

    def regenerate_markdown_from_database(
        self,
        use_gcs=False,
        max_concurrency=5,
        max_api_calls_per_run=1000,
        document_ids=None,
        only_missing=True,
        overwrite_files=False,
        include_file_404_flagged=False
    ):
        """
        既存 announcements_documents_master から Markdown を再生成する
        """
        tablename = self.tablenamesconfig.bid_announcements_document_table
        bool_column_type = self.db_operator.get_bool_column_type()
        self.db_operator.ensure_column(tablename, "file_404_flag", bool_column_type)
        where_clauses = []

        if only_missing:
            where_clauses.append("(markdown_path IS NULL OR markdown_path = '')")

        file_format_expr = self.db_operator.lower_column_expr("fileFormat")
        where_clauses.append(f"{file_format_expr} = 'pdf'")
        if not include_file_404_flagged:
            where_clauses.append("(file_404_flag IS NULL OR file_404_flag = FALSE)")

        if document_ids:
            sanitized = []
            for doc_id in document_ids:
                doc = doc_id.strip()
                if doc:
                    sanitized.append("'" + doc.replace("'", "''") + "'")
            if sanitized:
                where_clauses.append(f"document_id IN ({', '.join(sanitized)})")

        where_clause = ""
        if where_clauses:
            where_clause = "WHERE " + " AND ".join(where_clauses)

        df_main = self.db_operator.selectToTable(tablename, where_clause)
        if df_main.empty:
            print("No documents found for Markdown regeneration.")
            return

        print(f"Regenerating Markdown for {len(df_main)} documents...")
        df_main = self._step0_generate_markdown(
            df_main=df_main,
            use_gcs=use_gcs,
            max_concurrency=max_concurrency,
            max_api_calls_per_run=max_api_calls_per_run,
            force_regenerate=overwrite_files
        )

        df_updates = df_main[["document_id", "fileFormat", "markdown_path"]].dropna()
        df_updates = df_updates[df_updates["markdown_path"].astype(str).str.len() > 0]

        if df_updates.empty:
            print("No Markdown paths to update.")
            return

        updated = self.db_operator.updateMarkdownPaths(tablename, df_updates)
        print(f"Updated markdown_path for {updated} documents.")

    def regenerate_ocr_json_from_database(
        self,
        use_gcs=False,
        max_concurrency=5,
        max_api_calls_per_run=1000,
        document_ids=None,
        only_missing=True,
        overwrite_files=False,
        include_file_404_flagged=False
    ):
        """
        既存 announcements_documents_master から OCR JSON を再生成する
        """
        tablename = self.tablenamesconfig.bid_announcements_document_table
        json_type = self.db_operator.get_text_column_type()
        if self.db_operator.ifTableExists(tablename):
            self.db_operator.ensure_column(tablename, "ocr_json_path", json_type)
        else:
            print(f"Table {tablename} does not exist.")
            return
        bool_column_type = self.db_operator.get_bool_column_type()
        self.db_operator.ensure_column(tablename, "file_404_flag", bool_column_type)

        where_clauses = []
        if only_missing:
            where_clauses.append("(ocr_json_path IS NULL OR ocr_json_path = '')")

        file_format_expr = self.db_operator.lower_column_expr("fileFormat")
        where_clauses.append(f"{file_format_expr} = 'pdf'")

        if document_ids:
            sanitized = []
            for doc_id in document_ids:
                doc = doc_id.strip()
                if doc:
                    sanitized.append("'" + doc.replace("'", "''") + "'")
            if sanitized:
                where_clauses.append(f"document_id IN ({', '.join(sanitized)})")
        if not include_file_404_flagged:
            where_clauses.append("(file_404_flag IS NULL OR file_404_flag = FALSE)")

        where_clause = ""
        if where_clauses:
            where_clause = "WHERE " + " AND ".join(where_clauses)

        df_main = self.db_operator.selectToTable(tablename, where_clause)
        if df_main.empty:
            print("No documents found for OCR JSON regeneration.")
            return

        print(f"Regenerating OCR JSON for {len(df_main)} documents...")
        df_main = self._step0_generate_ocr_json(
            df_main=df_main,
            use_gcs=use_gcs,
            max_concurrency=max_concurrency,
            max_api_calls_per_run=max_api_calls_per_run,
            force_regenerate=overwrite_files,
            debug_output_list_path=self.ocr_json_debug_output_path
        )

        df_updates = df_main[["document_id", "fileFormat", "ocr_json_path"]].dropna()
        df_updates = df_updates[df_updates["ocr_json_path"].astype(str).str.len() > 0]
        if df_updates.empty:
            print("No OCR JSON paths to update.")
            return

        updated = self.db_operator.updateOcrJsonPaths(tablename, df_updates)
        print(f"Updated ocr_json_path for {updated} documents.")


    def mark_missing_pdfs(
        self,
        include_flagged=False,
        limit=None
    ):
        """
        save_path に PDF が存在しないドキュメントを検出し file_404_flag を更新
        """
        tablename = self.tablenamesconfig.bid_announcements_document_table
        if not self.db_operator.ifTableExists(tablename):
            print(f"Table {tablename} does not exist.")
            return
        bool_column_type = self.db_operator.get_bool_column_type()
        self.db_operator.ensure_column(tablename, "file_404_flag", bool_column_type)

        where_clauses = []
        file_format_expr = self.db_operator.lower_column_expr("fileFormat")

        where_clauses.append(f"{file_format_expr} = 'pdf'")
        where_clauses.append("(save_path IS NOT NULL AND save_path <> '')")

        if not include_flagged:
            where_clauses.append("(file_404_flag IS NULL OR file_404_flag = FALSE)")

        where_clause = ""
        if where_clauses:
            where_clause = "WHERE " + " AND ".join(where_clauses)

        if limit is not None:
            where_clause = f"{where_clause} LIMIT {int(limit)}" if where_clause else f"LIMIT {int(limit)}"

        df_targets = self.db_operator.selectToTable(tablename, where_clause)
        if df_targets.empty:
            print("No documents matched for missing PDF check.")
            return

        file_cache = {}
        updates = []
        missing_count = 0
        cleared_count = 0

        for _, row in tqdm(df_targets.iterrows(), total=len(df_targets), desc="Checking PDF files"):
            save_path = row.get("save_path")
            exists = self._path_exists_with_cache(save_path, file_cache)
            is_missing = not exists

            current_flag = row.get("file_404_flag")
            current_bool = False
            if isinstance(current_flag, str):
                current_bool = current_flag.strip().lower() == "true"
            elif isinstance(current_flag, (int, np.integer, np.bool_)):
                current_bool = bool(current_flag)
            elif isinstance(current_flag, bool):
                current_bool = current_flag

            if current_bool == is_missing:
                continue

            updates.append({
                "document_id": row.get("document_id"),
                "fileFormat": row.get("fileFormat"),
                "file_404_flag": is_missing
            })
            if is_missing:
                missing_count += 1
            else:
                cleared_count += 1

        if not updates:
            print("No file_404_flag updates required.")
            return

        df_updates = pd.DataFrame(updates)
        updated = self.db_operator.updateFile404Flags(tablename, df_updates)
        print(f"file_404_flag updated for {updated} documents (missing={missing_count}, cleared={cleared_count}).")


    def _step0_count_pages(self, df):
        """
        PDF のページ数をカウント
        """
        print("pageCount.")
        cpu_count_value = os.cpu_count()
        max_workers = min(8, cpu_count_value)

        mask = df["pageCount"] == -1
        files = df.loc[mask, "save_path"].values

        with ProcessPoolExecutor(max_workers=max_workers) as ex:
            results = list(
                tqdm(
                    ex.map(get_pages, files, chunksize=200),
                    total=len(files),
                    desc="Counting pages"
                )
            )
        df.loc[mask, "pageCount"] = results

        df["pageCount"] = df["pageCount"].astype('int64')
        print(f"pageCount status: {df['pageCount'].value_counts(dropna=False).to_dict()}")

        return df


    def _select_best_value(self, values):
        """
        複数の値から "もっともらしい" 値を選択
        """
        valid_values = [
            v for v in values
            if v is not None
            and v != ''
            and str(v).lower() not in ['null', 'nan', 'none']
        ]

        if not valid_values:
            return None

        counter = Counter(valid_values)
        most_common = counter.most_common(1)[0][0]

        return most_common


    def _normalize_category_fields(self, category_raw, notice_category_name, notice_category_code):
        """
        UI が期待する category_segment/category_detail に合わせて正規化する
        """
        def _clean(value):
            if isinstance(value, str):
                stripped = value.strip()
                return stripped or None
            return None

        segment = None
        detail = None

        raw = _clean(category_raw)
        if raw:
            normalized_raw = raw.replace("／", "/")
            parts = [p.strip() for p in normalized_raw.split("/") if p.strip()]
            if len(parts) >= 2 and parts[0] in GOODS_SERVICE_SEGMENTS:
                segment = parts[0]
                detail = parts[1]
            elif raw in GOODS_SERVICE_SEGMENTS:
                segment = raw
            else:
                mapped_detail = CONSTRUCTION_CATEGORY_MAP.get(raw)
                if mapped_detail:
                    segment = "工事"
                    detail = mapped_detail

        notice_name = _clean(notice_category_name)
        if not segment and notice_name:
            mapped_detail = CONSTRUCTION_CATEGORY_MAP.get(notice_name)
            if mapped_detail:
                segment = "工事"
                detail = detail or mapped_detail
            else:
                segment = notice_name

        notice_code = _clean(notice_category_code)
        if notice_code and not detail:
            mapped_detail = CONSTRUCTION_CATEGORY_MAP.get(notice_code)
            if mapped_detail:
                detail = mapped_detail
                if not segment:
                    segment = "工事"
            elif notice_code != segment:
                detail = notice_code

        return segment, detail


    def _step0_ocr_with_gemini(
        self,
        df_main,
        use_gcs=False,
        max_concurrency=5,
        max_api_calls_per_run=1000
    ):
        """
        Gemini APIを使用してPDFからOCR処理を実行し、DBに保存
        """
        print("=" * 60)
        print("Step0-6: OCR with Gemini")
        print("=" * 60)

        client = self._create_gemini_client()

        df_main = df_main.copy()
        df_main["document_id"] = df_main["document_id"].astype(str).str.strip()
        doc_title_lookup = {}
        if "document_id" in df_main.columns and "title" in df_main.columns:
            doc_title_lookup = df_main.set_index("document_id")["title"].to_dict()

        if "done" in df_main.columns:
            df_main["done"] = (
                df_main["done"]
                .map({True: True, False: False, "True": True, "False": False})
                .fillna(False)
                .astype(bool)
            )
        else:
            df_main["done"] = False

        tablename_requirements = self.tablenamesconfig.bid_requirements
        tmp_check_table = "tmp_req_check"

        df_check = pd.DataFrame({'announcement_id': df_main['announcement_id'].unique().astype(int)})
        self.db_operator.uploadDataToTable(df_check, tmp_check_table, chunksize=5000)

        if self.db_operator.ifTableExists(tablename_requirements):
            df_req_status = self.db_operator.checkRequirementsExist(tmp_check_table, tablename_requirements)
            req_done_lookup = df_req_status.set_index('announcement_id')['req_exists'].to_dict()
            req_done_lookup = {k: bool(v) for k, v in req_done_lookup.items()}
        else:
            req_done_lookup = {ann_id: False for ann_id in df_main['announcement_id']}

        self.db_operator.dropTable(tmp_check_table)
        print(f"Checked requirements existence for {len(req_done_lookup)} announcements")

        req_done_true = [k for k, v in req_done_lookup.items() if v]
        req_done_false = [k for k, v in req_done_lookup.items() if not v]
        print(f"[DEBUG] req_done=True: {len(req_done_true)} announcements: {req_done_true[:5]}")
        print(f"[DEBUG] req_done=False: {len(req_done_false)} announcements: {req_done_false[:5]}")

        params = []
        print("Preparing parameters for Gemini API calls...")

        doc_id_counts = df_main['document_id'].value_counts()
        duplicate_docs = doc_id_counts[doc_id_counts > 1]
        if len(duplicate_docs) > 0:
            print(f"[DEBUG] df_main contains {len(duplicate_docs)} duplicate document_ids (same PDF, multiple announcements):")
            print(f"[DEBUG] Duplicates: {duplicate_docs.to_dict()}")

        processed_docs = set()
        pdf_path_cache = {}
        missing_json_docs = set()

        for i, row in tqdm(df_main.iterrows(), total=len(df_main), desc="Checking documents"):
            document_id = row["document_id"]
            announcement_id = row["announcement_id"]
            ann_done = bool(row.get("done"))
            req_done = bool(req_done_lookup.get(announcement_id, False))
            json_path = row.get("ocr_json_path")

            if ann_done and req_done:
                continue

            if document_id not in pdf_path_cache:
                save_path = row.get("save_path")
                if isinstance(save_path, str) and save_path.strip():
                    pdf_path_cache[document_id] = save_path
                else:
                    if use_gcs:
                        pdf_path_cache[document_id] = f"gs://ann-files/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
                    else:
                        pdf_path_cache[document_id] = f"output/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"

            pdf_path = pdf_path_cache.get(document_id)
            pdf_exists = True
            if pdf_path and not pdf_path.startswith("gs://"):
                pdf_exists = os.path.exists(pdf_path)
            if not pdf_exists:
                continue

            text_override = None
            if isinstance(json_path, str) and json_path.strip():
                if file_exists_gcs_or_local(json_path):
                    text_override = {"path": json_path}
                else:
                    missing_json_docs.add(document_id)
            else:
                missing_json_docs.add(document_id)

            if not ann_done:
                params.append([
                    self._PROMPT_ANN,
                    document_id,
                    "pdf",
                    self.gemini_model,
                    "ann",
                    use_gcs,
                    pdf_path,
                    text_override
                ])

            if not req_done and document_id not in processed_docs:
                params.append([
                    self._PROMPT_REQ,
                    document_id,
                    "pdf",
                    self.gemini_model,
                    "req",
                    use_gcs,
                    pdf_path,
                    text_override
                ])
                processed_docs.add(document_id)
            if len(params) >= max_api_calls_per_run:
                ann_calls = len([p for p in params if p[4] == "ann"])
                req_calls = len([p for p in params if p[4] == "req"])
                unique_docs = len({p[1] for p in params})
                print(f"\nReached batch processing limit: {len(params)} API calls for {unique_docs} documents (ann: {ann_calls}, req: {req_calls})")
                print("Remaining documents will be processed in the next run.")
                break

        if missing_json_docs:
            print(f"[INFO] Using PDF source for {len(missing_json_docs)} documents without OCR JSON text.")

        ann_calls_total = len([p for p in params if p[4] == "ann"])
        req_calls_total = len([p for p in params if p[4] == "req"])
        unique_docs_total = len({p[1] for p in params})
        print(f"Found {len(params)} API calls for {unique_docs_total} documents (ann: {ann_calls_total}, req: {req_calls_total})")

        req_docs = [p[1] for p in params if p[4] == "req"]
        if req_docs:
            print(f"[DEBUG] Documents for req API calls: {req_docs[:10]}")

        if len(params) > 0:
            print(f"Calling Gemini API with max_concurrency={max_concurrency}...")
            start_time = time.time()
            results = asyncio.run(self._call_parallel(client, params, max_concurrency))
            elapsed_time = time.time() - start_time
            print(f"Gemini API processing completed in {elapsed_time:.2f} seconds")

            ann_results = [r for r in results if r.get("type") == "ann"]
            ann_done_updates = 0

            doc_id_to_ann_ids = df_main.groupby('document_id')['announcement_id'].apply(list).to_dict()

            if len(ann_results) > 0:
                doc_records = []
                ann_records_by_doc = {}

                for res in tqdm(ann_results, desc="Processing announcement results"):
                    document_id = res["document_id"]
                    announcement_ids = doc_id_to_ann_ids.get(document_id, [])

                    try:
                        if res.get("error") is not None:
                            tqdm.write(f"API error for {document_id}: {res.get('error')}")
                            doc_records.append({"document_id": document_id, "done": True, "is_ocr_failed": True})

                            for announcement_id in announcement_ids:
                                if announcement_id not in ann_records_by_doc:
                                    ann_records_by_doc[announcement_id] = []
                                ann_records_by_doc[announcement_id].append({
                                    "document_id": document_id,
                                    "document_title": doc_title_lookup.get(document_id),
                                    "workplace": None, "zipcode": None, "address": None,
                                    "department": None, "assigneename": None, "telephone": None,
                                    "fax": None, "mail": None, "publishdate": None,
                                    "bidType": None, "type": None, "category": None,
                                    "docdiststart": None, "docdistend": None,
                                    "submissionstart": None, "submissionend": None,
                                    "bidstartdate": None, "bidenddate": None,
                                    "ocr_failed": True,
                                    "submission_documents": [],
                                })

                            ann_done_updates += 1
                            continue

                        json_str = res["result"].replace('\n', '').replace('```json', '').replace('```', '')
                        dict0 = json.loads(json_str)
                        dict0 = self._convertJson(dict0)

                        doc_records.append({
                            "document_id": document_id,
                            "pageCount": dict0.get("pageCount"),
                            "done": True,
                            "is_ocr_failed": False,
                            "doc_type": dict0.get("type")
                        })

                        for announcement_id in announcement_ids:
                            if announcement_id not in ann_records_by_doc:
                                ann_records_by_doc[announcement_id] = []

                            ann_records_by_doc[announcement_id].append({
                                "document_id": document_id,
                                "document_title": doc_title_lookup.get(document_id),
                                "workplace": dict0.get("workplace"),
                                "zipcode": dict0.get("zipcode"),
                                "address": dict0.get("address"),
                                "department": dict0.get("department"),
                                "assigneename": dict0.get("assigneename"),
                                "telephone": dict0.get("telephone"),
                                "fax": dict0.get("fax"),
                                "mail": dict0.get("mail"),
                                "publishdate": dict0.get("publishdate"),
                                "bidType": dict0.get("bidType"),
                                "type": dict0.get("type"),
                                "category": dict0.get("category"),
                                "docdiststart": dict0.get("docdiststart"),
                                "docdistend": dict0.get("docdistend"),
                                "submissionstart": dict0.get("submissionstart"),
                                "submissionend": dict0.get("submissionend"),
                                "bidstartdate": dict0.get("bidstartdate"),
                                "bidenddate": dict0.get("bidenddate"),
                                "ocr_failed": False,
                                "submission_documents": dict0.get("submission_documents", []),
                            })

                        ann_done_updates += 1
                    except Exception as e:
                        tqdm.write(f"Error processing {document_id}: {e}")
                        doc_records.append({"document_id": document_id, "done": True, "is_ocr_failed": True, "doc_type": None})

                        for announcement_id in announcement_ids:
                            if announcement_id not in ann_records_by_doc:
                                ann_records_by_doc[announcement_id] = []
                            ann_records_by_doc[announcement_id].append({
                                "document_id": document_id,
                                "document_title": doc_title_lookup.get(document_id),
                                "workplace": None, "zipcode": None, "address": None,
                                "department": None, "assigneename": None, "telephone": None,
                                "fax": None, "mail": None, "publishdate": None,
                                "bidType": None, "type": None, "category": None,
                                "docdiststart": None, "docdistend": None,
                                "submissionstart": None, "submissionend": None,
                                "bidstartdate": None, "bidenddate": None,
                                "ocr_failed": True,
                                "submission_documents": [],
                            })

                        ann_done_updates += 1

                df_doc_records = pd.DataFrame(doc_records)
                if "doc_type" in df_doc_records.columns:
                    df_doc_records.rename(columns={"doc_type": "doc_type_new"}, inplace=True)
                df_doc_records = df_doc_records.drop_duplicates(subset="document_id", keep="first")

                df_main = df_main.merge(df_doc_records, on="document_id", how="left", suffixes=("", "_new"))

                if "done_new" in df_main.columns:
                    df_main["done"] = (df_main["done"] | df_main["done_new"].fillna(False)).astype("boolean")
                    df_main.drop(columns=["done_new"], inplace=True, errors="ignore")

                if "pageCount_new" in df_main.columns:
                    existing = df_main.get("pageCount")
                    new_pc = df_main["pageCount_new"]
                    df_main["pageCount"] = existing
                    mask = (existing.isna()) | (existing <= 0)
                    df_main.loc[mask, "pageCount"] = new_pc.loc[mask]
                    df_main.drop(columns=["pageCount_new"], inplace=True, errors="ignore")

                if "is_ocr_failed_new" in df_main.columns:
                    df_main["is_ocr_failed"] = (df_main["is_ocr_failed"] | df_main["is_ocr_failed_new"].fillna(False)).astype("boolean")
                    df_main.drop(columns=["is_ocr_failed_new"], inplace=True, errors="ignore")

                if "doc_type_new" in df_main.columns:
                    if "type" not in df_main.columns:
                        df_main["type"] = None
                    mask = (
                        df_main["type"].isna()
                        | (df_main["type"].astype(str).str.strip().isin(["", "None", "nan", "その他"]))
                    )
                    df_main.loc[mask, "type"] = df_main.loc[mask, "doc_type_new"]
                    df_main.drop(columns=["doc_type_new"], inplace=True, errors="ignore")

                aggregated_announcements = []
                aggregated_date_records = []
                timestamp_now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                for announcement_id, docs_data in ann_records_by_doc.items():
                    ann_docs = df_main[df_main['announcement_id'] == announcement_id]
                    if len(ann_docs) > 0:
                        workName = self._select_best_value(ann_docs['title'].tolist())
                        topAgencyName = self._select_best_value(ann_docs['topAgencyName'].tolist())
                        orderer_id = self._select_best_value(ann_docs['orderer_id'].tolist())
                        notice_category_name = self._select_best_value(ann_docs['notice_category_name'].tolist()) if 'notice_category_name' in ann_docs else None
                        notice_category_code = self._select_best_value(ann_docs['notice_category_code'].tolist()) if 'notice_category_code' in ann_docs else None
                        notice_procurement_method = self._select_best_value(ann_docs['notice_procurement_method'].tolist()) if 'notice_procurement_method' in ann_docs else None
                    else:
                        workName = None
                        topAgencyName = None
                        orderer_id = None
                        notice_category_name = None
                        notice_category_code = None
                        notice_procurement_method = None

                    category_ocr = self._select_best_value([d["category"] for d in docs_data])
                    bidType_ocr = self._select_best_value([d["bidType"] for d in docs_data])

                    has_ocr_failure = any(d.get("ocr_failed", False) for d in docs_data)

                    category_segment, category_detail = self._normalize_category_fields(
                        category_ocr,
                        notice_category_name,
                        notice_category_code,
                    )
                    if not category_segment:
                        category_segment = notice_category_name
                    if (not category_detail) and notice_category_code and notice_category_code != category_segment:
                        category_detail = notice_category_code

                    aggregated = {
                        "announcement_no": announcement_id,
                        "workName": workName,
                        "topAgencyName": topAgencyName,
                        "orderer_id": orderer_id,
                        "workPlace": self._select_best_value([d["workplace"] for d in docs_data]),
                        "zipcode": self._select_best_value([d["zipcode"] for d in docs_data]),
                        "address": self._select_best_value([d["address"] for d in docs_data]),
                        "department": self._select_best_value([d["department"] for d in docs_data]),
                        "assigneeName": self._select_best_value([d["assigneename"] for d in docs_data]),
                        "telephone": self._select_best_value([d["telephone"] for d in docs_data]),
                        "fax": self._select_best_value([d["fax"] for d in docs_data]),
                        "mail": self._select_best_value([d["mail"] for d in docs_data]),
                        "publishDate": self._select_best_value([d["publishdate"] for d in docs_data]),
                        "bidType": bidType_ocr,
                        "category": category_ocr,
                        "category_segment": category_segment,
                        "category_detail": category_detail,
                        "docDistStart": self._select_best_value([d["docdiststart"] for d in docs_data]),
                        "docDistEnd": self._select_best_value([d["docdistend"] for d in docs_data]),
                        "submissionStart": self._select_best_value([d["submissionstart"] for d in docs_data]),
                        "submissionEnd": self._select_best_value([d["submissionend"] for d in docs_data]),
                        "bidStartDate": self._select_best_value([d["bidstartdate"] for d in docs_data]),
                        "bidEndDate": self._select_best_value([d["bidenddate"] for d in docs_data]),
                        "is_ocr_failed": has_ocr_failure,
                        "doneOCR": True,
                        "createdDate": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        "updatedDate": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        "notice_category_name": notice_category_name,
                        "notice_category_code": notice_category_code,
                        "notice_procurement_method": notice_procurement_method,
                    }
                    aggregated_announcements.append(aggregated)

                    for doc_entry in docs_data:
                        submission_docs = doc_entry.get("submission_documents") or []
                        doc_id = doc_entry.get("document_id")
                        for submission in submission_docs:
                            submission_name = submission.get("submission_document_name")
                            date_raw = submission.get("date_raw")
                            date_value = submission.get("date_value")
                            date_meaning = submission.get("date_meaning")
                            timepoint_type = submission.get("timepoint_type") or "single"
                            if not any([submission_name, date_raw, date_value, date_meaning]):
                                continue
                            aggregated_date_records.append({
                                "announcement_no": announcement_id,
                                "document_id": doc_id,
                                "submission_document_name": submission_name,
                                "date_value": date_value,
                                "date_raw": date_raw,
                                "date_meaning": date_meaning,
                                "timepoint_type": timepoint_type,
                                "createdDate": timestamp_now,
                                "updatedDate": timestamp_now
                            })

                df_announcements = pd.DataFrame(aggregated_announcements) if aggregated_announcements else pd.DataFrame()
                df_dates = pd.DataFrame(aggregated_date_records) if aggregated_date_records else pd.DataFrame()
                if not df_dates.empty:
                    subset_cols = ["announcement_no", "document_id", "submission_document_name", "date_value", "date_meaning", "timepoint_type"]
                    df_dates = df_dates.sort_values(subset_cols + ["date_raw"])
                    df_dates = df_dates.drop_duplicates(subset=subset_cols, keep="first")

                print(f"Updated {len(doc_records)} documents with pageCount and done status")
                print(f"Aggregated {len(aggregated_announcements)} announcements from {len(ann_results)} OCR results")
            else:
                df_announcements = pd.DataFrame()
                df_dates = pd.DataFrame()

            req_results = [r for r in results if r.get("type") == "req"]
            db_req_records = []

            if len(req_results) > 0:
                doc_to_ann_ids = df_main.groupby('document_id')['announcement_id'].apply(list).to_dict()

                for res in tqdm(req_results, desc="Processing requirement results"):
                    document_id = res["document_id"]
                    announcement_ids = doc_to_ann_ids.get(document_id, [])

                    try:
                        has_error = res.get("error") is not None

                        if has_error:
                            text2 = str(res["error"])
                        else:
                            text2 = res["result"].replace('\n', '').replace('```json', '').replace('```', '')

                        try:
                            requirement_texts = json.loads(text2)
                        except json.decoder.JSONDecodeError:
                            text2 = text2.replace('"', "'")
                            requirement_texts = json.loads('{"資格・条件" : ["' + text2 + '"]}')

                        if isinstance(requirement_texts, dict) and "資格・条件" in requirement_texts:
                            req_list = requirement_texts["資格・条件"]
                        elif isinstance(requirement_texts, list):
                            req_list = requirement_texts
                        else:
                            req_list = ["Error fetching requirements."]

                        for announcement_id in announcement_ids:
                            for idx, req_text in enumerate(req_list):
                                req_type = self._classify_requirement_type(req_text)
                                db_req_records.append({
                                    'document_id': document_id,
                                    'announcement_no': announcement_id,
                                    'requirement_no': None,
                                    'requirement_text': req_text,
                                    'requirement_type': req_type,
                                    'is_ocr_failed': has_error,
                                    'done_judgement': False,
                                    'createdDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    'updatedDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                                })

                    except Exception as e:
                        tqdm.write(f"Error processing requirements for {document_id}: {e}")
                        for announcement_id in announcement_ids:
                            db_req_records.append({
                                'document_id': document_id,
                                'announcement_no': announcement_id,
                                'requirement_no': None,
                                'requirement_text': f"Error: {str(e)}",
                                'requirement_type': "その他要件",
                                'is_ocr_failed': True,
                                'done_judgement': False,
                                'createdDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                'updatedDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                            })

                df_requirements = pd.DataFrame(db_req_records) if db_req_records else pd.DataFrame()
                print(f"Processed {len(req_results)} documents with requirement data")
                print(f"Created {len(db_req_records)} requirement records")
            else:
                df_requirements = pd.DataFrame()

        else:
            df_announcements = pd.DataFrame()
            df_requirements = pd.DataFrame()
            df_dates = pd.DataFrame()

        return df_main, df_announcements, df_requirements, df_dates


    async def _call_parallel(self, client, params, max_concurrency=5):
        """
        Gemini APIを並列で呼び出し
        """
        queue = asyncio.Queue()
        results = []

        for p in params:
            await queue.put(p)

        async def worker():
            while True:
                item = await queue.get()
                if item is None:
                    break

                text_override = None
                if len(item) >= 8:
                    prompt, document_id, data_type, model, type2, use_gcs, save_path, text_override = item
                elif len(item) == 7:
                    prompt, document_id, data_type, model, type2, use_gcs, save_path = item
                elif len(item) == 6:
                    prompt, document_id, data_type, model, type2, use_gcs = item
                    save_path = None
                else:
                    raise ValueError("Unexpected parameter format for _call_parallel worker.")

                for attempt in range(3):
                    try:
                        result = await asyncio.to_thread(
                            self._call_gemini,
                            client,
                            prompt,
                            document_id,
                            data_type,
                            model,
                            use_gcs,
                            save_path,
                            text_override=text_override
                        )

                        results.append({
                            "document_id": document_id,
                            "file_format": data_type,
                            "result": result,
                            "error": None,
                            "type": type2
                        })
                        break

                    except Exception as e:
                        error_code = getattr(e, "code", None)
                        retry_codes = [429, 500, 502, 503, 504]
                        if error_code in retry_codes and attempt < 2:
                            await asyncio.sleep(2 ** (attempt + 1) + random.random())
                        else:
                            results.append({
                                "document_id": document_id,
                                "result": None,
                                "error": error_code,
                                "type": type2
                            })
                            break

                queue.task_done()

        workers = [asyncio.create_task(worker()) for _ in range(max_concurrency)]

        await queue.join()

        for _ in workers:
            await queue.put(None)

        await asyncio.gather(*workers)

        return results


    def _call_gemini(self, client, prompt, document_id, data_type, model="gemini-2.5-flash", use_gcs=True, save_path=None, text_override=None):
        """
        Gemini APIを呼び出してファイルを解析
        """
        mime_type = None
        data = None
        if text_override is not None:
            text_data = None
            if isinstance(text_override, dict) and "path" in text_override:
                text_data = self._load_ocr_json_extracted_text(text_override["path"], use_gcs=use_gcs)
                if text_data is None:
                    print(f"[WARN] Failed to load OCR JSON text for {document_id}; falling back to PDF.")
                    text_override = None
                    data_type = "pdf"
            elif isinstance(text_override, str):
                text_data = text_override
            else:
                text_override = None
                data_type = "pdf"

            if text_override is not None and text_data is not None:
                data = text_data.encode("utf-8")
                mime_type = "text/plain"

        if data is None:
            if save_path:
                if use_gcs and save_path.startswith("gs://"):
                    from google.cloud import storage
                    storage_client = storage.Client()
                    parts = save_path.replace("gs://", "").split("/", 1)
                    bucket_name = parts[0]
                    blob_path = parts[1]
                    bucket = storage_client.bucket(bucket_name)
                    blob = bucket.blob(blob_path)
                    data = blob.download_as_bytes()
                else:
                    with open(save_path, "rb") as f:
                        data = f.read()
            else:
                if use_gcs:
                    from google.cloud import storage
                    storage_client = storage.Client()
                    bucket_name = "ann-files"
                    blob_path = f"pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
                    bucket = storage_client.bucket(bucket_name)
                    blob = bucket.blob(blob_path)
                    data = blob.download_as_bytes()
                else:
                    pdf_path = f"output/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
                    with open(pdf_path, "rb") as f:
                        data = f.read()

            mime_types = {
                "pdf": "application/pdf",
                "text": "text/plain"
            }
            mime_type = mime_types.get(data_type.lower(), "application/pdf")

        config_kwargs = {}
        if self.gemini_max_output_tokens is not None:
            config_kwargs["max_output_tokens"] = self.gemini_max_output_tokens

        if config_kwargs:
            config = types.GenerateContentConfig(**config_kwargs)
        else:
            config = None

        response = client.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(
                    data=data,
                    mime_type=mime_type,
                ),
                prompt
            ],
            config=config
        )

        return response.text


    def _convertJson(self, json_value):
        """
        Geminiから取得したJSONを整形
        """
        def _modifyDate(datestr, handle_same_year=None, handle_same_month=None):
            try:
                datestr = datestr.replace(" ", "").replace("\u3000", "")
                datestr = datestr.replace("令和元年", "令和1年")

                if "同年" in datestr:
                    datestr = datestr.replace("同年", f"{handle_same_year}年")

                m = re.search(r"同月(\d+)日", datestr)
                if m and handle_same_month:
                    y, mth = handle_same_month.split("-")
                    return f"{y}-{mth}-{int(m.group(1)):02}"

                m = re.search(r"令和(\d+)年(\d+)月(\d+)日", datestr)
                if m:
                    return f"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                m = re.search(r"(\d{4})年(\d+)月(\d+)日", datestr)
                if m:
                    return f"{int(m.group(1))}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                m = re.search(r"(\d{1,2})年(\d+)月(\d+)日", datestr)
                if m:
                    year = int(m.group(1))
                    if year < 100:
                        return f"{year+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"
                    else:
                        return f"{year}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                m = re.search(r"R(\d+)\.(\d{1,2})\.(\d{1,2})", datestr)
                if m:
                    return f"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                m = re.search(r"\b(\d+)\.(\d{1,2})\.(\d{1,2})\b", datestr)
                if m:
                    return f"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                m = re.search(r"(\d{4})/(\d{1,2})/(\d{1,2})", datestr)
                if m:
                    return f"{int(m.group(1))}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                return datestr
            except Exception:
                return None

        def extract_year(s: str) -> str:
            if not s:
                return ""
            try:
                dt = datetime.strptime(s, "%Y-%m-%d")
                return str(dt.year)
            except ValueError:
                return ""

        def extract_same_year_month(s: str) -> str:
            if not s:
                return ""
            try:
                dt = datetime.strptime(s, "%Y-%m-%d")
                return f"{dt.year}-{dt.month:02}"
            except ValueError:
                return ""

        def normalize_category(value):
            if isinstance(value, list):
                flattened = [str(v).strip() for v in value if isinstance(v, str) and v.strip()]
                return " / ".join(flattened) if flattened else None
            if isinstance(value, str):
                value = value.strip()
                return value or None
            return None

        def normalize_timepoint(value, meaning):
            if isinstance(value, str):
                t = value.strip().lower()
                if t in ["開始", "start", "begin", "start_date", "start_time"]:
                    return "start"
                if t in ["終了", "完了", "end", "finish", "end_date", "end_time"]:
                    return "end"
                if t in ["単日", "single", "single_day"]:
                    return "single"
            if meaning and ("公告" in meaning or "説明会" in meaning or "開札" in meaning or "入札日" in meaning):
                return "single"
            return "single"

        new_json = {}
        new_json["workplace"] = json_value.get("工事場所", None)

        tmp_json = json_value.get("入札手続等担当部局", None)
        if isinstance(tmp_json, dict):
            new_json["zipcode"] = tmp_json.get("郵便番号", None)
            new_json["address"] = tmp_json.get("住所", None)
            new_json["department"] = tmp_json.get("担当部署名", None)
            new_json["assigneename"] = tmp_json.get("担当者名", None)
            new_json["telephone"] = tmp_json.get("電話番号", None)
            new_json["fax"] = tmp_json.get("FAX番号", None)
            new_json["mail"] = tmp_json.get("メールアドレス", None)

        tmp_val = json_value.get("公告日", None)
        if isinstance(tmp_val, str):
            new_json["publishdate"] = _modifyDate(datestr=tmp_val)
        else:
            new_json["publishdate"] = None

        new_json["bidType"] = json_value.get("入札方式", None)
        new_json["type"] = json_value.get("資料種類", None)
        new_json["category"] = normalize_category(json_value.get("category", None))
        new_json["pageCount"] = json_value.get("pageCount", None)

        tmp_json = json_value.get("入札説明書の交付期間", None)
        if isinstance(tmp_json, dict):
            new_json["docdiststart"] = _modifyDate(datestr=tmp_json.get("開始日", None))
            new_json["docdistend"] = _modifyDate(
                datestr=tmp_json.get("終了日", None),
                handle_same_year=extract_year(new_json.get("docdiststart")),
                handle_same_month=extract_same_year_month(new_json.get("docdiststart"))
            )

        tmp_json = json_value.get("申請書及び競争参加資格確認資料の提出期限", None)
        if isinstance(tmp_json, dict):
            new_json["submissionstart"] = _modifyDate(datestr=tmp_json.get("開始日", None))
            new_json["submissionend"] = _modifyDate(
                datestr=tmp_json.get("終了日", None),
                handle_same_year=extract_year(new_json.get("submissionstart")),
                handle_same_month=extract_same_year_month(new_json.get("submissionstart"))
            )

        tmp_json = json_value.get("入札書の提出期間", None)
        if isinstance(tmp_json, dict):
            new_json["bidstartdate"] = _modifyDate(datestr=tmp_json.get("開始日", None))
            new_json["bidenddate"] = _modifyDate(
                datestr=tmp_json.get("終了日", None),
                handle_same_year=extract_year(new_json.get("bidstartdate")),
                handle_same_month=extract_same_year_month(new_json.get("bidstartdate"))
            )

        submission_records = []
        doc_entries = json_value.get("提出書類一覧", None)
        if isinstance(doc_entries, list):
            for entry in doc_entries:
                if not isinstance(entry, dict):
                    continue
                document_name = entry.get("書類名") or entry.get("提出書類") or entry.get("document") or entry.get("書類")
                date_raw = entry.get("日付") or entry.get("date")
                meaning = entry.get("意味") or entry.get("説明") or entry.get("日付の意味")
                timepoint = entry.get("時点") or entry.get("timepoint")
                if not any([document_name, date_raw, meaning]):
                    continue
                normalized_date = _modifyDate(datestr=date_raw) if date_raw else None
                submission_records.append({
                    "submission_document_name": document_name,
                    "date_raw": date_raw,
                    "date_value": normalized_date,
                    "date_meaning": meaning,
                    "timepoint_type": normalize_timepoint(timepoint, meaning)
                })

        new_json["submission_documents"] = submission_records

        return new_json
