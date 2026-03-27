#coding: utf-8
"""
step0 関連メソッドを提供する Mixin。

HTML取得、リンク抽出、フォーマット処理、DB保存を担当する。
"""

import json
import os
import re
import csv
import time
import shutil
from datetime import datetime
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse, urljoin

import pandas as pd
import numpy as np
import requests
from tqdm import tqdm
from bs4 import BeautifulSoup, Comment
from ftfy.badness import badness

from packages.engine.domain.structured_page import infer_table_specs
from packages.engine.domain.notice_structures import (
    StructuredNotice,
    NoticeDocument,
    DEFAULT_FIELD_RULES,
    clean_document_label,
    infer_category_from_fields,
    infer_notice_title,
    infer_procurement_method,
    pick_field,
    merge_field_rules,
    normalize_space,
    slugify_identifier,
    parse_japanese_date,
)


FILE_LINK_PATTERN = re.compile(r'\.(pdf|xlsx?|csv|zip|docx?|txt)$', re.IGNORECASE)


class DocumentPreparationMixin:
    """step0関連メソッドを提供するMixin"""

    def step0_prepare_documents(
        self,
        input_list_file,
        output_base_dir="bid_announcement_judgement_tools/output",
        timestamp=None,
        topAgencyName="防衛省",
        extracted_at=None,
        base_digits=5,
        no_merge=False,
        skip_db_save=False,
        use_gcs=False,
        do_fetch_html=True,
        do_extract_links=True,
        do_format_documents=True,
        do_download_pdfs=True,
        do_markdown=False,
        do_ocr_json=False,
        do_count_pages=True,
        do_ocr=True,
        ocr_max_concurrency=5,
        ocr_max_api_calls_per_run=1000
    ):
        """
        step0 : 公告ドキュメント準備処理

        公告リストファイルから以下を実行：
        1. HTMLページ取得（オプション）
        2. ドキュメントリンク抽出（オプション）
        3. announcements_document_table に DB 保存（オプション）
        4. PDFダウンロード（オプション）
        5. Markdown生成（オプション）
        6. OCR JSON生成（オプション）
        7. PDFページ数カウント（オプション）
        8. Gemini OCR 実行（オプション）

        出力ディレクトリ構造：
            {timestamp}/
            ├── step0_html_DL/                  各公告HTMLダウンロード先
            │   └── {index}_{topAgencyName}_{subAgencyName}.html
            ├── step0_html_list/                リスト・リンク抽出結果
            │   ├── input_list_converted.txt
            │   ├── input_list_converted.html
            │   └── announcements_links.txt
            └── req_announcements_document.txt  (OCR実行時)

        注意: announcements_document データは DB に直接保存されます（ファイル出力なし）

        Args:
            input_list_file: リスト_防衛省入札_1.txt のパス
            output_base_dir: 出力ベースディレクトリ
            timestamp: タイムスタンプ (YYYYMMDDHHMM形式)。Noneなら現在時刻
            topAgencyName: トップ機関名
            extracted_at: 抽出日 (YYYY-MM-DD形式)。Noneなら現在日付
            base_digits: announcement_id のグルーピング桁数
            no_merge: 過去の結果とマージしないフラグ
            skip_db_save: True の場合は DB 保存処理をスキップ
            use_gcs: GCS (gs://) を使用する場合 True（--use_postgres 指定時も自動で True 相当になる）
            do_fetch_html: HTML ページを取得する場合 True
            do_extract_links: ドキュメントリンクを抽出する場合 True
            do_format_documents: ドキュメント情報をフォーマットする場合 True
            do_download_pdfs: PDF をダウンロードする場合 True
            do_markdown: PDF 取得後に Gemini で Markdown を生成する場合 True
            do_ocr_json: Gemini OCR JSON を生成する場合 True
            do_count_pages: PDF のページ数をカウントする場合 True
            do_ocr: Gemini OCR を実行する場合 True
            ocr_max_concurrency: OCR 実行時の最大並列数
            ocr_max_api_calls_per_run: 1回の実行での最大API呼び出し数（デフォルト: 1000）
        """
        print("=" * 60)
        print("Step0: Document Preparation")
        print("=" * 60)

        # タイムスタンプとextracted_atの設定
        if timestamp is None:
            timestamp = datetime.now().strftime("%Y%m%d%H%M")
        if extracted_at is None:
            extracted_at = datetime.now().strftime("%Y-%m-%d")

        # 出力ディレクトリの設定
        script_dir = Path(__file__).parent
        print(fr"script_dir={script_dir}")

        output_base_dir_path = Path(output_base_dir)
        if output_base_dir_path.is_absolute():
            output_base = output_base_dir_path
        else:
            project_root = script_dir.parent.parent.parent  # judgesystem/
            output_base = project_root / output_base_dir_path
        output_dir = output_base / timestamp
        output_dir_html_DL = output_dir / "step0_html_DL"
        output_dir_html_list = output_dir / "step0_html_list"

        # ディレクトリ作成
        os.makedirs(output_dir_html_DL, exist_ok=True)
        os.makedirs(output_dir_html_list, exist_ok=True)

        print(f"Output directory: {output_dir}")
        print(f"Timestamp: {timestamp}")
        print(f"Extracted at: {extracted_at}")

        # ステップ数の計算
        total_steps = (1 if do_fetch_html else 0) + \
                     (1 if do_extract_links else 0) + \
                     (1 if do_format_documents else 0) + \
                     (1 if do_download_pdfs else 0) + \
                     (1 if do_markdown else 0) + \
                     (1 if do_ocr_json else 0) + \
                     (1 if do_count_pages else 0) + \
                     (1 if do_ocr else 0)
        step_num = 0

        # 1. HTML取得処理
        input_list2_file = output_dir_html_list / "input_list_converted.txt"
        provided_input_list = Path(input_list_file)
        provided_is_converted = provided_input_list.name == "input_list_converted.txt"

        if provided_is_converted:
            if not provided_input_list.exists():
                raise FileNotFoundError(f"Provided converted file not found: {provided_input_list}")
            if provided_input_list.resolve() != input_list2_file.resolve():
                shutil.copy2(provided_input_list, input_list2_file)
                source_html = provided_input_list.with_suffix(".html")
                if source_html.exists():
                    shutil.copy2(source_html, input_list2_file.with_suffix(".html"))
            print(f"\n[Info] Using pre-converted input list: {provided_input_list}")
            input_list2_path = str(input_list2_file)
        elif do_fetch_html:
            if input_list2_file.exists():
                print(f"\n[Skipped] Fetching HTML pages (do_fetch_html=True but reuse existing {input_list2_file})")
                input_list2_path = str(input_list2_file)
            else:
                step_num += 1
                print(f"\n[{step_num}/{total_steps}] Fetching HTML pages...")
                input_list2_path = self._step0_convert_input_list(input_list_file, output_dir_html_list)
                self._step0_fetch_html_pages(input_list2_path, output_dir_html_DL, topAgencyName)
        else:
            print("\n[Skipped] Fetching HTML pages (using existing files)...")
            input_list2_path = input_list2_file
            if not Path(input_list2_path).exists():
                raise FileNotFoundError(f"Required file not found: {input_list2_path}")
            input_list2_path = str(input_list2_path)

        self._html_metadata_lookup = self._build_html_metadata_lookup(input_list2_path, topAgencyName)

        # 2. リンク抽出処理
        if do_extract_links:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Extracting document links...")
            links_file = self._step0_extract_links(output_dir_html_DL, output_dir_html_list)
        else:
            print("\n[Skipped] Extracting document links (using existing file)...")
            links_file = str(output_dir_html_list / "announcements_links.txt")
            if not Path(links_file).exists():
                raise FileNotFoundError(f"Required file not found: {links_file}")

        # 3. フォーマット処理
        if do_format_documents:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Formatting documents...")
            df_merged = self._step0_format_documents(
                input_list2_path,
                links_file,
                output_dir,
                output_base,
                timestamp,
                extracted_at,
                base_digits,
                no_merge,
                topAgencyName
            )
        else:
            print("\n[Skipped] Formatting documents")
            print("Error: do_format_documents must be True for step0")
            raise ValueError("--step0_do_format_documents is required")

        # 4. PDFダウンロード（オプション）
        if do_download_pdfs:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Downloading PDFs...")
            df_merged = self._step0_download_pdfs(df_merged, use_gcs=use_gcs)
            print(f"Updated DataFrame with pdf_is_saved info")

        # 5. Markdown生成（オプション）
        if do_markdown:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Generating Markdown summaries...")
            df_merged = self._step0_generate_markdown(
                df_main=df_merged,
                use_gcs=use_gcs,
                max_concurrency=ocr_max_concurrency,
                max_api_calls_per_run=ocr_max_api_calls_per_run,
                force_regenerate=False
            )
            print("Updated DataFrame with Markdown content")
        else:
            print("\n[Skipped] Generating Markdown summaries")

        # 6. OCR JSON生成（オプション）
        if do_ocr_json:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Generating OCR JSON artifacts...")
            df_merged = self._step0_generate_ocr_json(
                df_main=df_merged,
                use_gcs=use_gcs,
                max_concurrency=ocr_max_concurrency,
                max_api_calls_per_run=ocr_max_api_calls_per_run,
                debug_output_list_path=self.ocr_json_debug_output_path
            )
            print("OCR JSON generation completed.")
        else:
            print("\n[Skipped] Generating OCR JSON artifacts")

        # 7. PDFページ数カウント（オプション）
        if do_count_pages:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Counting PDF pages...")
            df_merged = self._step0_count_pages(df_merged)
            print(f"Updated DataFrame with pageCount info")

        # 8. Gemini OCR 実行（オプション）
        if do_ocr:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Running Gemini OCR...")

            # DataFrame を直接渡して OCR 処理
            df_merged, df_announcements, df_requirements = self._step0_ocr_with_gemini(
                df_main=df_merged,
                use_gcs=use_gcs,
                max_concurrency=ocr_max_concurrency,
                max_api_calls_per_run=ocr_max_api_calls_per_run
            )

            print(f"OCR completed.")
        else:
            print("\n[Skipped] Running Gemini OCR")
            df_announcements = pd.DataFrame()
            df_requirements = pd.DataFrame()

        # 9. DB に保存（3つのテーブル）
        if skip_db_save:
            print("\n" + "=" * 60)
            print("Skipping database save (--step0_skip_db_save is ON).")
            print("Generated DataFrame objects are kept in memory / files only.")
            print("Step0 processing finished without DB merge.")
            print("=" * 60)
            return

        print("\n" + "=" * 60)
        print("Saving data to database tables...")
        print("=" * 60)

        # 9-1. announcements_documents_master
        print("\n[1/3] Saving announcements_documents_master...")
        self._save_to_announcements_document_table(df_merged)

        # 9-2. bid_announcements
        print("\n[2/3] Saving bid_announcements...")
        self._save_to_bid_announcements(df_announcements)

        # 9-3. bid_requirements
        print("\n[3/3] Saving bid_requirements...")
        self._save_to_bid_requirements(df_requirements)

        print("\n" + "=" * 60)
        print(f"Step0 completed successfully!")
        print(f"Saved data to: announcements_documents_master, bid_announcements, bid_requirements")
        print("=" * 60)


    def _step0_convert_input_list(self, input_list1, output_dir):
        """
        入力リストファイルを変換（TinyURL展開など）
        """
        output_list2 = output_dir / "input_list_converted.txt"

        if output_list2.exists():
            print(f"Converted list already exists: {output_list2}")
            return str(output_list2)

        print(f"Converting input list: {input_list1}")
        df = pd.read_csv(input_list1, sep="\t")

        # TinyURL展開処理
        def expand_tinyurl(url):
            if isinstance(url, str) and url.startswith("https://tinyurl"):
                time.sleep(0.2)
                try:
                    r = requests.get(url, allow_redirects=True, timeout=5)
                    if r.url.startswith("https://tinyurl"):
                        return None
                    return r.url
                except Exception:
                    return None
            return url

        # 落札情報列に対して処理
        if "落札情報（過去）" in df.columns:
            tmp_df = df["落札情報（過去）"]
            df["落札情報（過去）"] = df["落札情報（過去）"].apply(
                lambda x: f"<a href='{x}'>{x}</a>" if isinstance(x, str) else x
            )
            df.insert(df.columns.get_loc('落札情報（過去）')+1, "落札情報（過去）2", tmp_df.apply(expand_tinyurl))

        # 入札公告列に対して処理
        if "入札公告（現在募集中）" in df.columns:
            tmp_df = df["入札公告（現在募集中）"]
            df["入札公告（現在募集中）"] = df["入札公告（現在募集中）"].apply(
                lambda x: f"<a href='{x}'>{x}</a>" if isinstance(x, str) else x
            )
            df.insert(df.columns.get_loc('入札公告（現在募集中）')+1, "入札公告（現在募集中）2", tmp_df.apply(expand_tinyurl))

        df.to_csv(output_list2, sep="\t", index=False)
        df.to_html(output_list2.with_suffix(".html"), escape=False)
        print(f"Converted list saved: {output_list2}")
        print(f"HTML list saved: {output_list2.with_suffix('.html')}")

        return str(output_list2)


    def _step0_fetch_html_pages(self, input_list_file, output_dir_html, topAgencyName):
        """
        公告ページのHTMLを取得
        """
        df = pd.read_csv(input_list_file, sep="\t")

        target_column = "入札公告（現在募集中）2" if "入札公告（現在募集中）2" in df.columns else "入札公告（現在募集中）"

        fetch_count = 0
        skip_count = 0

        for i, row in tqdm(df.iterrows(), total=len(df), desc="Fetching HTML"):
            target_index = row["index"]
            subAgencyName = row.get("Unnamed: 0", "unknown")
            target_url = row[target_column]

            output_file = f"{target_index:05d}_{topAgencyName}_{subAgencyName}.html"
            output_path = output_dir_html / output_file

            if output_path.exists():
                meta_path = output_path.with_suffix(".meta.json")
                if not meta_path.exists() and isinstance(target_url, str):
                    self._write_html_metadata(output_path, target_url, topAgencyName, subAgencyName)
                skip_count += 1
                continue

            if not isinstance(target_url, str) or not target_url.startswith("https"):
                skip_count += 1
                continue

            if target_url.endswith(".pdf"):
                skip_count += 1
                continue

            time.sleep(0.15)

            try:
                html_content = self._fetch_html_content(target_url)
                if html_content:
                    with open(output_path, "w", encoding="utf-8") as f:
                        f.write(html_content)
                    self._write_html_metadata(output_path, target_url, topAgencyName, subAgencyName)
                    fetch_count += 1
            except Exception as e:
                tqdm.write(f"Error fetching index={target_index}: {e}")
                skip_count += 1

        print(f"HTML fetch completed: {fetch_count} fetched, {skip_count} skipped")


    def _fetch_html_content(self, target_url):
        """
        指定URLからHTMLコンテンツを取得・クリーニング
        """
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36",
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp",
            "Connection": "keep-alive",
        }

        if target_url.startswith("https://tinyurl.com"):
            response = requests.head(target_url, allow_redirects=True)
            if response.url.startswith("https://tinyurl.com") or response.url.endswith(".pdf"):
                return None
            target_url = response.url

        response = requests.get(url=target_url, headers=headers)
        soup = BeautifulSoup(response.text, "html.parser")

        charset = None
        meta = soup.find("meta", attrs={"charset": True})
        if meta:
            charset = meta["charset"]
        else:
            meta = soup.find("meta", attrs={"http-equiv": "Content-Type"})
            if meta and "charset=" in meta.get("content", ""):
                charset = meta["content"]

        charset_dict = {
            "shift_jis": ["cp932", "shift-jis", "shift_jis"],
            "utf-8": ["utf-8"]
        }
        charset_guess = None
        if charset is not None:
            for key, value in charset_dict.items():
                for v in value:
                    if re.search(v, charset, flags=re.IGNORECASE):
                        charset_guess = key
                        break

        if charset_guess is not None:
            response.encoding = charset_guess
        else:
            enc_list = list(set([i.lower() for i in [response.encoding, response.apparent_encoding, "shift_jis", "utf-8"]]))
            score_list = []
            for enc in enc_list:
                response.encoding = enc
                soup = BeautifulSoup(response.text, "html.parser")
                score = badness(response.text)
                score_list.append(score)
            charset_guess = enc_list[score_list.index(min(score_list))]
            response.encoding = charset_guess

        soup = BeautifulSoup(response.text, "html.parser")

        for tag in soup(["script", "style"]):
            tag.decompose()

        for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
            comment.extract()

        html = str(soup)
        html = re.sub(r"\s+", " ", html)
        html = html.strip()

        return html


    def _write_html_metadata(self, html_path, target_url, top_agency, sub_agency):
        """
        保存済みHTMLごとのメタデータをJSONとして出力する。
        """
        from packages.engine.sources import find_source_spec, find_source_spec_from_db

        meta_path = html_path.with_suffix(".meta.json")
        metadata = {
            "source_url": target_url,
            "top_agency_name": top_agency,
            "sub_agency_name": sub_agency,
            "page_code": None,
            "created_at": datetime.now().isoformat(),
        }

        db_operator = getattr(self, "db_operator", None)
        spec = None
        if db_operator:
            try:
                spec = find_source_spec_from_db(
                    db_operator,
                    source_url=target_url,
                    top_agency=top_agency,
                    sub_agency=sub_agency,
                )
            except Exception as exc:
                print(f"[WARN] Failed to resolve SourceSpec from DB for {target_url}: {exc}")
        if spec is None:
            spec = find_source_spec(
                top_agency=top_agency,
                sub_agency=sub_agency,
                source_url=target_url,
            )
        if spec and spec.page_code:
            metadata["page_code"] = spec.page_code

        try:
            meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            print(f"[WARN] Failed to write metadata for {html_path}: {exc}")


    def _build_html_metadata_lookup(self, input_list2_path, top_agency_name):
        lookup = {}
        if not input_list2_path or not Path(input_list2_path).exists():
            return lookup
        try:
            df = pd.read_csv(input_list2_path, sep="\t")
        except Exception as exc:
            print(f"[WARN] Failed to load {input_list2_path}: {exc}")
            return lookup
        target_column = "入札公告（現在募集中）2" if "入札公告（現在募集中）2" in df.columns else "入札公告（現在募集中）"
        for _, row in df.iterrows():
            try:
                index_value = int(row["index"])
            except Exception:
                continue
            sub_agency = row.get("Unnamed: 0", "unknown")
            url = row.get(target_column)
            if not isinstance(url, str) or not url.startswith("http"):
                continue
            filename = f"{index_value:05d}_{top_agency_name}_{sub_agency}.html"
            lookup[filename] = {
                "source_url": url,
                "top_agency_name": top_agency_name,
                "sub_agency_name": sub_agency,
            }
        return lookup


    def _ensure_html_metadata(self, html_file, info):
        meta_path = html_file.with_suffix(".meta.json")
        if meta_path.exists():
            return
        if not info:
            return
        self._write_html_metadata(
            html_file,
            info.get("source_url"),
            info.get("top_agency_name", "unknown"),
            info.get("sub_agency_name", "unknown"),
        )


    def _step0_extract_links(self, input_dir_html, output_dir_links):
        """
        HTMLファイルから公告ドキュメントのリンクを抽出
        """
        output_file = output_dir_links / "announcements_links.txt"

        html_files = sorted(Path(input_dir_html).glob('*.html'))

        if not html_files:
            raise FileNotFoundError(f"No HTML files found in {input_dir_html}")

        print(f"Found {len(html_files)} HTML files")

        metadata_lookup = getattr(self, "_html_metadata_lookup", {})

        def _sanitize(value):
            if value is None:
                return ""
            if isinstance(value, str):
                return value.replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()
            return str(value)

        with open(output_file, 'w', encoding='utf-8') as out_f:
            out_f.write(
                "target_link\tpre_announcement_id\tannouncement_name\tlink_text\tpdf_link\t"
                "notice_category_name\tnotice_category_code\tnotice_procurement_method\t"
                "notice_announced_at\tnotice_deadline\tnotice_open_at\tnotice_location\t"
                "notice_normalized_title\tnotice_fields_json\n"
            )

            total_announcements = 0
            total_links = 0

            for html_file in tqdm(html_files, desc="Extracting links"):
                try:
                    file_metadata = metadata_lookup.get(html_file.name, {})
                    if metadata_lookup:
                        self._ensure_html_metadata(html_file, file_metadata)
                    source_spec = self._get_source_spec_for_file(html_file)
                    announcements = self._extract_links_from_html(
                        html_file,
                        source_spec=source_spec,
                        base_url=file_metadata.get("source_url"),
                    )

                    file_links = 0
                    for announcement_id, notice in enumerate(announcements, start=1):
                        if not notice.documents:
                            continue
                        fields_json = json.dumps(
                            notice.fields or {},
                            ensure_ascii=False,
                            sort_keys=True,
                        )
                        base_values = [
                            html_file.name,
                            announcement_id,
                            notice.title or "",
                            None,
                            None,
                            notice.category_name or "",
                            notice.category_code or "",
                            notice.procurement_method or "",
                            notice.announced_at or "",
                            notice.deadline or "",
                            notice.open_at or "",
                            notice.location or "",
                            notice.normalized_title or "",
                            fields_json,
                        ]
                        for doc in notice.documents:
                            row_values = base_values.copy()
                            row_values[3] = doc.label
                            row_values[4] = doc.href
                            out_f.write("\t".join(_sanitize(value) for value in row_values) + "\n")
                            file_links += 1

                    total_announcements += len(announcements)
                    total_links += file_links

                except Exception as e:
                    tqdm.write(f"Error processing {html_file.name}: {e}")
                    continue

        print(f"Link extraction completed: {total_announcements} announcements, {total_links} links")
        print(f"Output: {output_file}")

        return str(output_file)


    def _extract_links_from_html(self, html_file_path, source_spec=None, base_url=None):
        """
        単一のHTMLファイルから公告リンクを抽出

        マトリックス形式(日付×カテゴリ)と通常形式を自動判定し、
        適切に公告を分離する。

        マトリックス形式の例:
        | 公告日    | 工事       | 業務    |
        |-----------|-----------|---------|
        | R7.3.20   | [A][B]    | [C]     |
        → 3つの公告に分離: 工事(A,B), 業務(C)

        通常形式の例:
        | 件名 | 期限 | 資料 |
        |------|------|------|
        | 工事A | 3/20 | [pdf] |
        → 1つの公告: 工事A
        """
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        soup = BeautifulSoup(html_content, "lxml")

        notices: list[StructuredNotice] = []
        field_rules = merge_field_rules(
            DEFAULT_FIELD_RULES,
            getattr(source_spec, "field_rules", None),
        )

        table_specs = infer_table_specs(soup, helper=self, source_spec=source_spec)
        for spec in table_specs:
            if spec.pattern == "matrix":
                table_notices = self._extract_matrix_announcements(
                    spec.table,
                    source_spec=source_spec,
                    base_url=base_url,
                    heading_text=spec.heading_text,
                    field_rules=field_rules,
                )
            else:
                table_notices = self._extract_row_announcements(
                    spec.table,
                    source_spec=source_spec,
                    base_url=base_url,
                    heading_text=spec.heading_text,
                    field_rules=field_rules,
                )
            notices.extend(table_notices)

        return notices


    def _get_direct_rows(self, table):
        """
        テーブルの直接の子要素である<tr>を取得（入れ子テーブルの<tr>を除外）

        <table>
          <tr>...</tr>  ← これを取得
          <thead><tr>...</tr></thead>  ← これも取得
          <tbody>
            <tr>...</tr>  ← これも取得
            <tr><td><table><tr>...</tr></table></td></tr>  ← 内側の<tr>は除外
          </tbody>
        </table>

        Args:
            table: BeautifulSoupのTableタグ

        Returns:
            list: 直接の子要素である<tr>タグのリスト
        """
        rows = []
        # table直下の<tr>を取得
        for tr in table.find_all('tr'):
            # この<tr>の親<table>が引数のtableと同じか確認
            parent_table = tr.find_parent('table')
            if parent_table == table:
                rows.append(tr)
        return rows


    def _resolve_row_table_structure(self, table):
        rows = self._get_direct_rows(table)
        if not rows:
            return [], []
        header_row = None
        data_start_index = 0
        for idx, row in enumerate(rows):
            th_cells = row.find_all('th', recursive=False)
            if not th_cells:
                continue

            first_header_text = normalize_space(th_cells[0].get_text(" ", strip=True))
            row_cells = row.find_all(['th', 'td'], recursive=False)
            row_has_data_td = any(cell.name == 'td' for cell in row_cells)

            # Some tables (e.g. 公募ページ) use <th> for the day column while
            # mixing actual data in the same row. Treat those as data rows.
            if row_has_data_td and self._looks_like_date_value(first_header_text):
                continue

            header_row = row
            data_start_index = idx + 1
            break

        if header_row is None:
            first_row_cells = rows[0].find_all(['th', 'td'], recursive=False)
            column_count = len(first_row_cells) or 1
            headers = [f"column_{idx + 1}" for idx in range(column_count)]
            data_rows = [row for row in rows if row.find_all('td')]
            return headers, data_rows
        headers = [
            normalize_space(cell.get_text(" ", strip=True))
            for cell in header_row.find_all(['th', 'td'], recursive=False)
        ]
        data_rows = [
            row for row in rows[data_start_index:]
            if row.find_all('td')
        ]
        return headers, data_rows


    def _get_links_in_same_table(self, table, element):
        """
        指定要素配下のリンクを取得する。
        入れ子tableは親table処理時にまとめるのでそのまま取得する。
        """
        links = []
        for link in element.find_all('a', href=True):
            parent_table = link.find_parent('table')
            if parent_table == table:
                links.append(link)
        return links


    def _build_notice_documents(self, table, element, *, base_url=None, source_label=None):
        docs: list[NoticeDocument] = []
        for link in self._get_links_in_same_table(table, element):
            href = link.get('href', '').strip()
            if not href or not FILE_LINK_PATTERN.search(href):
                continue
            label = clean_document_label(link.get_text(" ", strip=True))
            if not label:
                label = clean_document_label(element.get_text(" ", strip=True))
            full_url = urljoin(base_url, href) if base_url else href
            docs.append(
                NoticeDocument(
                    label=label or href,
                    href=full_url,
                    source_label=source_label,
                )
            )
        return docs


    def _get_source_spec_for_file(self, html_file_path):
        from packages.engine.sources import find_source_spec, find_source_spec_from_db

        stem = Path(html_file_path).stem
        parts = stem.split("_", 2)
        top_agency = None
        sub_agency = None
        if len(parts) >= 3:
            top_agency = parts[1]
            sub_agency = parts[2]

        page_code = None
        source_url = None
        meta_path = Path(html_file_path).with_suffix(".meta.json")
        if meta_path.exists():
            try:
                metadata = json.loads(meta_path.read_text(encoding="utf-8"))
                page_code = metadata.get("page_code") or page_code
                source_url = metadata.get("source_url")
                top_agency = metadata.get("top_agency_name") or top_agency
                sub_agency = metadata.get("sub_agency_name") or sub_agency
            except Exception as exc:
                print(f"[WARN] Failed to read metadata for {html_file_path}: {exc}")

        prefer_db = bool(int(os.environ.get("SOURCE_SPEC_PREFER_DB", "1") or "1"))
        db_operator = getattr(self, "db_operator", None)

        if prefer_db and db_operator:
            try:
                db_operator.ensure_source_pages_table()
                spec = find_source_spec_from_db(
                    db_operator,
                    page_code=page_code,
                    top_agency=top_agency,
                    sub_agency=sub_agency,
                    source_url=source_url,
                )
                if spec:
                    return spec
            except Exception as exc:
                print(f"[WARN] Failed to load SourceSpec from DB: {exc}")

        spec = find_source_spec(
            top_agency=top_agency,
            sub_agency=sub_agency,
            page_code=page_code,
            source_url=source_url,
        )
        if spec:
            return spec
        return None


    def _get_structured_page_override(self, source_spec):
        if not source_spec:
            return {}
        behavior = getattr(source_spec, "page_behavior_json", None)
        if not isinstance(behavior, dict):
            return {}
        override = behavior.get("structured_page_override")
        if isinstance(override, dict):
            return override
        return {}


    def _find_matrix_header_row(self, rows, source_spec=None):
        header_keywords = tuple(source_spec.matrix_header_keywords) if source_spec else ()
        for idx, row in enumerate(rows):
            headers = row.find_all(['th', 'td'], recursive=False)
            if len(headers) < 3:
                continue
            label = headers[0].get_text(strip=True)
            normalized = label.replace(' ', '').replace('　', '')
            if header_keywords:
                if any(keyword in normalized for keyword in header_keywords):
                    return idx
            elif self._looks_like_date_label(label):
                return idx
        if source_spec and source_spec.force_matrix and rows:
            return 0
        return None


    def _is_matrix_table(self, table, source_spec=None):
        """
        日付×カテゴリのマトリックス形式かどうかを判定

        判定基準:
        1. ヘッダー行が存在
        2. 1列目が日付ラベル(「公告日」「掲載日」など)
        3. データ行の1列目が日付値
        4. 2列目以降の複数セルにリンクがある

        Args:
            table: BeautifulSoupのTableタグ

        Returns:
            bool: マトリックス形式ならTrue
        """
        rows = self._get_direct_rows(table)
        if len(rows) < 2:
            return False

        header_row_index = self._find_matrix_header_row(rows, source_spec=source_spec)
        if header_row_index is None:
            return False
        headers = rows[header_row_index].find_all(['th', 'td'], recursive=False)
        if len(headers) < 3:
            return False

        data_rows = rows[header_row_index + 1:]
        if not data_rows:
            return False

        sample_rows = data_rows if (source_spec and source_spec.force_matrix) else data_rows[: min(20, len(data_rows))]

        date_value_count = 0
        multi_cell_link_rows = 0
        multi_link_cells = 0

        for row in sample_rows:
            cells = row.find_all(['th', 'td'], recursive=False)
            if len(cells) < 2:
                continue

            # 1列目が日付値か
            first_cell_text = cells[0].get_text(strip=True)
            if self._looks_like_date_value(first_cell_text):
                date_value_count += 1

            # 2列目以降で、2つ以上のセルにリンクがあるか
            later_cells = cells[1:]
            cells_with_links = sum(1 for cell in later_cells if cell.find('a', href=True))
            if cells_with_links >= 2:
                multi_cell_link_rows += 1
            if any(len(cell.find_all('a', href=True)) >= 2 for cell in later_cells):
                multi_link_cells += 1

        if source_spec and source_spec.force_matrix:
            return date_value_count >= 1

        if date_value_count >= 1 and (multi_cell_link_rows >= 1 or multi_link_cells >= 1):
            return True
        return False


    def _looks_like_date_label(self, text):
        """
        日付フィールドのラベルっぽいか

        Args:
            text: セルのテキスト

        Returns:
            bool: 日付ラベルならTrue
        """
        date_labels = ['公告日', '公示日', '掲載日', '発注日', '日付', '年月日', '掲載年月日']
        normalized = text.replace(' ', '').replace('　', '')
        return any(label in normalized for label in date_labels)


    def _looks_like_date_value(self, text):
        """
        日付の値っぽいか

        Args:
            text: セルのテキスト

        Returns:
            bool: 日付値ならTrue
        """
        if not text or len(text) > 30:
            return False

        normalized = normalize_space(text)
        if parse_japanese_date(normalized):
            return True

        text = normalized

        # 和暦・西暦のパターン
        date_patterns = [
            r'令和\d+年',
            r'平成\d+年',
            r'R\d+[./-]\d+[./-]\d+',
            r'H\d+[./-]\d+[./-]\d+',
            r'\d{4}[./-]\d{1,2}[./-]\d{1,2}',
            r'\d{1,2}月\d{1,2}日',
            r'\d{1,2}日',
            r'\d{1,2}\.\d{1,2}\.\d{1,2}',  # 7.4.22 などの簡略形式
            r'\d{1,2}/\d{1,2}/\d{1,2}',    # 7/4/22 などの簡略形式
        ]
        return any(re.fullmatch(pattern, text) for pattern in date_patterns)


    def _extract_matrix_announcements(
        self,
        table,
        *,
        source_spec=None,
        base_url=None,
        heading_text=None,
        field_rules=None,
    ):
        """
        マトリックス形式テーブルからセル単位で公告を抽出

        構造例:
        | 公告日    | 工事       | 業務    | 物品    |
        |-----------|-----------|---------|---------|
        | R7.3.20   | [A][B]    | [C]     | -       |
        | R7.3.21   | [D]       | [E][F]  | [G]     |

        抽出結果:
        - 工事A, 工事B (R7.3.20)
        - 業務C (R7.3.20)
        - 工事D (R7.3.21)
        - 業務E, 業務F (R7.3.21)
        - 物品G (R7.3.21)

        Args:
            table: BeautifulSoupのTableタグ

        Returns:
            list[tuple[str, list[tuple[str, str]]]]: [(announcement_name, [(link_text, href), ...]), ...]
        """
        rows = self._get_direct_rows(table)
        if not rows:
            return []

        header_row_index = self._find_matrix_header_row(rows, source_spec=source_spec)
        if header_row_index is None:
            header_row_index = 0

        headers = rows[header_row_index].find_all(['th', 'td'], recursive=False)
        header_texts = [h.get_text(strip=True) for h in headers]

        announcements: list[StructuredNotice] = []
        effective_rules = field_rules or DEFAULT_FIELD_RULES

        for row in rows[header_row_index + 1:]:
            cells = row.find_all(['th', 'td'], recursive=False)
            if len(cells) < 2:
                continue

            date_text = normalize_space(cells[0].get_text(" ", strip=True))

            for idx, cell in enumerate(cells[1:], start=1):
                docs = self._build_notice_documents(
                    table,
                    cell,
                    base_url=base_url,
                    source_label=header_texts[idx] if idx < len(header_texts) else heading_text,
                )
                if not docs:
                    continue

                category_name = header_texts[idx] if idx < len(header_texts) else heading_text or "不明"
                category_name = normalize_space(category_name)
                fields = {
                    "category": category_name,
                    "announced_at": date_text,
                }
                inferred_category = infer_category_from_fields(fields, fallback=category_name or heading_text)
                procurement_method = infer_procurement_method(fields, fallback=category_name)
                inferred_title = infer_notice_title(fields, effective_rules, docs)
                combined_doc_labels = " ".join(doc.label for doc in docs if doc.label)
                if len(docs) > 1 and (not inferred_title or inferred_title == docs[0].label):
                    inferred_title = combined_doc_labels or inferred_title
                title = inferred_title or combined_doc_labels or category_name or docs[0].label
                normalized_title = normalize_space(title)

                announcements.append(
                    StructuredNotice(
                        title=title,
                        normalized_title=normalized_title,
                        category_name=inferred_category,
                        category_code=slugify_identifier(inferred_category),
                        procurement_method=procurement_method,
                        announced_at=date_text or None,
                        deadline=None,
                        open_at=None,
                        location=None,
                        fields=fields,
                        documents=docs,
                        raw_html=str(cell),
                    )
                )

        return announcements


    def _extract_row_announcements(
        self,
        table,
        *,
        source_spec=None,
        base_url=None,
        heading_text=None,
        field_rules=None,
    ):
        """
        通常形式テーブルから1行=1公告で抽出

        既存ロジックと同じ挙動を維持

        Args:
            table: BeautifulSoupのTableタグ

        Returns:
            list[tuple[str, list[tuple[str, str]]]]: [(announcement_name, [(link_text, href), ...]), ...]
        """
        announcements: list[StructuredNotice] = []
        headers, data_rows = self._resolve_row_table_structure(table)
        if not headers or not data_rows:
            return announcements

        effective_rules = field_rules or DEFAULT_FIELD_RULES

        override_settings = self._get_structured_page_override(source_spec)
        split_by_list_items = bool(override_settings.get("split_by_list_items"))

        for row in data_rows:
            cells = row.find_all(['th', 'td'], recursive=False)
            if not cells:
                continue

            normalized_cells = cells[:len(headers)]
            fields: dict[str, str] = {}
            for idx, (header, cell) in enumerate(zip(headers, normalized_cells)):
                header_label = header or f"column_{idx+1}"
                value = normalize_space(cell.get_text(" ", strip=True))
                if value:
                    fields[header_label] = value
            if heading_text:
                fields.setdefault("section_heading", normalize_space(heading_text))

            documents: list[NoticeDocument] = []
            for header, cell in zip(headers, normalized_cells):
                documents.extend(
                    self._build_notice_documents(
                        table,
                        cell,
                        base_url=base_url,
                        source_label=header,
                    )
                )
            if not documents:
                continue

            announced_at = pick_field(fields, effective_rules.get("announced_at_labels", []))
            deadline = pick_field(fields, effective_rules.get("deadline_labels", []))
            open_at = pick_field(fields, effective_rules.get("open_at_labels", []))
            location = pick_field(fields, effective_rules.get("location_labels", []))
            category = infer_category_from_fields(fields, fallback=heading_text)
            procurement_method = infer_procurement_method(fields, fallback=category)
            category_code = slugify_identifier(category)

            if split_by_list_items:
                li_based_notices = self._extract_li_based_announcements(
                    row=row,
                    table=table,
                    fields=fields,
                    base_url=base_url,
                    effective_rules=effective_rules,
                    announced_at=announced_at,
                    deadline=deadline,
                    open_at=open_at,
                    location=location,
                    category=category,
                    category_code=category_code,
                    procurement_method=procurement_method,
                )
                if li_based_notices:
                    announcements.extend(li_based_notices)
                    continue

            title = infer_notice_title(fields, effective_rules, documents) or documents[0].label
            normalized_title = normalize_space(title)

            announcements.append(
                StructuredNotice(
                    title=title,
                    normalized_title=normalized_title,
                    category_name=category,
                    category_code=category_code,
                    procurement_method=procurement_method,
                    announced_at=announced_at,
                    deadline=deadline,
                    open_at=open_at,
                    location=location,
                    fields=fields,
                    documents=documents,
                    raw_html=str(row),
                )
            )

        return announcements


    def _extract_li_based_announcements(
        self,
        *,
        row,
        table,
        fields,
        base_url,
        effective_rules,
        announced_at,
        deadline,
        open_at,
        location,
        category,
        category_code,
        procurement_method,
    ):
        li_elements = row.find_all('li')
        if not li_elements:
            return []

        li_entries = []
        for li in li_elements:
            docs = self._build_notice_documents(
                table,
                li,
                base_url=base_url,
                source_label=None,
            )
            if docs:
                li_entries.append((li, docs))

        # 分割対象は同一セル内に複数公告があるケースのみ
        if len(li_entries) < 2:
            return []

        notices: list[StructuredNotice] = []
        for li, docs in li_entries:
            li_text = normalize_space(li.get_text(" ", strip=True))
            entry_fields = dict(fields)
            if li_text:
                entry_fields["list_entry"] = li_text

            title = infer_notice_title(entry_fields, effective_rules, docs) or li_text or docs[0].label
            normalized_title = normalize_space(title)

            notices.append(
                StructuredNotice(
                    title=title,
                    normalized_title=normalized_title,
                    category_name=category,
                    category_code=category_code,
                    procurement_method=procurement_method,
                    announced_at=announced_at,
                    deadline=deadline,
                    open_at=open_at,
                    location=location,
                    fields=entry_fields,
                    documents=docs,
                    raw_html=str(li),
                )
            )

        return notices


    def _step0_format_documents(
        self,
        input_list2_path,
        links_file,
        output_dir,
        output_base,
        timestamp,
        extracted_at,
        base_digits,
        no_merge,
        topAgencyName
    ):
        """
        ドキュメント情報をフォーマットし、DB用の新規レコードを生成
        """
        df1 = pd.read_csv(input_list2_path, sep="\t")
        df2 = pd.read_csv(links_file, sep="\t", quoting=csv.QUOTE_NONE)
        print(f"[DEBUG] Loaded {len(df1)} rows from input_list_converted.txt")
        print(f"[DEBUG] df1 columns: {df1.columns.tolist()}")
        print(f"[DEBUG] Loaded {len(df2)} rows from announcements_links.txt")
        metadata_columns = [
            "notice_category_name",
            "notice_category_code",
            "notice_procurement_method",
            "notice_announced_at",
            "notice_deadline",
            "notice_open_at",
            "notice_location",
            "notice_normalized_title",
            "notice_fields_json",
        ]
        for column in metadata_columns:
            if column not in df2.columns:
                df2[column] = None

        df2["announcement_name"] = df2["announcement_name"].str.replace('"', '', regex=False)
        df2["link_text"] = df2["link_text"].str.replace('"', '', regex=False)

        df2.insert(0, "index", df2["target_link"].str.split("_").str[0].astype(int))
        df2["adhoc_index"] = df2["target_link"].apply(lambda x: f"{int(x.split('_')[0]):05d}")
        print(f"[DEBUG] Extracted index values: {df2['index'].unique().tolist()}")

        df1_sub = df1[["index", "入札公告（現在募集中）2"]].copy() if "入札公告（現在募集中）2" in df1.columns else df1[["index"]].copy()

        def parent_url(url):
            if not isinstance(url, str) or not url.startswith("https://"):
                return None
            parsed = urlparse(url)
            parent_path = os.path.dirname(parsed.path)
            return f"{parsed.scheme}://{parsed.netloc}{parent_path}"

        if "入札公告（現在募集中）2" in df1_sub.columns:
            df1_sub["base_link_parent"] = df1_sub["入札公告（現在募集中）2"].apply(parent_url)
            df1_sub = df1_sub.rename(columns={"入札公告（現在募集中）2": "base_link"})
        else:
            df1_sub["base_link_parent"] = None
            df1_sub["base_link"] = None

        df_merged = df2.merge(df1_sub, on="index", how="left")
        print(f"[DEBUG] After merge: {len(df_merged)} rows")
        print(f"[DEBUG] Rows with base_link=None: {df_merged['base_link'].isna().sum()}")

        df_merged["pdf_full_url"] = df_merged.apply(
            lambda row: urljoin(row["base_link_parent"] + "/", row["pdf_link"])
            if row["base_link_parent"] is not None else row["pdf_link"],
            axis=1
        )

        df_merged["index"] = df_merged["index"] * 100000
        df_merged["announcement_id"] = df_merged["pre_announcement_id"] + df_merged["index"]

        save_path_list = []
        for i, row in df_merged.iterrows():
            index = row["adhoc_index"]
            pdfurl = row["pdf_full_url"]
            target_url = row["base_link_parent"]

            if pdfurl is None or pd.isna(pdfurl) or target_url is None or pd.isna(target_url):
                if pdfurl is not None and not pd.isna(pdfurl):
                    pname = pdfurl
                else:
                    pname = f"unknown_{i}"
            else:
                common = os.path.commonprefix([pdfurl, target_url])
                pname = pdfurl[len(common):]

            pname = pname[1:] if pname.startswith('/') else pname
            p = PurePosixPath(pname)
            no_ext = str(p.with_suffix(""))
            no_ext = no_ext.replace(".", "_").replace("\\", "_").replace("/", "_").replace(":", "_")
            pname2 = no_ext + p.suffix

            output_file_pdf = f"output/pdf/pdf_{index}/{index}_{pname2}"
            save_path = Path(output_file_pdf)
            save_path_list.append(save_path)

        df_merged["save_path"] = [p.as_posix() for p in save_path_list]
        df_merged["document_id"] = df_merged["save_path"].apply(lambda p: Path(p).stem)
        print(f"[DEBUG] Sample document_id values: {df_merged['document_id'].head(10).tolist()}")

        before_filter_count = len(df_merged)
        print(f"[DEBUG] Before https: filter: {before_filter_count} rows")
        print(f"[DEBUG] Sample pdf_full_url values: {df_merged['pdf_full_url'].head(10).tolist()}")
        df_merged = df_merged[df_merged["pdf_full_url"].str.startswith("https:", na=False)].copy()
        after_filter_count = len(df_merged)
        excluded_count = before_filter_count - after_filter_count
        if excluded_count > 0:
            print(f"[DEBUG] Excluded {excluded_count} records where pdf_full_url does not start with 'https:'")

        tmpdf2 = df_merged.duplicated(subset=["link_text", "announcement_id", "document_id"])
        df_merged["dup"] = tmpdf2

        ext = df_merged["pdf_full_url"].str.extract(r'\.([^.]+)$')[0].str.lower()
        df_new = pd.DataFrame({
            "announcement_id": df_merged["announcement_id"],
            "document_id": df_merged["document_id"],
            "type": [None] * df_merged.shape[0],
            "title": df_merged["link_text"],
            "fileFormat": ext.fillna(""),
            "pageCount": np.where(ext == "pdf", -1, -2).astype('int64'),
            "extractedAt": [extracted_at] * df_merged.shape[0],
            "url": df_merged["pdf_full_url"],
            "markdown_path": [None] * df_merged.shape[0],
            "ocr_json_path": [None] * df_merged.shape[0],
            "adhoc_index": df_merged["adhoc_index"],
            "base_link_parent": df_merged["base_link_parent"],
            "base_link": df_merged["base_link"],
            "dup": df_merged["dup"],
            "save_path": df_merged["save_path"],
            "pdf_is_saved": [None] * df_merged.shape[0],
            "pdf_is_saved_date": [None] * df_merged.shape[0],
            "file_404_flag": [False] * df_merged.shape[0],
            "orderer_id": [None] * df_merged.shape[0],
            "topAgencyName": [None] * df_merged.shape[0],
            "done": [False] * df_merged.shape[0],
            "is_ocr_failed": [False] * df_merged.shape[0]
        })
        for column in metadata_columns:
            if column in df_merged.columns:
                df_new[column] = df_merged[column]
            else:
                df_new[column] = None

        df_new["_sort_fileformat"] = df_new["fileFormat"].apply(lambda x: 0 if x == "pdf" else 1)
        df_new.sort_values(["announcement_id", "_sort_fileformat", "document_id"], inplace=True)
        df_new = df_new.drop(columns=["_sort_fileformat"])

        print(f"[DEBUG] df_new columns: {df_new.columns.tolist()}")

        existing_table = self.tablenamesconfig.bid_announcements_document_table
        print(f"[DEBUG] Before DB comparison: {len(df_new)} records (df_new)")

        if no_merge:
            print("\n--- no_merge flag is True: Skipping DB comparison ---")
            print(f"Treating all {len(df_new)} records as new (no_merge=True)")
            df_new_only = df_new.copy()
        else:
            print("\n--- DB-based merge processing ---")
            print(f"[DEBUG] df_new document_id sample: {df_new['document_id'].head(10).tolist()}")

            tmp_table = "tmp_new_announcements_document"
            print(f"Uploading {len(df_new)} records to temporary table: {tmp_table}")
            self.db_operator.uploadDataToTable(df_new, tmp_table, chunksize=5000)

            if self.db_operator.ifTableExists(existing_table):
                print(f"Comparing with existing table: {existing_table}")
                df_new_only = self._get_new_documents_from_db(tmp_table, existing_table)
                print(f"[DEBUG] Found {len(df_new_only)} new records (not in DB)")
                if len(df_new_only) > 0:
                    print(f"[DEBUG] New document_id sample: {df_new_only['document_id'].head(10).tolist()}")
            else:
                print(f"Table {existing_table} does not exist. All records are new.")
                df_new_only = df_new.copy()

            self.db_operator.dropTable(tmp_table)
            print(f"Dropped temporary table: {tmp_table}")

        if len(df_new_only) > 0:
            print(f"Renumbering announcement_id for {len(df_new_only)} new records...")
            table_for_renumber = None if no_merge else existing_table
            df_new_only = self._renumber_announcement_ids(df_new_only, table_for_renumber, base_digits)
            print(f"Renumbering completed")
        else:
            print("No new records to process. Skipping renumbering.")

        if len(df_new_only) > 0:
            print("Updating orderer_id and topAgencyName...")
            ord = df1[["Unnamed: 0", "Unnamed: 1", "入札公告（現在募集中）2"]].copy()
            ord["orderer_id"] = topAgencyName + ord["Unnamed: 0"].astype(str) + ord["Unnamed: 1"].astype(str)
            mapping = dict(zip(ord["入札公告（現在募集中）2"], ord["orderer_id"]))
            df_new_only["orderer_id"] = df_new_only["base_link"].map(mapping)
            df_new_only["topAgencyName"] = topAgencyName

        print(f"[DEBUG] df_new_only columns (before return): {df_new_only.columns.tolist()}")
        return df_new_only


    def _get_new_documents_from_db(self, tmp_table, existing_table):
        """
        一時テーブルと既存テーブルを document_id で比較し、新規レコードのみ取得
        """
        query = self.db_operator.build_new_documents_query(tmp_table, existing_table)
        return self.db_operator.any_query(query)


    def _renumber_announcement_ids(self, df_new, existing_table, base_digits):
        """
        adhoc_index グループごとに announcement_id を採番
        """
        if len(df_new) == 0:
            return df_new

        divisor = 10 ** base_digits

        df_new = df_new.copy()
        df_new["announcement_group"] = df_new["announcement_id"] // divisor

        max_id_map = {}
        if existing_table is not None and self.db_operator.ifTableExists(existing_table):
            query = self.db_operator.build_max_announcement_id_query(existing_table, divisor)
            df_max_ids = self.db_operator.any_query(query)
            if len(df_max_ids) > 0:
                max_id_map = dict(zip(df_max_ids['announcement_group'], df_max_ids['max_id']))

        result_list = []

        for group in df_new["announcement_group"].unique():
            df_group = df_new[df_new["announcement_group"] == group].copy()

            group_max_id = max_id_map.get(group, group * divisor)
            new_id_counter = group_max_id

            unique_old_ids = sorted(df_group["announcement_id"].unique())
            id_map = {}
            for old_id in unique_old_ids:
                new_id_counter += 1
                id_map[old_id] = new_id_counter

            df_group["announcement_id"] = df_group["announcement_id"].map(id_map)
            result_list.append(df_group)

        df_result = pd.concat(result_list, ignore_index=True)
        df_result = df_result.drop(columns=["announcement_group"])

        return df_result


    def _save_to_announcements_document_table(self, df):
        """
        announcements_document_table に DataFrame を保存
        """
        tablename = self.tablenamesconfig.bid_announcements_document_table

        if len(df) == 0:
            print("No new records to save.")
            return

        df = df.copy()
        if 'pageCount' in df.columns:
            df['pageCount'] = pd.to_numeric(df['pageCount'], errors='coerce').fillna(-2).astype('int64')
        if 'adhoc_index' in df.columns:
            df['adhoc_index'] = pd.to_numeric(df['adhoc_index'], errors='coerce').fillna(0).astype('int64')
        if 'announcement_id' in df.columns:
            df['announcement_id'] = pd.to_numeric(df['announcement_id'], errors='coerce').fillna(0).astype('int64')

        text_column_type = self.db_operator.get_text_column_type()
        bool_column_type = self.db_operator.get_bool_column_type()

        if not self.db_operator.ifTableExists(tablename):
            print(f"Creating new table: {tablename}")
            self.db_operator.uploadDataToTable(df, tablename, chunksize=5000)
            print(f"Created {tablename} with {len(df)} records")
        else:
            self.db_operator.ensure_column(tablename, "ocr_json_path", text_column_type)
            self.db_operator.ensure_column(tablename, "file_404_flag", bool_column_type)
            for column in [
                "notice_category_name",
                "notice_category_code",
                "notice_procurement_method",
                "notice_announced_at",
                "notice_deadline",
                "notice_open_at",
                "notice_location",
                "notice_normalized_title",
                "notice_fields_json",
            ]:
                self.db_operator.ensure_column(tablename, column, text_column_type)
            print(f"Merging {len(df)} records into existing table: {tablename}")
            tmp_table = f"tmp_{tablename}_final"
            self.db_operator.uploadDataToTable(df, tmp_table, chunksize=5000)
            affected_rows = self.db_operator.mergeAnnouncementsDocumentTable(
                target_tablename=tablename,
                source_tablename=tmp_table,
                columns=df.columns.tolist()
            )
            self.db_operator.dropTable(tmp_table)
            print(f"Merged: {affected_rows} rows inserted")


    def _save_to_bid_announcements(self, df):
        """
        bid_announcements に DataFrame を保存（MERGE: INSERT if not exists）
        """
        tablename = self.tablenamesconfig.bid_announcements

        if len(df) == 0:
            print("No announcements to save.")
            return

        df = df.copy()
        if 'announcement_no' in df.columns:
            df['announcement_no'] = pd.to_numeric(df['announcement_no'], errors='coerce').fillna(0).astype('int64')

        if not self.db_operator.ifTableExists(tablename):
            print(f"Creating new table: {tablename}")
            self.db_operator.createBidAnnouncementsV2(tablename)

        print(f"Merging {len(df)} announcements into {tablename}...")
        tmp_table = f"tmp_{tablename}_ocr"
        self.db_operator.uploadDataToTable(df, tmp_table, chunksize=5000)
        affected_rows = self.db_operator.mergeBidAnnouncements(
            target_tablename=tablename,
            source_tablename=tmp_table
        )
        self.db_operator.dropTable(tmp_table)
        print(f"Merged: {affected_rows} rows inserted")


    def _save_to_bid_requirements(self, df):
        """
        bid_requirements に DataFrame を保存（requirement_no を採番してMERGE）
        """
        tablename = self.tablenamesconfig.bid_requirements

        if len(df) == 0:
            print("No requirements to save.")
            return

        if not self.db_operator.ifTableExists(tablename):
            self.db_operator.createBidRequirements(tablename)
            print(f"Created new table: {tablename}")
            start_requirement_no = 1
        else:
            max_requirement_no = self.db_operator.getMaxOfColumn(tablename, 'requirement_no')
            if max_requirement_no.iloc[0, 0] is None or pd.isna(max_requirement_no.iloc[0, 0]):
                start_requirement_no = 1
            else:
                start_requirement_no = max_requirement_no.iloc[0, 0] + 1

        df = df.copy()
        df['requirement_no'] = range(start_requirement_no, start_requirement_no + len(df))
        df['requirement_no'] = df['requirement_no'].astype('int64')
        df['announcement_no'] = df['announcement_no'].astype('int64')

        print(f"Merging {len(df)} requirements into {tablename}...")
        tmp_table = 'tmp_bid_requirements_ocr'
        self.db_operator.uploadDataToTable(df, tmp_table, chunksize=5000)
        affected_rows = self.db_operator.mergeRequirements(tablename, tmp_table)
        self.db_operator.dropTable(tmp_table)
        print(f"Merged: {affected_rows} rows inserted")
