from pathlib import Path
from pathlib import PurePosixPath
import glob
import os
import time
import warnings
warnings.simplefilter(action="ignore", category=FutureWarning)
import argparse
from tqdm import tqdm
import requests
from bs4 import BeautifulSoup, Comment, Doctype
import pandas as pd
import numpy as np
from ftfy import fix_encoding
from ftfy.badness import badness
from pypdf import PdfReader
import pdfplumber
import json
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor
import re
import subprocess
import pdf2image  # Need sudo apt install poppler-utils
import pytesseract
from collections import Counter
# Need
# sudo apt install tesseract-ocr
# sudo apt install tesseract-ocr-jpn
import platform
from multiprocessing import Pool, cpu_count
import io
import fitz

# GCS support
try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

new_path = r"C:\Program Files\Tesseract-OCR"
if 'PATH' in os.environ:
    os.environ['PATH'] = new_path + os.pathsep + os.environ['PATH']


# GCS helper functions
def parse_gcs_path(gcs_path):
    """Parse gs://bucket/path into (bucket, path)"""
    if not gcs_path.startswith("gs://"):
        return None, None
    parts = gcs_path[5:].split("/", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return parts[0], ""


def gcs_exists(gcs_path):
    """Check if GCS object exists"""
    if not GCS_AVAILABLE:
        return False
    bucket_name, blob_name = parse_gcs_path(gcs_path)
    if not bucket_name or not blob_name:
        return False
    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        return blob.exists()
    except Exception:
        return False


def gcs_upload_from_bytes(gcs_path, data):
    """Upload bytes to GCS"""
    if not GCS_AVAILABLE:
        raise RuntimeError("google-cloud-storage not installed")
    bucket_name, blob_name = parse_gcs_path(gcs_path)
    if not bucket_name or not blob_name:
        raise ValueError(f"Invalid GCS path: {gcs_path}")
    client = storage.Client()
    bucket = client.bucket(bucket_name)

    # Create bucket if it doesn't exist
    if not bucket.exists():
        bucket.create()
        print(f"Created GCS bucket: {bucket_name}")

    blob = bucket.blob(blob_name)
    blob.upload_from_string(data)


def gcs_download_as_bytes(gcs_path):
    """Download GCS object as bytes"""
    if not GCS_AVAILABLE:
        raise RuntimeError("google-cloud-storage not installed")
    bucket_name, blob_name = parse_gcs_path(gcs_path)
    if not bucket_name or not blob_name:
        raise ValueError(f"Invalid GCS path: {gcs_path}")
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    return blob.download_as_bytes()


def list_gcs_files_in_prefix(gcs_prefix):
    """List all files under a GCS prefix and return as a set of full paths"""
    if not GCS_AVAILABLE:
        return set()
    bucket_name, prefix = parse_gcs_path(gcs_prefix)
    if not bucket_name:
        return set()

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blobs = bucket.list_blobs(prefix=prefix)

    # Return full gs:// paths as a set for O(1) lookup
    return {f"gs://{bucket_name}/{blob.name}" for blob in blobs}


def read_text_file(file_path, encoding="utf-8"):
    """Read text file from local or GCS"""
    if file_path.startswith("gs://"):
        data = gcs_download_as_bytes(file_path)
        return data.decode(encoding)
    else:
        with open(file_path, "r", encoding=encoding) as f:
            return f.read()


def file_exists(file_path):
    """Check if file exists (local or GCS)"""
    if file_path.startswith("gs://"):
        return gcs_exists(file_path)
    else:
        return os.path.exists(file_path)


def open_file_from_document_id(document_id, remove_sakura=False):
    # document_id <- "00001_2025_0422a"
    adhoc_index = document_id.split("_")[0]
    if not remove_sakura:
        sakura = "C:/Program Files (x86)/sakura/sakura.exe"
        path_txt = fr"C:/Users/TA/Desktop/work/github/judgesystem/source/check_html/use_claude/4_get_documents/output_v3/pdf_txt_all_py/pdf_{adhoc_index}/{document_id}.txt"

        subprocess.Popen([
            sakura,
            path_txt
        ])

    chrome_path = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
    path_pdf = fr"C:/Users/TA/Desktop/work/github/judgesystem/source/check_html/use_claude/4_get_documents/output_v3/pdf/pdf_{adhoc_index}/{document_id}.pdf"
    
    subprocess.Popen([
        chrome_path,
        path_pdf
    ])


def get_pages(path):
    # path = modify_path(path)
    # path = '../4_get_documents/output_v3/pdf/pdf_00018/00018_opencounter_380-0417-009-oc-2_1.pdf'
    if not path.lower().endswith(".pdf"):
        return -2

    #if previous_result != -1:
    #    return path, previous_result

    try:
        if path.startswith("gs://"):
            # GCS path - download to memory
            pdf_bytes = gcs_download_as_bytes(path)
            if True:
                with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                    return doc.page_count
            else:
                with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf: 
                    return len(pdf.pages)
        else:
            # Local path
            if True:
                with fitz.open(path) as doc:
                    return doc.page_count
            else:
                with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf: 
                    return len(pdf.pages)
    except Exception:
        return -2


def pdf_to_txt(save_path, use_tesseract=False):
    # pdf_path = row["save_path"]
    import io
    import tempfile

    pdf_path = save_path
    output_path = pdf_path.replace("/pdf/", "/pdf_txt_all_py/")

    base, ext = os.path.splitext(output_path)
    output_path = base + ".txt"

    is_gcs_pdf = pdf_path.startswith("gs://")
    is_gcs_output = output_path.startswith("gs://")

    # Create output directory for local paths
    if not is_gcs_output:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Check if PDF exists
    if is_gcs_pdf:
        if not gcs_exists(pdf_path):
            return "pdf無し"
    else:
        if not os.path.exists(pdf_path):
            return "pdf無し"

    # Check if output already exists
    if is_gcs_output:
        if gcs_exists(output_path):
            return "出力済み"
    else:
        if os.path.exists(output_path):
            return "出力済み"

    if not pdf_path.lower().endswith(".pdf"):
        return "拡張子がpdfでは無い"

    # テキスト抽出
    try:
        texts = ""

        # Download PDF if GCS
        if is_gcs_pdf:
            pdf_bytes = gcs_download_as_bytes(pdf_path)
            pdf_file = io.BytesIO(pdf_bytes)
        else:
            pdf_file = pdf_path

        with pdfplumber.open(pdf_file) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    texts = texts + text + "\n"

        if texts == "" and use_tesseract:
            # Tesseract needs local file
            if is_gcs_pdf:
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(pdf_bytes)
                    tmp_path = tmp.name
            else:
                tmp_path = pdf_path

            if platform.system() == "Windows":
                path_to_tesseract = r"tesseract.exe"
                pytesseract.tesseract_cmd = path_to_tesseract

            pages = pdf2image.convert_from_path(tmp_path)
            texts = "THIS TEXT IS EXTRACTED BY TESSERACT\n"
            for page in pages:
                texts += pytesseract.image_to_string(page, lang="jpn")

            if is_gcs_pdf:
                os.unlink(tmp_path)

        # Write output
        if texts != "":
            if is_gcs_output:
                gcs_upload_from_bytes(output_path, texts.encode("utf-8"))
            else:
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(texts)

        return "テキスト抽出:ファイル出力終了"
    except Exception as e:
        return f"テキスト抽出:エラー: {e}"

def pdf_to_txt_without_tesseract(save_path):
    return pdf_to_txt(save_path, use_tesseract=False)

def pdf_to_txt_with_tesseract(save_path):
    return pdf_to_txt(save_path, use_tesseract=True)


def parse_reiwa_date(s):
    s = s.replace("元","1")
    m = re.search(r"令和([0-9０-９]+)年([0-9０-９]+)月([0-9０-９]+)日", s)
    if not m:
        return None

    try:
        # 全角→半角
        year = int(m.group(1).translate(str.maketrans("０１２３４５６７８９", "0123456789")))
        month = int(m.group(2).translate(str.maketrans("０１２３４５６７８９", "0123456789")))
        day = int(m.group(3).translate(str.maketrans("０１２３４５６７８９", "0123456789")))

        # 令和1年 = 2019年
        year = 2018 + year

        return datetime(year, month, day)
    except Exception as e:
        return None

    if False:
        for s in matches_list:
            s = s.replace("元","1")
            m = re.search(r"令和([0-9０-９]+)年([0-9０-９]+)月([0-9０-９]+)日", s)

            if not m:
                continue

            # 全角→半角
            year = int(m.group(1).translate(str.maketrans("０１２３４５６７８９", "0123456789")))
            month = int(m.group(2).translate(str.maketrans("０１２３４５６７８９", "0123456789")))
            day = int(m.group(3).translate(str.maketrans("０１２３４５６７８９", "0123456789")))

            # 令和1年 = 2019年
            year = 2018 + year


def process_row(row):
    # pdf_path = row["save_path"]
    pdf_path = row

    # output_path = row["fs_txt"]
    output_path = pdf_path.replace("/pdf/","/pdf_txt_all_py/")
    base, ext = os.path.splitext(output_path)
    output_path = base + ".txt"

    # ファイル存在チェック
    if not os.path.exists(pdf_path):
        return {"type": "ファイル無し(pdf)", "from": "ファイル無し(pdf)", "line": -1}

    if not os.path.exists(output_path):
        return {"type": "ファイル無し(txt)", "from": "ファイル無し(txt)", "line": -1}

    # テキスト読み込み
    with open(output_path, encoding="utf-8", errors="ignore") as f:
        tex4 = f.readlines()

    head10 = [x.strip() for x in tex4[:20] if x.strip() != ""]

    # ---------------------------------------------------------
    # 1. grepwords_list（行ごとに grep）
    # ---------------------------------------------------------
    grepwords_list = [
        (["公募"], "公募"),
        (["一般競争入札"], "一般競争入札"),
        (["指名停止措置"], "指名停止措置")
    ]

    for patterns, label in grepwords_list:
        result = [all(re.search(p, xx) for p in patterns) for xx in head10]
        if any(result):
            #print({"type": label, "from": "head20_1", "line": result.index(True) + 1})
            return {"type": label, "from": "head20_1", "line": result.index(True) + 1}

    # ---------------------------------------------------------
    # 2. keystrlists（== で一致）
    # ---------------------------------------------------------
    keystrlists = [
        (["入札公告"], "入札公告"),
        (["変更公告", "注意事項公告", "訂正公告", "再公告"], "変更公告/注意事項公告/訂正公告/再公告"),
        (["入札公告の中止", "中止公告"], "入札公告の中止/中止公告"),
        (["企画競争実施の公示"], "企画競争実施の公示"),
        (["企画競争に係る手続開始の公示", "企画競争に係る手続き開始の公示"], "企画競争に係る手続開始の公示"),
        (["競争参加者の資格に関する公示"], "競争参加者の資格に関する公示"),
        (["見積書"], "見積書"),
        (["見積依頼", "見積依頼書"], "見積依頼(書)"),
        (["品目等内訳書"], "品目等内訳書"),
        (["市場調査内訳書"], "市場調査内訳書"),
        (["入札書"], "入札書"),
        (["入札結果", "入札の結果", "入札等の結果"], "入札結果"),
        (["公告結果"], "公告結果"),
        (["競争入札の結果"], "競争入札の結果"),
        (["仕様書", "仕様書番号"], "仕様書(番号)"),
        (["情報・提案要求書"], "情報・提案要求書"),
        (["業者の選定"], "業者の選定"),
        (["公告"], "公告"),
        (["公示"], "公示"),
        (["中止公示"], "中止公示")
    ]

    for patterns, label in keystrlists:
        for i, line in enumerate(head10):
            line = line.replace(" ","")
            if line in patterns:
                #print({"type": label, "from": "head20_2", "line": i + 1})
                return {"type": label, "from": "head20_2", "line": i + 1}

    # ---------------------------------------------------------
    # 3. grepwords_list（複数パターンを grep）
    # ---------------------------------------------------------
    grepwords_list2 = [
        (["^市場価格調査依頼|市場価格調査依頼$"], "市場価格調査依頼"),
        (["オープンカウンター方式", "見積依頼"], "オープンカウンター方式/見積依頼"),
        (["オープンカウンター方式", "見積り依頼"], "オープンカウンター方式/見積依頼"),
        (["入札公告\\(+.\\)"], "入札公告(+.)"),
        (["入札結果\\(+.\\)"], "入札結果(+.)"),
        (["^仕様書|仕様書$"], "仕様書"),
        (["発注予定"], "発注予定"),
        (["一般条項$"], "一般条項$"),
        (["特約条項$"], "特約条項$"),
        (["規格書$"], "規格書$"),
        (["入札及び契約心得$"], "入札及び契約心得$"),
        (["情報・提案要求書$"], "情報・提案要求書$")
    ]

    for patterns, label in grepwords_list2:
        result = [all(re.search(p, xx) for p in patterns) for xx in head10]
        if any(result):
            return {"type": label, "from": "head20_3", "line": result.index(True) + 1}

    # ---------------------------------------------------------
    # 4. 空行でブロック化して連結
    # ---------------------------------------------------------
    blocks = []
    current = []

    for line in head10:
        if line == "":
            if current:
                blocks.append("".join(current))
                current = []
        else:
            current.append(line)

    if current:
        blocks.append("".join(current))

    # ---------------------------------------------------------
    # 5. ブロックに対して grep
    # ---------------------------------------------------------
    grepwords3 = [
        "業者の選定について$",
        "業者の募集について$"
    ]

    for pattern in grepwords3:
        for i, block in enumerate(blocks):
            if re.search(pattern, block):
                return {"type": pattern, "from": "head20_4", "line": i + 1}

    # ---------------------------------------------------------
    # 6. その他
    # ---------------------------------------------------------
    return {"type": "その他", "from": "head20[1]", "line": 1}


# ---------------------------------------------------------
# 並列実行部分
# ---------------------------------------------------------
def run_parallel(df):
    # rows = [dict(row) for _, row in df.iterrows()]  # pandas DataFrame → list of dict
    # rows = list(zip(df["fs"].tolist(), df["fs_txt"].tolist()))
    rows = df["save_path"].tolist()

    n_workers = min(8, cpu_count())

    #with Pool(n_workers) as pool:
    #    results = pool.map(process_row, rows)
    with Pool(n_workers) as pool:
        results = []
        # imap_unordered もあるが入力と結果の順序が保持されない。
        for r in tqdm(pool.imap(process_row, rows), total=len(rows)):
            results.append(r)

    return results



if __name__ == "__main__":

    today_str = datetime.now().strftime("%Y-%m-%d")

    parser = argparse.ArgumentParser(description="")
    parser.add_argument("--input_file1",
                       default=None,
                       help="Input file path. If not specified, uses latest *_merged.txt from ../3_source_formatting/output/<latest_timestamp>/")
    parser.add_argument("--input_dir",
                       default="../3_source_formatting/output",
                       help="Directory to search for latest input file when --input_file1 is not specified")
    parser.add_argument("--do_url_requests", action="store_true")
    parser.add_argument("--do_pdf_is_saved", action="store_true")
    parser.add_argument("--do_pagecount", action="store_true")
    parser.add_argument("--do_output", action="store_true")
    parser.add_argument("--do_pdf2txt", action="store_true")
    parser.add_argument("--use_tesseract", action="store_true")
    parser.add_argument("--do_bidtypecheck", action="store_true")
    parser.add_argument("--do_datesimplecheck", action="store_true")
    parser.add_argument("--do_categorysimplecheck", action="store_true")
    parser.add_argument("--stop_processing", action="store_true")
    parser.add_argument("--gcp_vm", action="store_true", default=True,
                       help="Use GCS paths (gs://) instead of local paths (default: True)")
    parser.add_argument(
        "--no_gcp_vm",
        dest="gcp_vm",
        action="store_false",
        help="Use local paths instead of GCS paths"
    )
    parser.set_defaults(gcp_vm=True)
    args = parser.parse_args()

    # スクリプトのディレクトリを取得（相対パスを解決するため）
    script_dir = Path(__file__).parent

    # 入力ファイルの決定（指定がない場合は最新ファイルを自動選択）
    if args.input_file1 is None:
        input_dir = Path(args.input_dir)
        if not input_dir.is_absolute():
            input_dir = script_dir / input_dir

        if not input_dir.exists():
            raise FileNotFoundError(f"Input directory not found: {input_dir}")

        # yyyymmddhhmm 形式のディレクトリを探す
        all_dirs = [d for d in input_dir.iterdir() if d.is_dir() and d.name.isdigit()]

        if not all_dirs:
            raise FileNotFoundError(f"No timestamp directories found in {input_dir}")

        # 最新のディレクトリを取得（ディレクトリ名でソート）
        latest_dir = sorted(all_dirs, reverse=True)[0]

        # そのディレクトリ内のファイルを優先順位で探す
        # 優先順位1: _merged_updated.txt
        pattern_merged_updated = "announcements_document_*_merged_updated.txt"
        matching_files = sorted(latest_dir.glob(pattern_merged_updated), key=lambda p: p.stat().st_mtime, reverse=True)

        if not matching_files:
            # 優先順位2: _merged.txt
            pattern_merged = "announcements_document_*_merged.txt"
            matching_files = sorted(latest_dir.glob(pattern_merged), key=lambda p: p.stat().st_mtime, reverse=True)

        if not matching_files:
            # 優先順位3: その他の announcements_document_*.txt
            pattern = "announcements_document_*.txt"
            matching_files = sorted(latest_dir.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
            # _merged.txt と _merged_updated.txt を除外
            matching_files = [f for f in matching_files if not (f.name.endswith("_merged.txt") or f.name.endswith("_merged_updated.txt"))]

        if not matching_files:
            raise FileNotFoundError(f"No announcements_document file found in {latest_dir}")

        input_file1 = str(matching_files[0])
        print(f"Using latest input file: {input_file1}")
    else:
        input_file1 = args.input_file1

    # 出力ファイルは入力ファイルと同じ（上書き）
    output_file1 = input_file1
    type_df_output_file = input_file1.replace(".txt","_type_df.txt")
    date_df_output_file = input_file1.replace(".txt","_date_df.txt")

    do_url_requests = args.do_url_requests
    do_pdf_is_saved = args.do_pdf_is_saved
    do_pagecount = args.do_pagecount
    do_output = args.do_output
    do_pdf2txt = args.do_pdf2txt
    use_tesseract = args.use_tesseract
    do_bidtypecheck = args.do_bidtypecheck
    do_datesimplecheck = args.do_datesimplecheck
    do_categorysimplecheck = args.do_categorysimplecheck

    stop_processing = args.stop_processing
    gcp_vm = args.gcp_vm

    if use_tesseract:
        pdf_to_txt_actual = pdf_to_txt_with_tesseract
    else:
        pdf_to_txt_actual = pdf_to_txt_without_tesseract


    pdf_requests_skip_urls = [
        "https://www.mod.go.jp/gsdf/wae/info/",
        "https://www.mod.go.jp/gsdf/nae/fin/nafin",
        "https://www.mod.go.jp/gsdf/neae/koukoku"
    ]
    pdf_requests_skip_urls = ["dummy"]

    df = pd.read_csv(input_file1, sep="\t")

    baseinfofile = Path("../1_source2_just_extract_html_source/data/リスト_防衛省入札_2.txt")
    if not baseinfofile.is_absolute():
        baseinfofile = script_dir / baseinfofile

    if not baseinfofile.exists():
        raise FileNotFoundError(f"Base info file not found: {baseinfofile}")

    baseinfo = pd.read_csv(baseinfofile, sep="\t")

    if stop_processing:
        exit(1)

    # GCP VM環境の場合、save_pathをGCSパスに変換
    if gcp_vm:
        df["save_path"] = df["save_path"].apply(
            lambda x: x.replace("output_v3/pdf/", "gs://ann-files/pdf/") if pd.notna(x) else x
        )
        print("Converted save_path to GCS format (gs://ann-files/pdf/...)")

    df["pdf_is_saved_date"].value_counts(dropna=False)

    # exit(1)

    # とりあえずの url 存在判定確認コード。
    if False:
        def url_exists(url):
            try:
                r = requests.head(url, allow_redirects=True, timeout=5)

                # HEAD が許可されていない場合は GET に fallback
                if r.status_code == 405:
                    r = requests.get(url, stream=True, timeout=5)

                # 404 だけが「存在しない」
                return r.status_code != 404

            except requests.RequestException:
                return False

    # do_url_requests の前に pdf_is_saved をチェック
    if do_url_requests:
        print("Check pdf_is_saved (before url_requests).")

        file_cache = {}

        for i, row in tqdm(df.iterrows(), total=len(df)):
            p = row["save_path"]
            if p is None or pd.isna(p):
                df.loc[i,"pdf_is_saved"] = False
                continue

            if gcp_vm and p.startswith("gs://"):
                # GCSパスからディレクトリ部分を抽出
                parts = p.split("/")
                if len(parts) >= 5:
                    dir_key = "/".join(parts[:5]) + "/"
                    if dir_key not in file_cache:
                        print(f"Loading file list for: {dir_key}")
                        file_cache[dir_key] = list_gcs_files_in_prefix(dir_key)
                    df.loc[i,"pdf_is_saved"] = p in file_cache[dir_key]
                else:
                    df.loc[i,"pdf_is_saved"] = gcs_exists(p)
            else:
                # ローカルパス
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
                df.loc[i,"pdf_is_saved"] = p_normalized in file_cache[dir_key]

        print(f"pdf_is_saved status: {df['pdf_is_saved'].value_counts(dropna=False).to_dict()}")

    # pdf 保存処理
    if do_url_requests:
        print("Save pdf by requests.")
        for i, row in tqdm(df.iterrows(), total=len(df)):
            # index_value = row["adhoc_index"]
            pdfurl = row["url"]
            target_url = row["base_link_parent"]
            save_path = row["save_path"]

            if pdfurl is None:
                continue

            # Skip if file already exists
            if df.loc[i,"pdf_is_saved"] == True:
                continue

            # ディレクトリが存在しない場合は作成
            save_path_dirname = os.path.dirname(save_path)
            if not gcp_vm and not os.path.exists(save_path_dirname):
                os.makedirs(save_path_dirname, exist_ok=True)

            for skipurl in pdf_requests_skip_urls:
                if pdfurl.startswith(skipurl):
                    print(fr"Skip url: {skipurl}...")
                    continue

            if pdfurl is not None and not pdfurl.startswith("https://tinyurl"):
                df.loc[i,"pdf_is_saved_date"] = today_str

                try:
                    # PDF をダウンロード
                    time.sleep(0.7)
                    response = requests.get(pdfurl, headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36",
                        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp",
                        "Connection": "keep-alive",
                    })
                    response.raise_for_status()
                except requests.exceptions.HTTPError as e:
                    print(f"HTTP エラー: {pdfurl} -> {e}")
                    time.sleep(1)
                    continue
                except requests.exceptions.RequestException as e:
                    print(f"通信エラー: {pdfurl} -> {e}")
                    time.sleep(1)
                    continue

                try:
                    if gcp_vm and save_path.startswith("gs://"):
                        gcs_upload_from_bytes(save_path, response.content)
                        print(fr"Saved {save_path}.")
                    else:
                        Path(save_path).write_bytes(response.content)
                        print(fr"Saved {save_path}.")
                except Exception as e:
                    print(e)

    if do_pdf_is_saved:
        print("Check pdf_is_saved.")

        # ディレクトリごとにファイルリストをキャッシュして高速化
        file_cache = {}

        for i, row in tqdm(df.iterrows(), total=len(df)):
            p = row["save_path"]
            if p is None or pd.isna(p):
                df.loc[i,"pdf_is_saved"] = False
                continue

            if gcp_vm and p.startswith("gs://"):
                # GCSパスからディレクトリ部分を抽出 (例: gs://ann-files/pdf/pdf_00001/)
                parts = p.split("/")
                if len(parts) >= 5:  # gs://bucket/pdf/pdf_XXXXX/...
                    dir_key = "/".join(parts[:5]) + "/"  # gs://ann-files/pdf/pdf_00001/

                    # キャッシュにない場合はディレクトリ内のファイル一覧を取得
                    if dir_key not in file_cache:
                        print(f"Loading file list for: {dir_key}")
                        file_cache[dir_key] = list_gcs_files_in_prefix(dir_key)

                    # キャッシュされたセットでO(1)検索
                    df.loc[i,"pdf_is_saved"] = p in file_cache[dir_key]
                else:
                    # パス形式が想定外の場合は従来通り
                    df.loc[i,"pdf_is_saved"] = gcs_exists(p)
            else:
                # ローカルパス: プラットフォーム依存の区切り文字に正規化
                # 'output_v3/pdf/pdf_00001/file.pdf' -> Windows: 'output_v3\pdf\pdf_00001\file.pdf'
                p_normalized = os.path.normpath(p)
                dir_key = os.path.dirname(p_normalized)

                # キャッシュにない場合はディレクトリ内のファイル一覧を取得
                if dir_key not in file_cache:
                    if os.path.exists(dir_key):
                        # ディレクトリ内の全ファイルをセットに格納（正規化済みパス）
                        file_cache[dir_key] = {
                            os.path.join(dir_key, f)
                            for f in os.listdir(dir_key)
                            if os.path.isfile(os.path.join(dir_key, f))
                        }
                    else:
                        file_cache[dir_key] = set()

                # キャッシュされたセットでO(1)検索（両方とも正規化済み）
                df.loc[i,"pdf_is_saved"] = p_normalized in file_cache[dir_key]

    df["pdf_is_saved"].value_counts(dropna=False)


    if do_pagecount:
        print("pagecount.")
        ### python main.py で実行しないとダメなうえに、実行してしまった場合、落とさないといけないので注意。
        cpu_count_value = os.cpu_count()
        max_workers = min(8, cpu_count_value)

        mask = df["pageCount"] == -1
        files = df.loc[mask, "save_path"].values
        with ProcessPoolExecutor(max_workers=max_workers) as ex:
            results = list(
                tqdm(
                    ex.map(get_pages, files, chunksize=200),
                    total=len(files)
                )
            )
        df.loc[mask, "pageCount"] = results
        df["pageCount"].value_counts(dropna=False)

    if do_output:
        # ord <- baseinfo[,c("Unnamed..0" ,"Unnamed..1","入札公告.現在募集中.2")]
        ord = baseinfo[["Unnamed: 0", "Unnamed: 1", "入札公告（現在募集中）2"]].copy()
        # ord[["orderer_id"]] <- paste("防衛省",ord[["Unnamed..0"]],ord[["Unnamed..1"]])
        ord["orderer_id"] = "防衛省" + ord["Unnamed: 0"].astype(str) + ord["Unnamed: 1"].astype(str)
        # 辞書を作る
        mapping = dict(zip(ord["入札公告（現在募集中）2"], ord["orderer_id"]))
        # match相当
        df["orderer_id"] = df["base_link"].map(mapping)
        # 固定値代入
        df["topAgencyName"] = "防衛省"

        df.to_csv(output_file1, sep="\t", index=False)


    ## TODO pdfからのテキスト出力を辞めたい
    if do_pdf2txt:
        print("pdf2txt.")
        rows = [row for _, row in df.iterrows()]
        save_path_here = [row["save_path"] for row in rows]
        cpu_count_value = os.cpu_count()
        max_workers = min(8, cpu_count_value)
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            results = list(tqdm(executor.map(pdf_to_txt_actual, save_path_here), total=len(save_path_here)))

        if False:
            # テキストの存在とサイズ確認後。
            df["pdf_is_saved_date"].value_counts(dropna=False)
            df_xx = df.copy()
            df_xx["chk"] = ccc["chk"]
            df_xx[(df_xx["chk"]=="未出力") & (df_xx["pdf_is_saved_date"]=="2026-03-03")]
            df_y1 = df_xx[(df_xx["chk"]=="未出力") & (df_xx["pdf_is_saved_date"]=="2026-03-03") & (df_xx["fileFormat"]=="pdf")]
            df_y2 = df_xx[(~df_xx["save_path_txt_all_py_is"]) & (df_xx["pdf_is_saved"]) & (df_xx["pdf_is_saved_date"]=="2026-03-03") & (df_xx["fileFormat"]=="pdf")]
            df_y1.shape
            df_y2.shape
            df_y2_only = df_y2.loc[~df_y2.index.isin(df_y1.index)]

            aaaa = df[df["txt_size"]==0]

            tmpout = []
            ccc = pd.DataFrame(tmpout, columns=["chk"])
            ccc.value_counts(dropna=False)
            ccc = pd.DataFrame({
                "chk": tmpout,
                "pdf_is_saved_date": df["pdf_is_saved_date"].values,
                "fileFormat":df["fileFormat"].values
            })
            ccc2 = ccc.value_counts(dropna=False).reset_index(name="count")
            ccc2[(ccc2["chk"]=="未出力") & (ccc2["pdf_is_saved_date"]=="2026-03-03")]
            for i,row in tqdm(df.iterrows(),total=len(df)):
                pdf_path = row["save_path"]
                output_path = pdf_path.replace("/pdf/","/pdf_txt_all_py/")

                base, ext = os.path.splitext(output_path)
                output_path = base + ".txt"

                os.makedirs(os.path.dirname(output_path), exist_ok=True)

                if not os.path.exists(pdf_path):
                    tmpout.append( "pdf無し" )
                    continue

                if False and os.path.exists(pdf_path):
                    tmpout.append( "pdfあり" )
                    continue

                if True and os.path.exists(output_path):
                    tmpout.append( "出力済み" )
                    continue

                if True and not os.path.exists(output_path):
                    tmpout.append( "未出力" )
                    continue
                
                # テキスト抽出
                try:
                    texts = ""
                    with pdfplumber.open(pdf_path) as pdf:
                        for page in pdf.pages:
                            text = page.extract_text()
                            if text:
                                texts = texts + text + "\n"
                    if texts != "":
                        with open(output_path, "w", encoding="utf-8") as f:
                            _ = f.write(texts)

                    if texts == "" and use_tesseract:
                        if platform.system() == "Windows":
                            path_to_tesseract = r"tesseract.exe"
                            pytesseract.tesseract_cmd = path_to_tesseract
                        pages = pdf2image.convert_from_path(pdf_path)
                        texts = "THIS TEXT IS EXTRACTED BY TESSERACT\n"
                        for page in pages:
                            texts += pytesseract.image_to_string(page, lang="jpn")

                        with open(output_path, "w", encoding="utf-8") as f:
                            _ = f.write(texts)
                        
                    tmpout.append("テキスト抽出:ファイル出力終了")
                except Exception as e:
                    print(e)
                    tmpout.append("テキスト抽出:エラー")

    if False:
        # テキストの存在とサイズ確認
        def tmpf2(s):
            output_path = s.replace("/pdf/","/pdf_txt_all_py/")
            base, ext = os.path.splitext(output_path)
            output_path = base + ".txt"
            return output_path

        df["save_path_txt_all_py"] = df["save_path"].apply(tmpf2)
        df["save_path_txt_all_py_is"] = False
        df["txt_size"] = -1

        # 存在・サイズ確認
        print("Check existence, size.")
        for i, row in tqdm(df.iterrows(), total=len(df)):
            p = row["save_path_txt_all_py"]
            if p is not None and os.path.exists(p):
                df.loc[i,"save_path_txt_all_py_is"] = True
                df.loc[i,"txt_size"] = os.path.getsize(p)
            else:
                df.loc[i,"save_path_txt_all_py_is"] = False

        tmpdf0 = df[df["txt_size"]==0]
        tmpdf = df[df["txt_size"]>=0]
        tmpdf["txt_size"].value_counts(dropna=False)
        tmpdf0["pdf_is_saved_date"].value_counts()
        tmpdf0["save_path_txt_all_py"]

        for txt_path in tmpdf0["save_path_txt_all_py"]:
            if os.path.exists(txt_path):
                os.remove(txt_path)

    if do_bidtypecheck:
        # ファイル見て公募とかチェック。
        # 
        #grepwords_list = [
        #    (["公募"], "公募"),
        #    (["一般競争入札"], "一般競争入札"),
        #    (["指名停止措置"], "指名停止措置")
        #]
        results = run_parallel(df)
        results_df = pd.DataFrame(results)
        results_df["type"].value_counts()
        df["type"] = results_df["type"]


    if do_output:
        # ord <- baseinfo[,c("Unnamed..0" ,"Unnamed..1","入札公告.現在募集中.2")]
        ord = baseinfo[["Unnamed: 0", "Unnamed: 1", "入札公告（現在募集中）2"]].copy()
        # ord[["orderer_id"]] <- paste("防衛省",ord[["Unnamed..0"]],ord[["Unnamed..1"]])
        ord["orderer_id"] = "防衛省" + ord["Unnamed: 0"].astype(str) + ord["Unnamed: 1"].astype(str)
        # 辞書を作る
        mapping = dict(zip(ord["入札公告（現在募集中）2"], ord["orderer_id"]))
        # match相当
        df["orderer_id"] = df["base_link"].map(mapping)
        # 固定値代入
        df["topAgencyName"] = "防衛省"

        df.to_csv(output_file1, sep="\t", index=False)

    if do_datesimplecheck:
        print("datesimplecheck")
        date_list = []
        document_id = df["document_id"][0]
        for i,row in tqdm(df.iterrows(), total=len(df)):

            document_id = row["document_id"]
            f_pdf = row["save_path"]
            f_txt = f_pdf.replace("/pdf/","/pdf_txt_all_py/")
            base, ext = os.path.splitext(f_txt)
            f_txt = base + ".txt"

            if file_exists(f_txt):
                data_txt = read_text_file(f_txt)
            else:
                date_list.append( (document_id, None, None, None, None) )
                continue

            # with open(f_pdf, "rb") as f0:
            #    data_pdf = f0.read()   # ただのバイト列

            data_txt2 = data_txt.replace(" ","").replace("\n","")

            # N = 30
            # pattern = rf".{{0,{N}}}@.{{0,{N}}}"
            # matches = re.findall(pattern, data_txt2)


            # 前後に取りたい文字数
            N = 15
            # pattern = rf".{{0,{N}}}令和[0-9０-９元]+年.{{0,{N}}}"
            pattern = rf"令和[0-9０-９元]+年.{{0,{N}}}"
            matches = re.findall(pattern, data_txt2)
            matches_list = []
            for m in matches:
                if m.find("日") >= 0:
                    m2 = m[m.find("令和"):(m.find("日")+1)]
                elif m.find("月") >= 0:
                    m2 = m[m.find("令和"):(m.find("月")+1)]
                elif m.find("年") >= 0:
                    m2 = m[m.find("令和"):(m.find("年")+1)]
                else:
                    m2= None
                matches_list.append(m2)
            
            if matches_list == []:
                date_list.append( (document_id, None, None, None, None) )
                continue

            # 日付として最小を取る
            dates = [(s, parse_reiwa_date(s)) for s in matches_list]
            valid_dates = [d for d in dates if d[1] is not None]
            if valid_dates == []:
                date_list.append( (document_id, None, None, None, None) )
                continue
            earliest = min(valid_dates, key=lambda x: x[1])
            latest = max(valid_dates, key=lambda x: x[1])
            date_list.append( (document_id, earliest[0], earliest[1], latest[0], latest[1]) )

        date_df = pd.DataFrame(date_list, columns=["document_id","datelabel_earliest","date_earliest","datelabel_latest","date_latest"])
        date_df.to_csv(date_df_output_file, sep="\t", index=False)


    if do_categorysimplecheck:
        print("categorysimplecheck")
        type_list = []
        document_id = df["document_id"][0]
        for i,row in tqdm(df.iterrows(), total=len(df)):

            document_id = row["document_id"]
            f_pdf = row["save_path"]
            f_txt = f_pdf.replace("/pdf/","/pdf_txt_all_py/")
            base, ext = os.path.splitext(f_txt)
            f_txt = base + ".txt"

            if file_exists(f_txt):
                data_txt = read_text_file(f_txt)
            else:
                type_list.append( (document_id, None, None, None, None) )
                continue

            # with open(f_pdf, "rb") as f0:
            #    data_pdf = f0.read()   # ただのバイト列

            data_txt2 = data_txt.replace(" ","").replace("\n","")

            if False:
                data_txt2.find("工事")
                data_txt2.find("業務")
                data_txt2.find("土木")
                data_txt2.find("建設")
                data_txt2.find("測量")
                data_txt2.find("調査")
                data_txt2.find("役務")
            
            patterns_const = [
                r"入札公告[（(].+?工事[）)]",
                r"工事概要",
                r"工事名",
                r"工事場所",
                r"工事内容",
                r"工期"
            ]
            flgs_const = []
            score_const = 0
            for i,pattern in enumerate(patterns_const):
                flg = re.search(pattern, data_txt2)
                if flg:
                    flg = flg.group()
                    if pattern == "入札公告[（(].+?工事[）)]":
                        if len(flg) > 10:
                            flg = None
                        else:
                            flg = flg.replace("（","(").replace("）",")")
                            score_const += 1
                    else:
                        score_const += 1
                flgs_const.append(flg)

            patterns_business = [
                r"業務概要",
                r"業務の名称",
                r"履行場所",
                r"業務内容",
                r"履行期間",
                r"サービス"
            ]
            flgs_business = []
            score_business = 0
            for i,pattern in enumerate(patterns_business):
                flg = re.search(pattern, data_txt2)
                if flg:
                    flg = flg.group()
                    score_business += 1
                flgs_business.append(flg)

            type_list.append( [document_id] + flgs_const + flgs_business + [score_const] + [score_business] )

        type_df = pd.DataFrame(type_list, columns=["document_id"] + [fr"const{i}" for i in range(len(patterns_const))] + [fr"business{i}" for i in range(len(patterns_business))] + ["score_const","score_business"] )
        type_df.to_csv(type_df_output_file, sep="\t", index=False)

    if do_output:
        # ord <- baseinfo[,c("Unnamed..0" ,"Unnamed..1","入札公告.現在募集中.2")]
        ord = baseinfo[["Unnamed: 0", "Unnamed: 1", "入札公告（現在募集中）2"]].copy()
        # ord[["orderer_id"]] <- paste("防衛省",ord[["Unnamed..0"]],ord[["Unnamed..1"]])
        ord["orderer_id"] = "防衛省" + ord["Unnamed: 0"].astype(str) + ord["Unnamed: 1"].astype(str)
        # 辞書を作る
        mapping = dict(zip(ord["入札公告（現在募集中）2"], ord["orderer_id"]))
        # match相当
        df["orderer_id"] = df["base_link"].map(mapping)
        # 固定値代入
        df["topAgencyName"] = "防衛省"

        # type_df["const0"].value_counts(dropna=False)
        # (type_df["document_id"]==df["document_id"]).all()

        # 現状の type みたいなもの。
        df["bidType"] = "unknown"
        #bidType
        #open_competitive          170
        #designated_competitive     66
        #negotiated_contract        33
        #planning_competition       33
        #preferred_designation      33
        #open_counter               33
        #document_request           33
        #opinion_request            33
        #unknown                    33
        #other                      33


        if do_categorysimplecheck:
            df["category"] = type_df["const0"].fillna("その他")
        else:
            ## TODO 別ロジック
            df["category"] ="その他"

        df.to_csv(output_file1, sep="\t", index=False)

    """
type : 
pdfへのリンクに表示する文字列。仕様書とか。公告とか。

bidType :
open_competitive          170
designated_competitive     66
negotiated_contract        33
planning_competition       33
preferred_designation      33
open_counter               33
document_request           33
opinion_request            33
unknown                    33
other                      33

category :
工事についていえば。  (一般のカテゴリだが公告がこれらに基づいているかは不明)
'土木一式工事',
'建築一式工事',
'大工工事',
'左官工事',
'とび・土工・コンクリート工事',
'石工事',
'屋根工事',
'電気工事',
'管工事',
'タイル・れんが・ブロック工事',
'鋼構造物工事',
'鉄筋工事',
'舗装工事',
'しゅんせつ工事',
'板金工事',
'ガラス工事',
'塗装工事',
'防水工事',
'内装仕上工事',
'機械器具設置工事',
'熱絶縁工事',
'電気通信工事',
'造園工事',
'さく井工事',
'建具工事',
'水道施設工事',
'消防施設工事',
'清掃施設工事',
'解体工事',
'その他'
    """
