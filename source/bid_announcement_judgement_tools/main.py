#coding: utf-8

"""
処理概要：

- 判定前公告一覧表を入力として受け取る。
- 公告マスターや要件マスターを作成する。
- 公告pdfから公告・要件情報を抽出する。
- 企業 x 拠点 x 要件の組み合わせごとに要件判定を行い、判定結果を企業公告マスターにまとめる。

処理のステップ：

- step0 : 公告ドキュメント準備処理（オプション）
  - HTML取得、リンク抽出、フォーマット処理を実行
  - announcements_document_merged_updated.txt を生成
- step1 : 転写処理
- step2 : OCR処理
- step3 : 要件判定

Usage example:

    # Step0のみ実行（テスト用・データベース不要）
    python source/bid_announcement_judgement_tools/main.py \\
        --run_step0_prepare_documents \\
        --run_step0_only \\
        --input_list_file data/urllistリスト_防衛省入札_1.txt \\
        --step0_output_base_dir output

    # Step0を含む完全な実行例
    python source/bid_announcement_judgement_tools/main.py \\
        --run_step0_prepare_documents \\
        --input_list_file data/urllistリスト_防衛省入札_1.txt \\
        --step0_output_base_dir output \\
        --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt \\
        --sqlite3_db_file_path data/example.db \\
        --step1_transfer_remove_table \\
        --step3_remove_table

    # Step0をスキップして既存のファイルを使用
    python source/bid_announcement_judgement_tools/main.py \\
        --announcements_documents_file output/202603101234/announcements_document_merged_updated.txt \\
        --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt \\
        --sqlite3_db_file_path data/example.db

    # GCP VM での実行例
    python source/bid_announcement_judgement_tools/main.py \\
        --bid_announcements_pre_file data/bid_announcements_pre/all.txt \\
        --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt \\
        --bigquery_location "LOCATION" \\
        --bigquery_project_id PROJECT_ID \\
        --bigquery_dataset_name DATASET_NAME \\
        --use_gcp_vm \\
        --step1_transfer_remove_table \\
        --step3_remove_table

Arguments:

- --use_gcp_vm: (フラグ引数)

  GCP VM で動作させる場合に指定する。指定した場合、データベースを操作するオブジェクトとして、DBOperatorGCPVMを使う。指定しない場合、DBOperatorSQLITE3 を使う。

- --bid_announcements_pre_file: (パラメータ引数)

  判定前公告一覧表のファイルパス。

- --google_ai_studio_api_key_filepath: (パラメータ引数)

  OCRのための、google ai studio gemini api キーを記載したファイルパス。

- --stop_processing: (フラグ引数)

  指定した場合、変数を設定するが一連の処理は行わず exit する。

- --sqlite3_db_file_path: (パラメータ引数)

  SQLITE3 のデータベースファイルパス。

- --bigquery_location: (パラメータ引数)

  google cloud platform の bigquery の location。

- --bigquery_project_id: (パラメータ引数)

  google cloud platform の project_id。

- --bigquery_dataset_name: (パラメータ引数)

  google cloud platform の bigquery の dataset_name。

- --input_list_file: (パラメータ引数)

  リスト_防衛省入札_1.txt のパス（step0_prepare_documentsの入力）。
  --run_step0_prepare_documents を指定する場合は必須。

- --run_step0_prepare_documents: (フラグ引数)

  step0_prepare_documents（HTML取得・リンク抽出・フォーマット）を実行する。

- --run_step0_only: (フラグ引数)

  step0のみ実行して終了する（データベース不要でテスト可能）。
  このフラグを指定すると、step1以降は実行されない。

- --step0_output_base_dir: (パラメータ引数)

  step0の出力ベースディレクトリ（デフォルト: output）。

- --step0_topAgencyName: (パラメータ引数)

  トップ機関名（デフォルト: 防衛省）。

- --step0_no_merge: (フラグ引数)

  過去の結果とマージしない。

- --announcements_documents_file: (パラメータ引数)

  announcements_document ファイルのパス（step1_transfer_v2で使用）。
  step0_prepare_documents を実行した場合は自動的に設定される。

- --step1_transfer_remove_table: (フラグ引数)

  step1の転写処理で、公告マスターと要件マスターを削除するかどうか。

- --step3_remove_table: (フラグ引数)

  step3の要件判定処理で、企業公告マスター・充足要件マスター・不足要件マスターを削除するかどうか。
"""

import pdb
import sqlite3  # sqlite3使わない想定でもimport
import os
import argparse
import re
import json
import time
import uuid
import sys
import csv
import warnings
from datetime import datetime
from dataclasses import dataclass
from abc import ABC, abstractmethod
from multiprocessing import Pool, cpu_count
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse, urljoin

import pandas as pd
import numpy as np
from google import genai # For OCR
from google.genai.errors import ClientError
from google.genai import types
# import google.generativeai as genai

import httpx
import requests
import ast
from tqdm import tqdm
from bs4 import BeautifulSoup, Comment, Doctype
from ftfy import fix_encoding
from ftfy.badness import badness
import fitz  # PyMuPDF for page counting
import io
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import asyncio
import random

# Suppress FutureWarning for cleaner output
warnings.simplefilter(action="ignore", category=FutureWarning)

try:
    from google.cloud import bigquery
except Exception as e:
    print(e)

try:
    from pandas_gbq import to_gbq
except Exception as e:
    print(e)
try:
    from google.api_core.exceptions import NotFound
except Exception as e:
    print(e)

# GCS support for PDF storage
try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

try:
    from source.bid_announcement_judgement_tools.requirements.ineligibility import checkIneligibilityDynamic
    from source.bid_announcement_judgement_tools.requirements.experience import checkExperienceRequirement
    from source.bid_announcement_judgement_tools.requirements.location import checkLocationRequirement
    from source.bid_announcement_judgement_tools.requirements.grade_item import checkGradeAndItemRequirement
    from source.bid_announcement_judgement_tools.requirements.technician import checkTechnicianRequirement
except ModuleNotFoundError:
    from requirements.ineligibility import checkIneligibilityDynamic
    from requirements.experience import checkExperienceRequirement
    from requirements.location import checkLocationRequirement
    from requirements.grade_item import checkGradeAndItemRequirement
    from requirements.technician import checkTechnicianRequirement


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


def file_exists_gcs_or_local(file_path):
    """Check if file exists (local or GCS)"""
    if file_path.startswith("gs://"):
        return gcs_exists(file_path)
    else:
        return os.path.exists(file_path)


def get_pages(path):
    """
    Get page count of a PDF file (supports both GCS and local paths)

    Args:
        path: PDF file path (local or gs://)

    Returns:
        int: Page count, or -2 if error/not PDF
    """
    if not path.lower().endswith(".pdf"):
        return -2

    try:
        if path.startswith("gs://"):
            # GCS path - download to memory
            pdf_bytes = gcs_download_as_bytes(path)
            with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                return doc.page_count
        else:
            # Local path
            with fitz.open(path) as doc:
                return doc.page_count
    except Exception:
        return -2


class Master:
    """
    Masterクラス。

    Attributes:

    - agency_master:

    - company_master:

    - construction_master:

    - employee_master:

    - employee_qualification_master:

    - employee_experience_master:

    - office_master:

    - office_registration_authorization_master:

    - office_work_achivements_master:

    - technician_qualification_master:

    Notes: Master を集めたクラスを作る必要は無いかもしれない(状態を持ってないので)。
    """

    def __init__(self):

        master_dict = {
            "agency_master":"data/master/agency_master.txt",

            "announcements_competing_companies_master":"data/master/announcements_competing_companies_master.txt",
            "announcements_competing_company_bids_master":"data/master/announcements_competing_company_bids_master.txt",

            "company_master":"data/master/company_master.txt",
            "construction_master":"data/master/construction_master.txt",
            "employee_master":"data/master/employee_master.txt",
            "employee_qualification_master":"data/master/employee_qualification_master.txt",
            "employee_experience_master":"data/master/employee_experience_master.txt",
            "office_master":"data/master/office_master.txt",
            "office_registration_authorization_master":"data/master/office_registration_authorization_master.txt",
            "office_work_achivements_master":"data/master/office_work_achivements_master.txt",
            "technician_qualification_master":"data/master/technician_qualification_master.txt",
            
            "partners_master":"data/master/partners_master.txt",
            "partners_branches":"data/master/partners_branches.txt",
            "partners_categories":"data/master/partners_categories.txt",
            "partners_past_projects":"data/master/partners_past_projects.txt",
            "partners_qualifications_orderer_items":"data/master/partners_qualifications_orderer_items.txt",
            "partners_qualifications_orderers":"data/master/partners_qualifications_orderers.txt",
            "partners_qualifications_unified":"data/master/partners_qualifications_unified.txt"
        }

        for key, val in master_dict.items():
            setattr(self, key, val)

    def getAgencyMaster(self):
        return pd.read_csv(self.agency_master, sep="\t")
    


    def getAnnouncementsCompetingCompaniesMaster(self):
        return pd.read_csv(self.announcements_competing_companies_master, sep="\t")

    def getAnnouncementsCompetingCompanyBidsMaster(self):
        return pd.read_csv(self.announcements_competing_company_bids_master, sep="\t")

    def getAnnouncementsDocumentsMaster(self):
        raise NotImplementedError
        return pd.read_csv(self.announcements_documents_master, sep="\t")



    def getCompanyMaster(self):
        return pd.read_csv(self.company_master, sep="\t")
    
    def getConstructionMaster(self):
        return pd.read_csv(self.construction_master, sep="\t")
    
    def getEmployeeMaster(self):
        return pd.read_csv(self.employee_master, sep="\t")
    
    def getEmployeeExperienceMaster(self):
        return pd.read_csv(self.employee_experience_master, sep="\t")
    
    def getEmployeeQualificationMaster(self):
        return pd.read_csv(self.employee_qualification_master, sep="\t")
        
    def getOfficeMaster(self):
        return pd.read_csv(self.office_master, sep="\t")
    
    def getOfficeRegistrationAuthorizationMaster(self):
        return pd.read_csv(self.office_registration_authorization_master, sep="\t")

    def getOfficeWorkAchivementsMaster(self):
        return pd.read_csv(self.office_work_achivements_master, sep="\t")
    
    def getTechnicianQualificationMaster(self):
        return pd.read_csv(self.technician_qualification_master, sep="\t")


    def getPartnersMaster(self):
        return pd.read_csv(self.partners_master, sep="\t")

    def getPartnersBranches(self):
        return pd.read_csv(self.partners_branches, sep="\t")

    def getPartnersCategories(self):
        return pd.read_csv(self.partners_categories, sep="\t")

    def getPartnersPastProjects(self):
        return pd.read_csv(self.partners_past_projects, sep="\t")

    def getPartnersQualificationsOrdererItems(self):
        return pd.read_csv(self.partners_qualifications_orderer_items, sep="\t")

    def getPartnersQualificationsOrderers(self):
        return pd.read_csv(self.partners_qualifications_orderers, sep="\t")

    def getPartnersQualificationsUnified(self):
        return pd.read_csv(self.partners_qualifications_unified, sep="\t")

    @staticmethod
    def test():
        master = Master(sqlite3_db_file_path="data/example.db")
        print(master.getAgencyMaster())
        print(master.getCompanyMaster())
        print(master.getConstructionMaster())
        print(master.getEmployeeMaster())
        print(master.getEmployeeQualificationMaster())
        print(master.getOfficeMaster())
        print(master.getOfficeRegistrationAuthorizationMaster())
        print(master.getOfficeWorkAchivementsMaster())
        print(master.getEmployeeExperienceMaster())
        print(master.getTechnicianQualificationMaster())


@dataclass(frozen=True)
class TablenamesConfig:
    """
    テーブル名を保持。
    """

    bid_announcements_pre: str = "bid_announcements_pre"
    bid_announcements: str = "bid_announcements"
    bid_requirements: str = "bid_requirements"
    company_bid_judgement: str = "company_bid_judgement"
    sufficient_requirements: str = "sufficient_requirements"
    insufficient_requirements: str = "insufficient_requirements"
    office_master: str = "office_master"
    bid_announcements_document_table:str = "announcements_documents_master"


class OCRutils:
    """
    OCRを行うクラス。

    Attributes:

    - client

      gemini とやりとりするための genai の client

    """

    def __init__(self, google_ai_studio_api_key_filepath=None):
        """ 
        google ai studio の api キーが記載されたファイルパスを受け取り、genai の client を設定する。

        Args:

        - google_ai_studio_api_key_filepath

          OCRのための、google ai studio gemini api キーを記載したファイルパス。
        """

        # google ai studio の api キー
        if google_ai_studio_api_key_filepath is None:
            key = ""
        else:
            with open(google_ai_studio_api_key_filepath,"r") as f:
                key = f.read()

        try:
            self.client = genai.Client(api_key=key)
        except Exception as e:
            print(fr"    OCRutils: {str(e)}")
            self.client = None

    def getPDFDataFromUrl(self, pdfurl):
        """ 
        pdfurl を受け取りデータを読み込む。

        Args:

        - pdfurl

          公告url
        """

        # Retrieve and encode the PDF byte
        # doc_data = httpx.get(pdfurl).content
        # httpx は HTTP/2 周りで、(無言で)落ちることがある？
        r = requests.get(pdfurl)
        doc_data = r.content

        return doc_data

    def getJsonFromDocData(self, doc_data):
        """ 
        公告データ doc_data を受け取り、gemini に渡して、公告情報を json ライクな形式で受け取る。

        gemini 用プロンプトはハードコードされている。

        Args:

        - doc_data

          公告データ
        """

        client = self.client

        prompt = """
        Goal: Extract specific information related to construction projects and bidding procedures from the provided context.

        Steps (T1 → T2 → T3):
        T1: Thoroughly read and understand the entire context.
        T2: Identify and locate the following fields within the context.  If a field is not present, its value will be "".
        T3: Return the extracted information in a valid JSON format, adhering to the specified rules.

        JSON Structure:

        ```json
        {
        "工事場所": "",
        "入札手続等担当部局": {
            "郵便番号": "",
            "住所": "",
            "担当部署名": "",
            "担当者名": "",
            "電話番号": "",
            "FAX番号": "",
            "メールアドレス": ""
        },
        "公告日" : "",
        "入札説明書の交付期間": {
            "開始日": "",
            "終了日": ""
        },
        "申請書及び競争参加資格確認資料の提出期限": {
            "開始日": "",
            "終了日": ""
        },
        "入札書の提出期間": {
            "開始日": "",
            "終了日": ""
        }
        }
        ```

        Rules:
        1.  **Exact Text:** Use the exact original text from the context for all extracted data.  Do not modify or translate the text.
        2.  **Completeness:**  Extract all requested fields. If a field is not found in the context, represent it with an empty string (`""`). No omissions are allowed.
        3.  **Limited Output:** Only include the specified fields in the JSON output. Do not add any extra information or labels.
        4.  **Hide Steps:** Do not display the internal steps (T1 or T2). Only the final JSON output (T3) should be shown.
        5.  **Prefix Exclusion:** Exclude prefixes like "〒", "TEL", "FAX", and "E-mail:" from the extracted values.
        6.  **Output Language:** The output (field names and extracted text if applicable) should be in Japanese.
        7. **Data Structure:** Maintain the nested structure shown in the JSON Structure above.  "入札手続等担当部局", "入札説明書の交付期間", "申請書及び競争参加資格確認資料の提出期限" and "入札書の提出期間" are objects containing their respective sub-fields.
        """
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(
                    data=doc_data,
                    mime_type='application/pdf',
                ),
                prompt
            ]
        )
        # print(response.text)

        text=response.text
        #json_text = extract_json(text=response.text)
        text2 = text.replace('\n', '').replace('```json', '').replace("```","")
        dict1 = json.loads(text2)
        return dict1

    def convertJson(self, json_value):
        """ 
        公告データから取得した json ライクな公告情報を整形して json とする。

        Args:

        - json_value

          json ライクな公告データ
        """

        def _modifyDate(datestr, handle_same_year=None, handle_same_month=None):
            try:
                # スペースを除去してから処理
                datestr = datestr.replace(" ", "").replace("　", "")

                datestr = datestr.replace("令和元年", "令和1年")
                if "同年" in datestr:
                    datestr = datestr.replace("同年", fr"{handle_same_year}年")

                # 同月25日
                m = re.search(r"同月(\d+)日", datestr)
                if m and handle_same_month:
                    y, mth = handle_same_month.split("-")
                    return f"{y}-{mth}-{int(m.group(1)):02}"

                # 令和7年3月18日
                m = re.search(r"令和(\d+)年(\d+)月(\d+)日", datestr)
                if m:
                    return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                # 2025年3月18日 (4桁の年号)
                m = re.search(r"(\d{4})年(\d+)月(\d+)日", datestr)
                if m:
                    return fr"{int(m.group(1))}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                # 7年4月14日 → 令和7年として扱う (1-2桁の年号は令和とみなす)
                m = re.search(r"(\d{1,2})年(\d+)月(\d+)日", datestr)
                if m:
                    year = int(m.group(1))
                    # 年が100未満なら令和として扱う
                    if year < 100:
                        return fr"{year+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"
                    else:
                        return fr"{year}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                # R7.7.2 → 令和7年7月2日
                m = re.search(r"R(\d+)\.(\d{1,2})\.(\d{1,2})", datestr)
                if m:
                    return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                # 7.3.18 → 令和7年3月18日
                m = re.search(r"\b(\d+)\.(\d{1,2})\.(\d{1,2})\b", datestr)
                if m:
                    return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                # 2025/5/12 → 2025-05-12
                m = re.search(r"(\d{4})/(\d{1,2})/(\d{1,2})", datestr)
                if m:
                    return fr"{int(m.group(1))}-{int(m.group(2)):02}-{int(m.group(3)):02}"

                return datestr
            except Exception as e:
                # print(e)
                return None

        def extract_year(s: str) -> str:
            if not s:
                return ""
            try:
                dt = datetime.strptime(s, "%Y-%m-%d")
                return str(dt.year)
            except ValueError:
                return ""


        new_json = {}
        new_json["announcement_no"] = json_value.get("announcement_no")
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


        tmp_json = json_value.get("入札説明書の交付期間", None)
        if isinstance(tmp_json, dict):
            new_json["docdiststart"] = _modifyDate(datestr=tmp_json.get("開始日", None))
            new_json["docdistend"] = _modifyDate(datestr=tmp_json.get("終了日", None), handle_same_year=extract_year(new_json["docdiststart"]))

        tmp_json = json_value.get("申請書及び競争参加資格確認資料の提出期限", None)
        if isinstance(tmp_json, dict):
            new_json["submissionstart"] = _modifyDate(datestr=tmp_json.get("開始日", None))
            new_json["submissionend"] = _modifyDate(datestr=tmp_json.get("終了日", None), handle_same_year=extract_year(new_json["submissionstart"]))

        tmp_json = json_value.get("入札書の提出期間", None)
        if isinstance(tmp_json, dict):
            new_json["bidstartdate"] = _modifyDate(datestr=tmp_json.get("開始日", None))
            new_json["bidenddate"] = _modifyDate(datestr=tmp_json.get("終了日", None), handle_same_year=extract_year(new_json["bidstartdate"]))

        return new_json


    def getRequirementText(self, doc_data):
        """ 
        公告データ doc_data を受け取り、gemini に渡して、公告の要件文を json ライクな形式で受け取る。

        gemini 用プロンプトはハードコードされている。

        Args:

        - doc_data

          公告データ
        """

        client = self.client

        prompt = """
        # Goal Seek Prompt for Bid Qualification Extraction

        [Input] 
        → [Extract bidding qualifications from document]
        → [Intent](identify, extract, format, maintain original text, output JSON)

        [Input]
        → [User Intent]
        → [Want or need Intent](accurate extraction, complete requirements, properly formatted JSON, faithful text reproduction)

        [抽象化オブジェクト]
        -> Legal Document Parser for Bid Qualifications
        Why
        <User Input>
        I need to automatically extract all bidding and competition participation qualifications/requirements from legal documents and format them in a structured JSON output while preserving the original text exactly.
        </User Input>
        [Fixed User want intent] = Extract and structure bidding qualification requirements from legal documents

        Achieve Goal == Need Tasks[Qualification Extraction]=[Tasks](
        Read and comprehend document,
        Identify qualification sections,
        Determine primary qualification headings, 
        Extract qualification text blocks, 
        Maintain text integrity, 
        Handle dependent requirements, 
        Format as specified JSON
        )
        
        To Do Task Execute need Prompt And (Text Analysis Tool)
        assign Agent
        LegalDocumentParser
        
        Agent Task Execute Feed back loop:
        1. Read entire document to understand context
        2. Locate all sections related to "competition participation qualifications
        3. Identify primary qualification sections and related subsections
        4. Extract complete text blocks for each qualification item
        5. Preserve original formatting including numbering and indentation
        6. Group dependent requirements together
        7. Structure output in specified JSON format
        8. Verify all qualification requirements are captured
        
        Then Task Complete
        Execute
        ====================
        
        ### Important Output Instructions
        1. The JSON key name must be exactly "資格・条件" - do not change this key name even if similar terms appear in the document
        2. Preserve the original text of qualifications exactly as they appear in the document, including numbering and formatting
        3. Extract all qualifications completely without omission
        4. Ensure the output is valid JSON format

        ### Output Format
        ```json
        {
        "資格・条件" : [
        "(1) ・・・本文・・・",
        "(2) ・・・本文・・・",
        ...
        ]
        }
        ```
        """
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(
                    data=doc_data,
                    mime_type='application/pdf',
                ),
                prompt
            ]
        )
        # print(response.text)
        text=response.text
        #json_text = extract_json(text=response.text)
        text2 = text.replace('\n', '').replace('```json', '').replace("```","")
        try:
            dict1 = json.loads(text2)
        except json.decoder.JSONDecodeError:
            text2 = text2.replace('"',"'")
            dict1 = json.loads('{"資格・条件" : ["' + text2 + '"]}')
        
        return dict1

    def convertRequirementTextDict(self, requirement_texts):
        """ 
        公告データから取得した json ライクな公告情報を整形して json とする。

        Args:

        - requirement_texts

          json ライクな要件文
        """

        # requirement_texts = {"announcement_no":1, "資格・条件":["(2)令和07・08・09年度防衛省競争参加資格(全省庁統一資格)の「役務の提供等」において、開札時までに「C」又は「D」の等級に格付けされ北海道地域の競争参加を希望する者であること(会社更生法(平成14年法律第154号)に基づき更生手続開始の申立てがなされている者又は民事再生法(平成11年法律第225号)に基づき再生手続開始の申立てがなされている者については、手続開始の決定後、再度級別の格付けを受けていること。)。"]}
        announcement_no = requirement_texts["announcement_no"]
        announcement_no_list = []
        requirement_no_list = []
        requirement_type_list = []
        requirement_text_list = []
        createdDate_list = []
        updatedDate_list = []
        # req_type_list = ["欠格要件","業種・等級要件","所在地要件","技術者要件","実績要件","その他"]
        req_type_list_search_list = {
            "欠格要件":[
                "70条","71条","会社更生法","民事再生法","更生手続",
                "再生手続","情報保全","資本関係","人的関係","滞納",
                "外国法","取引停止","破産","暴力団","指名停止",
                "後見人","法人格取消"
            ],
            "業種・等級要件":["競争参加資格","一般競争","指名競争","等級","総合審査"],
            "所在地要件":["所在","県内","市内","防衛局管内","本店が","支店が"],
            "技術者要件":[
                "施工管理技士","技術士","資格者証","電気工事士","建築士",
                "基幹技能者","監理技術者","主任技術者","監理技術者資格者証","監理技術者講習修了証"
            ],
            "実績要件":[
                "実績","工事成績","元請けとして","元請として","点以上",
                "jv比率","過去実績"
            ],
            "その他要件":["jv","共同企業体","出資比率"] # JV, 共同企業体, or 不明
        }
        for i, text in enumerate(requirement_texts["資格・条件"]):
            # TODO
            # text は、"改行分割" が必要？
            # 未処理。

            has_other_req = True
            text_lower = text.lower()
            for req_type, search_list in req_type_list_search_list.items():
                search_str = "|".join(search_list)
                if (req_type != "その他要件" and re.search(search_str, text_lower)) or (req_type == "その他要件" and re.search(search_str, text_lower)) or (req_type == "その他要件" and not re.search(search_str, text_lower) and has_other_req):
                    announcement_no_list.append(announcement_no)
                    requirement_no_list.append(i)
                    requirement_type_list.append(req_type)
                    requirement_text_list.append(text)
                    createdDate_list.append(datetime.now())
                    updatedDate_list.append(datetime.now())
                    has_other_req = False

        new_dict = {
            "announcement_no":announcement_no_list,
            "requirement_no":requirement_no_list,
            "requirement_type":requirement_type_list,
            "requirement_text":requirement_text_list,
            "createdDate":createdDate_list,
            "updatedDate":updatedDate_list
        }
        return new_dict


class DBOperator:
    """
    データベースを操作するクラス。

    本クラスは抽象クラスとし、継承によってデータベースごとに対応した sql を実行するようにする。

    これにより、異なるデータベースで動かす必要がある場合、そのデータベースに対応したクラスを作成し、対応する sql を書くことで、データベース操作以外の処理を書き直すことなくデータベース移植ができる。

    Attributes:

    - sqlite3_db_file_path

      sqlite3 のデータベースファイルパス

    - bigquery_location

      google cloud platform の bigquery の location。

    - bigquery_project_id

      google cloud platform の project_id。

    - bigquery_dataset_name
  
      google cloud platform の bigquery の dataset_name。
    """

    def __init__(self, sqlite3_db_file_path=None, bigquery_location=None, bigquery_project_id=None, bigquery_dataset_name=None):
        """ 
        google ai studio の api キーが記載されたファイルパスを受け取り、genai の client を設定する。

        Args:

        - sqlite3_db_file_path

          sqlite3 のデータベースファイルパス

        - bigquery_location

          google cloud platform の bigquery の location。

        - bigquery_project_id

          google cloud platform の project_id。

        - bigquery_dataset_name
    
          google cloud platform の bigquery の dataset_name。
        """

        self.sqlite3_db_file_path = sqlite3_db_file_path
        try:
            # isolation_level=None で autocommit モード (変更のたびに conn.commit() を呼び出す必要がなくなる)
            self.conn = sqlite3.connect(sqlite3_db_file_path, isolation_level=None)
            self.cur = self.conn.cursor()
        except Exception as e:
            print(fr"    SQLConnector: {str(e)}")

        try:
            self.location = bigquery_location
            self.client = bigquery.Client(location=bigquery_location)
            self.project_id = bigquery_project_id
            self.dataset_name = bigquery_dataset_name
        except Exception as e:
            print(fr"    SQLConnector: {str(e)}")

    @abstractmethod
    def any_query(self, sql):
        raise NotImplementedError

    @abstractmethod
    def ifTableExists(self, tablename):
        raise NotImplementedError

    @abstractmethod
    def dropTable(self, tablename):
        raise NotImplementedError

    @abstractmethod
    def uploadDataToTable(self, data, tablename, chunksize=1):
        raise NotImplementedError

    @abstractmethod
    def selectToTable(self, tablename, where_clause=""):
        raise NotImplementedError

    @abstractmethod
    def createBidAnnouncements(self, bid_announcements_tablename):
        raise NotImplementedError

    @abstractmethod
    def createBidAnnouncementsV2(self, bid_announcements_tablename):
        raise NotImplementedError

    @abstractmethod
    def createBidOrderersFromAnnouncements(self, bid_orderer_tablename, bid_announcements_tablename):
        raise NotImplementedError

    @abstractmethod
    def createBidRequirements(self, bid_requirements_tablename):
        raise NotImplementedError

    @abstractmethod
    def transferAnnouncements(self, bid_announcements_tablename, bid_announcements_pre_tablename):
        raise NotImplementedError

    @abstractmethod
    def transferAnnouncementsV2(self, bid_announcements_tablename, bid_announcements_documents_tablename):
        raise NotImplementedError

    @abstractmethod
    def updateAnnouncements(self, bid_announcements_tablename, bid_announcements_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def updateRequirements(self, bid_requirements_tablename, bid_requirements_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def getMaxOfColumn(self, tablename, column_name):
        raise NotImplementedError

    @abstractmethod
    def createCompanyBidJudgements(self, company_bid_judgement_tablename):
        raise NotImplementedError

    @abstractmethod
    def createSufficientRequirements(self, sufficient_requirements_tablename):
        raise NotImplementedError

    @abstractmethod
    def createInsufficientRequirements(self, insufficient_requirements_tablename):
        raise NotImplementedError

    @abstractmethod
    def preupdateCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        raise NotImplementedError

    @abstractmethod
    def preselectCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        raise NotImplementedError

    @abstractmethod
    def updateCompanyBidJudgement(self, company_bid_judgement_tablename, company_bid_judgement_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def updateInsufficientRequirements(self, insufficient_requirements_tablename, insufficient_requirements_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def createBackendAnnouncements(self, tablename):
        raise NotImplementedError

    @abstractmethod
    def createBackendEvaluations(self, tablename):
        raise NotImplementedError

    @abstractmethod
    def createBackendCompanies(self, tablename):
        raise NotImplementedError

    @abstractmethod
    def createBackendOrderers(self, tablename):
        raise NotImplementedError

    @abstractmethod
    def createBackendPartners(self, tablename):
        raise NotImplementedError

class DBOperatorGCPVM(DBOperator):
    """
    google bigquery を操作するクラス。
    """

    def any_query(self, sql):
        df = self.client.query(sql).result().to_dataframe()
        return df

    def ifTableExists(self, tablename):
        sql = fr"""
        SELECT table_name FROM `{self.project_id}.{self.dataset_name}.INFORMATION_SCHEMA.TABLES`
        WHERE table_name = '{tablename}'
        """
        df = self.client.query(sql).result().to_dataframe()
        if df.shape[0] == 1:
            return True
        return False

    def dropTable(self, tablename):
        self.client.delete_table(fr"{self.project_id}.{self.dataset_name}.{tablename}", not_found_ok=True)

    def uploadDataToTable(self, data, tablename, chunksize=1):
        to_gbq(
            dataframe=data, 
            destination_table=fr"{self.dataset_name}.{tablename}",  # dataset.table 形式
            project_id=self.project_id, 
            if_exists='replace'
        )

    def selectToTable(self, tablename, where_clause=""):
        sql = fr"select * from `{self.project_id}.{self.dataset_name}.{tablename}` {where_clause}"
        df = self.client.query(sql).result().to_dataframe()
        return df

    def createBidAnnouncements(self, bid_announcements_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` (
        announcement_no int64,
        workName string,
        userAnnNo int64,
        topAgencyNo int64,
        topAgencyName string,
        subAgencyNo int64,
        subAgencyName string,
        workPlace string,
        pdfUrl string,
        zipcode string,
        address string,
        department string,
        assigneeName string,
        telephone string,
        fax string,
        mail string,
        publishDate string,
        docDistStart string,
        docDistEnd string,
        submissionStart string,
        submissionEnd string,    
        bidStartDate string,
        bidEndDate string,
        doneOCR bool,
        remarks string, 
        createdDate string,
        updatedDate string
        )
        """
        self.client.query(sql).result()

    def createBidAnnouncementsV2(self, bid_announcements_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` (
        announcement_no int64,
        workName string,
        userAnnNo int64,
        topAgencyNo int64,
        topAgencyName string,
        subAgencyNo int64,
        subAgencyName string,
        workPlace string,

        pdfUrl string,
        pdfUrl2 string,
        pdfUrl3 string,
        pdfUrl4 string,
        pdfUrl5 string,

        pdfUrl_type string,
        pdfUrl2_type string,
        pdfUrl3_type string,
        pdfUrl4_type string,
        pdfUrl5_type string,

        document_id string,
        document_id2 string,
        document_id3 string,
        document_id4 string,
        document_id5 string,
        
        zipcode string,
        address string,
        department string,
        assigneeName string,
        telephone string,
        fax string,
        mail string,

        publishDate string,
        docDistStart string,
        docDistEnd string,
        submissionStart string,
        submissionEnd string,    
        bidStartDate string,
        bidEndDate string,

        doneOCR bool,
        remarks string, 
        createdDate string,
        updatedDate string,

        orderer_id string,
        category string,
        bidType string
        )
        """
        self.client.query(sql).result()


    def createBidOrderersFromAnnouncements(self, bid_orderer_tablename, bid_announcements_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{bid_orderer_tablename}` as 
        select
        a.orderer_id,
        row_number() over() as `no`,
        a.name,
        a.category,
        a.address,
        a.phone,
        a.fax,
        a.email,
        a.departments,
        a.announcementCount,
        a.awardCount,
        a.averageAmount,
        a.lastAnnouncementDate
        from (
            select
            orderer_id,
            orderer_id as name,
            'unknown' as category,
            'unknown' as address,
            'unknown' as phone,
            'unknown' as fax,
            'unknown' as email,
            'unknown' as departments,
            count(*) as announcementCount,
            0 as awardCount,
            0 as averageAmount,
            min(updatedDate) as lastAnnouncementDate
            from `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}`
            group by
            orderer_id
        ) a
        """
        self.client.query(sql).result()


    def createBidRequirements(self, bid_requirements_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{bid_requirements_tablename}` (
        announcement_no int64,
        requirement_no int64,
        requirement_type string,
        requirement_text string,
        done_judgement bool,
        createdDate string,
        updatedDate string
        )
        """
        self.client.query(sql).result()

    def transferAnnouncements(self, bid_announcements_tablename, bid_announcements_pre_tablename):
        sql = fr"""
        INSERT INTO `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` (
            announcement_no,
            workName,
            userAnnNo,
            topAgencyNo,
            topAgencyName,
            subAgencyNo,
            subAgencyName,
            workPlace,
            pdfUrl,
            zipcode,
            address,
            department,
            assigneeName,
            telephone,
            fax,
            mail,
            publishDate,
            docDistStart,
            docDistEnd,
            submissionStart,
            submissionEnd,
            bidStartDate,
            bidEndDate,
            doneOCR,
            remarks, 
            createdDate,
            updatedDate
            )
        WITH maxval AS (
            SELECT IFNULL(MAX(announcement_no), 0) AS maxid FROM `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}`
        ), 
        to_insert AS (
        SELECT
            ROW_NUMBER() OVER (ORDER BY tbl_pre.pdfurl) AS rn,
            tbl_pre.workName,
            tbl_pre.userAnnNo,
            NULL AS topAgencyNo,
            tbl_pre.topAgencyName,
            NULL AS subAgencyNo,
            tbl_pre.subAgencyName,
            cast(NULL as string) as workPlace,
            tbl_pre.pdfUrl,
            cast(NULL as string) as zipcode,
            cast(NULL as string) as addres,
            cast(NULL as string) as department,
            cast(NULL as string) as assigneeName,
            cast(NULL as string) as telephone,
            cast(NULL as string) as fax,
            cast(NULL as string) as mail,
            tbl_pre.publishDate,
            cast(NULL as string) as docDistStart,
            tbl_pre.docDistEnd,
            cast(NULL as string) as submissionStart,
            tbl_pre.submissionEnd,
            cast(NULL as string) as bidStartDate,
            tbl_pre.bidEndDate,
            FALSE AS doneOCR,
            tbl_pre.remarks,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP()) AS createdDate,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP()) AS updatedDate
        FROM `{self.project_id}.{self.dataset_name}.{bid_announcements_pre_tablename}` AS tbl_pre
        LEFT JOIN `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` AS tbl
            ON tbl_pre.pdfurl = tbl.pdfurl
        WHERE tbl.pdfurl IS NULL
        )
        SELECT 
        rn + maxid,
        workName,
        userAnnNo,
        topAgencyNo,
        topAgencyName,
        subAgencyNo,
        subAgencyName,
        workPlace,
        pdfUrl,
        zipcode,
        addres,
        department,
        assigneeName,
        telephone,
        fax,
        mail,
        publishDate,
        docDistStart,
        docDistEnd,
        submissionStart,
        submissionEnd,
        bidStartDate,
        bidEndDate,
        doneOCR,
        remarks,
        createdDate,
        updatedDate
        FROM to_insert, maxval
        """
        self.client.query(sql).result()


    def transferAnnouncementsV2(self, bid_announcements_tablename, bid_announcements_documents_tablename):
        sql = fr"""
        INSERT INTO `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` (
            announcement_no,
            workName,

            topAgencyName,

            pdfUrl, pdfUrl_type, document_id,
            pdfUrl2, pdfUrl2_type, document_id2,
            pdfUrl3, pdfUrl3_type, document_id3,
            pdfUrl4, pdfUrl4_type, document_id4,
            pdfUrl5, pdfUrl5_type, document_id5,

            workPlace,
            zipcode,
            address,
            department,
            assigneeName,
            telephone,
            fax,
            mail,
            publishDate,
            docDistStart,
            docDistEnd,
            submissionStart,
            submissionEnd,
            bidStartDate,
            bidEndDate,

            doneOCR,
            createdDate,
            updatedDate,

            orderer_id,
            category,
            bidType
        )
        WITH ordered AS (
            SELECT
                ad.*,
                ROW_NUMBER() OVER (
                    PARTITION BY ad.announcement_id
                    ORDER BY ad.document_id
                ) AS rn
            FROM `{self.project_id}.{self.dataset_name}.{bid_announcements_documents_tablename}` ad
        )
        SELECT
            o.announcement_id,
            MAX(CASE WHEN o.rn = 1 THEN o.title END) AS workName,

            MAX(CASE WHEN o.rn = 1 THEN o.topAgencyName END) AS topAgencyName,

            MAX(CASE WHEN o.rn = 1 THEN o.url END) AS pdfUrl,
            MAX(CASE WHEN o.rn = 1 THEN o.type END) AS pdfUrl_type,
            MAX(CASE WHEN o.rn = 1 THEN o.document_id END) AS document_id,

            MAX(CASE WHEN o.rn = 2 THEN o.url END) AS pdfUrl2,
            MAX(CASE WHEN o.rn = 2 THEN o.type END) AS pdfUrl2_type,
            MAX(CASE WHEN o.rn = 2 THEN o.document_id END) AS document_id2,

            MAX(CASE WHEN o.rn = 3 THEN o.url END) AS pdfUrl3,
            MAX(CASE WHEN o.rn = 3 THEN o.type END) AS pdfUrl3_type,
            MAX(CASE WHEN o.rn = 3 THEN o.document_id END) AS document_id3,

            MAX(CASE WHEN o.rn = 4 THEN o.url END) AS pdfUrl4,
            MAX(CASE WHEN o.rn = 4 THEN o.type END) AS pdfUrl4_type,
            MAX(CASE WHEN o.rn = 4 THEN o.document_id END) AS document_id4,

            MAX(CASE WHEN o.rn = 5 THEN o.url END) AS pdfUrl5,
            MAX(CASE WHEN o.rn = 5 THEN o.type END) AS pdfUrl5_type,
            MAX(CASE WHEN o.rn = 5 THEN o.document_id END) AS document_id5,

            MAX(CASE WHEN o.rn = 1 THEN o.workplace END) AS workPlace,
            MAX(CASE WHEN o.rn = 1 THEN o.zipcode END) AS zipcode,
            MAX(CASE WHEN o.rn = 1 THEN o.address END) AS address,
            MAX(CASE WHEN o.rn = 1 THEN o.department END) AS department,
            MAX(CASE WHEN o.rn = 1 THEN o.assigneename END) AS assigneeName,
            MAX(CASE WHEN o.rn = 1 THEN o.telephone END) AS telephone,
            MAX(CASE WHEN o.rn = 1 THEN o.fax END) AS fax,
            MAX(CASE WHEN o.rn = 1 THEN o.mail END) AS mail,
            MAX(CASE WHEN o.rn = 1 THEN o.publishdate END) AS publishDate,
            MAX(CASE WHEN o.rn = 1 THEN o.docdiststart END) AS docDistStart,
            MAX(CASE WHEN o.rn = 1 THEN o.docdistend END) AS docDistEnd,
            MAX(CASE WHEN o.rn = 1 THEN o.submissionstart END) AS submissionStart,
            MAX(CASE WHEN o.rn = 1 THEN o.submissionend END) AS submissionEnd,
            MAX(CASE WHEN o.rn = 1 THEN o.bidstartdate END) AS bidStartDate,
            MAX(CASE WHEN o.rn = 1 THEN o.bidenddate END) AS bidEndDate,

            MAX(CASE WHEN o.rn = 1 THEN o.done END) AS doneOCR,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP()) AS createdDate,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP()) AS updatedDate,

            MAX(CASE WHEN o.rn = 1 THEN o.orderer_id END) AS orderer_id,
            MAX(CASE WHEN o.rn = 1 THEN o.category END) AS category,
            MAX(CASE WHEN o.rn = 1 THEN o.bidType END) AS bidType
        FROM ordered o
        WHERE NOT EXISTS (
            SELECT 1
            FROM `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` b
            WHERE b.announcement_no = o.announcement_id
        )
        GROUP BY o.announcement_id
        """        
        self.client.query(sql).result()


    def updateAnnouncements(self, bid_announcements_tablename, bid_announcements_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename_for_update}` AS source
        ON target.announcement_no = source.announcement_no
        when matched AND target.doneocr = FALSE then
        UPDATE SET
            target.workplace = source.workplace,
            target.zipcode = source.zipcode,
            target.address = source.address,
            target.department = source.department,
            target.assigneename = source.assigneename,
            target.telephone = source.telephone,
            target.fax = source.fax,
            target.mail = source.mail,
            target.publishdate = source.publishdate,
            target.docdiststart = source.docdiststart,
            target.docdistend = source.docdistend,
            target.submissionstart = source.submissionstart,
            target.submissionend = source.submissionend,
            target.bidstartdate = source.bidstartdate,
            target.bidenddate = source.bidenddate,
            target.doneocr = TRUE
        """        
        self.client.query(sql).result()

    def updateRequirements(self, bid_requirements_tablename, bid_requirements_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{bid_requirements_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{bid_requirements_tablename_for_update}` AS source
        ON 
        target.announcement_no = source.announcement_no 
        and target.requirement_no = source.requirement_no
        and target.requirement_type = source.requirement_type
        when not matched then
        insert (
            announcement_no,
            requirement_no,
            requirement_type,
            requirement_text,
            done_judgement,
            createdDate,
            updatedDate
        )
        values (
            source.announcement_no,
            source.requirement_no,
            source.requirement_type,
            source.requirement_text,
            FALSE,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', source.createdDate),
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', source.updatedDate)
        )
        """
        self.client.query(sql).result()

    def getMaxOfColumn(self, tablename, column_name):
        sql = fr"SELECT max({column_name}) FROM `{self.project_id}.{self.dataset_name}.{tablename}`"
        df = self.client.query(sql).result().to_dataframe()
        return df


    def createCompanyBidJudgements(self, company_bid_judgement_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename}` (
            evaluation_no string,
            announcement_no int64,
            company_no int64,
            office_no int64,
            requirement_ineligibility bool,
            requirement_grade_item bool,
            requirement_location bool,
            requirement_experience bool,
            requirement_technician bool,
            requirement_other bool,
            deficit_requirement_message string,
            final_status bool,
            message string,
            remarks string,
            createdDate string,
            updatedDate string
        )
        """
        self.client.query(sql).result()

    def createSufficientRequirements(self, sufficient_requirements_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{sufficient_requirements_tablename}` (
            sufficiency_detail_no string,
            evaluation_no string,
            announcement_no int64,
            requirement_no int64,
            company_no int64,
            office_no int64,
            requirement_type string,
            requirement_description string,
            createdDate string,
            updatedDate string
        )
        """
        self.client.query(sql).result()

    def createInsufficientRequirements(self, insufficient_requirements_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{insufficient_requirements_tablename}` (
            shortage_detail_no string,
            evaluation_no string,
            announcement_no int64,
            requirement_no int64,
            company_no int64,
            office_no int64,
            requirement_type string,
            requirement_description string,
            suggestions_for_improvement string,
            final_comment string,
            createdDate string,
            updatedDate string
        )
        """
        self.client.query(sql).result()

    def preupdateCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename}` AS target
        USING (
            select
            a.announcement_no,
            b.company_no,
            b.office_no
            from 
            `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` a
            cross join
            `{self.project_id}.{self.dataset_name}.{office_master_tablename}` b
            group by a.announcement_no, b.company_no, b.office_no
        ) AS source
        ON 
        target.announcement_no = source.announcement_no and
        target.company_no = source.company_no and
        target.office_no = source.office_no
        when not matched then
        insert (
            evaluation_no,
            announcement_no,
            company_no,
            office_no,
            requirement_ineligibility,
            requirement_grade_item,
            requirement_location,
            requirement_experience,
            requirement_technician,
            requirement_other,
            deficit_requirement_message,
            final_status,
            message,
            remarks,
            createdDate,
            updatedDate
        )
        values (
            NULL,
            source.announcement_no,
            source.company_no,
            source.office_no,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL
        )
        """
        self.client.query(sql).result()

    def preselectCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        sql = fr"""
        select
        x.announcement_no,
        x.company_no,
        x.office_no
        from 
        (
            select 
            a.announcement_no,
            b.company_no,
            b.office_no
            from `{self.project_id}.{self.dataset_name}.{bid_announcements_tablename}` as a 
            cross join 
            `{self.project_id}.{self.dataset_name}.{office_master_tablename}` as b
        ) x
        left outer join `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename}` y
        ON 
        x.announcement_no = y.announcement_no
        and x.company_no = y.company_no
        and x.office_no = y.office_no
        where y.announcement_no is null
        """
        df = self.client.query(sql).result().to_dataframe()
        return df


    def updateCompanyBidJudgement(self, company_bid_judgement_tablename, company_bid_judgement_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename_for_update}` AS source
        ON 
        target.evaluation_no = source.evaluation_no and
        target.announcement_no = source.announcement_no and
        target.company_no = source.company_no and
        target.office_no = source.office_no
        when not matched then
        INSERT (
            evaluation_no,
            announcement_no,
            company_no,
            office_no,
            requirement_ineligibility,
            requirement_grade_item,
            requirement_location,
            requirement_experience,
            requirement_technician,
            requirement_other,
            deficit_requirement_message,
            final_status,
            message,
            remarks,
            createdDate,
            updatedDate
        )
        VALUES (
            source.evaluation_no,
            source.announcement_no,
            source.company_no,
            source.office_no,
            source.requirement_ineligibility,
            source.requirement_grade_item,
            source.requirement_location,
            source.requirement_experience,
            source.requirement_technician,
            source.requirement_other,
            source.deficit_requirement_message,
            source.final_status,
            source.message,
            source.remarks,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', source.createdDate),
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', source.updatedDate)
        )
        """
        self.client.query(sql).result()

    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{sufficient_requirements_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{sufficient_requirements_tablename_for_update}` AS source
        ON 
        target.sufficiency_detail_no = source.sufficiency_detail_no and
        target.evaluation_no = source.evaluation_no and
        target.announcement_no = source.announcement_no and
        target.requirement_no = source.requirement_no and
        target.company_no = source.company_no and
        target.office_no = source.office_no and
        target.requirement_type = source.requirement_type
        when not matched then
        insert (
            sufficiency_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            createdDate,
            updatedDate
        )
        values (
            source.sufficiency_detail_no,
            source.evaluation_no,
            source.announcement_no,
            source.requirement_no,
            source.company_no,
            source.office_no,
            source.requirement_type,
            source.requirement_description,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', source.createdDate),
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', source.updatedDate)
        )
        """
        self.client.query(sql).result()

    def updateInsufficientRequirements(self, insufficient_requirements_tablename, insufficient_requirements_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{insufficient_requirements_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{insufficient_requirements_tablename_for_update}` AS source
        ON 
        target.shortage_detail_no = source.shortage_detail_no and
        target.evaluation_no = source.evaluation_no and
        target.announcement_no = source.announcement_no and
        target.requirement_no = source.requirement_no and
        target.company_no = source.company_no and
        target.office_no = source.office_no and
        target.requirement_type = source.requirement_type
        WHEN NOT MATCHED THEN
        INSERT (
            shortage_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            suggestions_for_improvement,
            final_comment,
            createdDate,
            updatedDate
        )
        VALUES (
            source.shortage_detail_no,
            source.evaluation_no,
            source.announcement_no,
            source.requirement_no,
            source.company_no,
            source.office_no,
            source.requirement_type,
            source.requirement_description,
            source.suggestions_for_improvement,
            source.final_comment,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', source.createdDate),
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', source.updatedDate)
        )
        """
        self.client.query(sql).result()

    def createBackendAnnouncements(self, tablename):
        # announcements_competing_companies_master
        # announcements_competing_company_bids_master
        # announcements_documents_master
        # bid_announcements

        sql = fr"""
        CREATE OR REPLACE TABLE {self.project_id}.{self.dataset_name}.{tablename} AS
        WITH
        -- 1) competing companies を announcement_id ごとに集約
        competing_companies AS (
            SELECT
                announcement_id,
                company_name,
                isWinner
            FROM {self.project_id}.{self.dataset_name}.announcements_competing_companies_master
        ),

        -- 2) competing company bids を announcement_id ごとに集約
        competing_company_bids AS (
            SELECT
                announcement_id,
                company_name,
                bid_amount,
                bid_order
            FROM {self.project_id}.{self.dataset_name}.announcements_competing_company_bids_master
        ),

        -- 3) 会社ごとに bidAmounts をまとめる
        merged_companies AS (
            SELECT
                cc.announcement_id,
                cc.company_name AS name,
                cc.isWinner,
                ARRAY_AGG(b.bid_amount ORDER BY b.bid_order) AS bidAmounts
            FROM competing_companies cc
            LEFT JOIN competing_company_bids b
                ON cc.announcement_id = b.announcement_id
            AND cc.company_name = b.company_name
            GROUP BY cc.announcement_id, name, isWinner
        ),

        -- 4) documents を announcement_id ごとに集約
        documents AS (
            SELECT
                announcement_id,
                ARRAY_AGG(
                    STRUCT(
                        document_id as id,
                        type,
                        title,
                        fileFormat,
                        pageCount,
                        extractedAt,
                        url,
                        content
                    )
                ) AS documents
            FROM {self.project_id}.{self.dataset_name}.announcements_documents_master
            GROUP BY announcement_id
        ),

        -- ★ 5) department を事前に作る（重要）
        base AS (
            SELECT
                a.announcement_no,

                a.workName,

                a.userAnnNo,
                a.topAgencyNo,

                a.topAgencyName,
                a.subAgencyNo,
                a.subAgencyName,

                a.category,
                a.bidType,

                a.workPlace,

                a.pdfUrl,

                STRUCT(
                    COALESCE(a.zipcode, 'unknown_zipcode') AS postalCode,
                    COALESCE(a.address, 'unknown_address') AS address,
                    COALESCE(a.department, 'unknown_department') AS name,
                    COALESCE(a.assigneeName, 'unknown_assigneeName') AS contactPerson,
                    COALESCE(a.telephone, 'unknown_telephone') AS phone,
                    COALESCE(a.fax, 'unknown_fax') AS fax,
                    COALESCE(a.mail, 'unknown_mail') AS email
                ) AS department,

                a.publishDate,
                a.docDistStart,
                a.docDistEnd,
                a.submissionStart,
                a.submissionEnd,
                a.bidStartDate,
                a.bidEndDate,

                a.doneOCR,
                a.remarks,
                a.createdDate,
                a.updatedDate,
                a.orderer_id
            FROM {self.project_id}.{self.dataset_name}.bid_announcements a
        )
        SELECT
        concat('ann-', b.announcement_no) AS id,
        b.announcement_no AS `no`,
        b.orderer_id AS ordererId,
        COALESCE(b.workName, 'unknown_workName') AS title,

        COALESCE(b.topAgencyName, 'unknown_agency') AS organization,

        COALESCE(b.category, 'unknown_category') AS category,
        COALESCE(b.bidType, 'unknown') AS bidType,

        COALESCE(b.workPlace, 'unknown_workplace') AS workLocation,

        b.department,

        
        COALESCE(b.publishDate, 'unknown_publishDate') AS publishDate,
        COALESCE(b.docDistStart, 'unknown_docDistStart') AS explanationStartDate,
        COALESCE(b.docDistEnd, 'unknown_docDistEnd') AS explanationEndDate,
        COALESCE(b.submissionStart, 'unknown_submissionStart') AS applicationStartDate,
        COALESCE(b.submissionEnd, 'unknown_submissionEnd') AS applicationEndDate,
        COALESCE(b.bidStartDate, 'unknown_bidStartDate') AS bidStartDate,
        COALESCE(b.bidEndDate, 'unknown_bidEndDate') AS bidEndDate,
        COALESCE(b.bidEndDate, 'unknown_deadline') AS deadline,


        1 AS estimatedAmountMin,
        1000 AS estimatedAmountMax,
        'closed' AS status,
        10 AS actualAmount,

        concat('com-', 1) AS winningCompanyId,
        'unknown_wincomp' AS winningCompanyName,
        ARRAY_AGG(
            STRUCT(
                mc.name,
                mc.isWinner,
                mc.bidAmounts
            )
        ) AS competingCompanies,
        d.documents
        FROM base b
        LEFT JOIN merged_companies mc
        ON mc.announcement_id = b.announcement_no
        LEFT JOIN documents d
        ON d.announcement_id = b.announcement_no
        GROUP BY
        id, `no`, ordererId, title, category, bidType, organization, workLocation,
        b.department,
        publishDate, explanationStartDate, explanationEndDate,
        applicationStartDate, applicationEndDate, bidStartDate, bidEndDate,
        deadline, estimatedAmountMin, estimatedAmountMax, status,
        actualAmount, winningCompanyId, winningCompanyName, documents
        """
        self.client.query(sql).result()

    def createBackendEvaluations(self, tablename):
        sql = fr"""
        CREATE OR REPLACE TABLE {self.project_id}.{self.dataset_name}.{tablename} AS
        WITH base AS (
            SELECT
            eval.evaluation_no,
            eval.announcement_no,
            
            coalesce(anno.workName, 'unknown_title') AS workName,
            coalesce(anno.category, 'unknown_category') AS category,
            coalesce(anno.topAgencyName, 'unknown_organization') AS topAgencyName,
            coalesce(anno.workPlace, 'unknown_location') AS workPlace,
            coalesce(anno.department, 'unknown_department') AS department,


            coalesce(anno.zipcode, 'unknown_zipcode') as postalCode,
            coalesce(anno.address, 'unknown_address') as address,
            coalesce(anno.department, 'unknown_department') as name,
            coalesce(anno.assigneeName, 'unknown_assigneeName') as contactPerson,
            coalesce(anno.telephone, 'unknown_telephone') as phone,
            coalesce(anno.fax, 'unknown_fax') as fax,
            coalesce(anno.mail, 'unknown_mail') as email,


            
            coalesce(anno.publishDate, 'unknown_publishDate') AS publishDate,
            coalesce(anno.docDistStart, 'unknown_expStartDate') AS docDistStart,
            coalesce(anno.docDistEnd, 'unknown_expEndDate') AS docDistEnd,
            coalesce(anno.submissionStart, 'unknown_appStartDate') AS submissionStart,
            coalesce(anno.submissionEnd, 'unknown_appEndDate') AS submissionEnd,
            coalesce(anno.bidStartDate, 'unknown_bidStartDate') AS bidStartDate,
            coalesce(anno.bidEndDate, 'unknown_bidEndDate') AS bidEndDate,
            coalesce(anno.pdfUrl, 'https://example.com/') AS pdfUrl,
            coalesce(anno.orderer_id, 'unknown_orderer_id') AS orderer_id,
            
            doc.documents,

            eval.company_no,
            coalesce(comp.company_name, 'dummy') AS company_name,
            coalesce(comp.company_address, 'dummy') AS company_address,
            eval.office_no,
            branch.office_name,
            branch.office_address,
            req1.requirement_no,
            req1.requirement_text,
            req2.requirement_type,
            req2.requirement_description,
            req2.isMet,
            eval.final_status,
            eval.updatedDate
            from {self.project_id}.{self.dataset_name}.company_bid_judgement eval

            inner join {self.project_id}.{self.dataset_name}.bid_announcements anno
            on eval.announcement_no = anno.announcement_no

            LEFT OUTER JOIN (
                SELECT
                    announcement_id,
                    ARRAY_AGG(
                        STRUCT(document_id, type, title, fileFormat, pageCount, extractedAt, url, content)
                    ) AS documents
                FROM (
                    SELECT DISTINCT
                    announcement_id,
                    document_id,
                    type,
                    title,
                    fileFormat,
                    pageCount,
                    extractedAt,
                    url,
                    content
                    FROM {self.project_id}.{self.dataset_name}.announcements_documents_master
                )
                GROUP BY announcement_id
            ) doc
            ON anno.announcement_no = doc.announcement_id
            
            inner join {self.project_id}.{self.dataset_name}.company_master comp
            on eval.company_no = comp.company_no

            inner join {self.project_id}.{self.dataset_name}.office_master branch
            on eval.office_no = branch.office_no

            inner join {self.project_id}.{self.dataset_name}.bid_requirements req1
            on eval.announcement_no = req1.announcement_no

            inner join
            (
                select 
                announcement_no, office_no, requirement_no, requirement_type, requirement_description, true as isMet 
                from {self.project_id}.{self.dataset_name}.sufficient_requirements
                union all
                select 
                announcement_no, office_no, requirement_no, requirement_type, requirement_description, false as isMet 
                from {self.project_id}.{self.dataset_name}.insufficient_requirements
            ) req2
            on 
            req1.requirement_no = req2.requirement_no and eval.office_no = req2.office_no
        )
        SELECT
        cast(evaluation_no as string) AS id,
        LPAD(CAST(evaluation_no AS STRING), 8, '0') AS evaluationNo,
        struct(
            concat('ann-', announcement_no) AS id,
            orderer_id AS ordererId,
            workName AS title,
            category,
            topAgencyName AS organization,
            workPlace AS workLocation,
            
            struct(
                postalCode,
                address,
                name,
                contactPerson,
                phone,
                fax,
                email
            ) as department,

            
            publishDate AS publishDate,
            docDistStart AS explanationStartDate,
            docDistEnd AS explanationEndDate,
            submissionStart AS applicationStartDate,
            submissionEnd AS applicationEndDate,
            bidStartDate AS bidStartDate,
            bidEndDate AS bidEndDate,
            bidEndDate AS deadline,
            10000 AS estimatedAmountMin,
            20000 AS estimatedAmountMax,
            pdfUrl AS pdfUrl,
            documents
        ) AS announcement,
        struct(
            concat('com-', company_no) AS id,
            company_name as name,
            company_address as address,
            'A' AS grade,
            1 AS priority
        ) AS company,
        struct(
            concat('brn-', office_no) AS id,
            office_name AS name,
            office_address AS address
        ) AS branch,
        array_agg(
            struct(
                concat('req-', requirement_no) AS id,
                requirement_type AS category,
                requirement_text AS name,
                isMet AS isMet,
                requirement_description AS reason,
                'dummy_evidence' AS evidence
            )
        ) AS requirements,
        CASE WHEN coalesce(final_status, FALSE) THEN 'all_met' ELSE 'unmet' END AS status,
        'not_started' AS workStatus,
        'judgement' AS currentStep,
        coalesce(updatedDate, 'dummy') AS evaluatedAt
        FROM base

        GROUP BY
        evaluation_no,
        announcement_no,
        orderer_id,
        workName,
        category,
        topAgencyName,
        workPlace,

        postalCode,
        address,
        name,
        contactPerson,
        phone,
        fax,
        email,

        
        department,


        publishDate,
        docDistStart,
        docDistEnd,
        submissionStart,
        submissionEnd,
        bidStartDate,
        bidEndDate,
        pdfUrl,
       
        documents,

        company_no,
        company_name,
        company_address,
        office_no, 
        office_name, 
        office_address, 
        final_status,
        updatedDate
        """
        self.client.query(sql).result()

    def createBackendCompanies(self, tablename):
        sql = fr"""
        CREATE OR REPLACE TABLE {self.project_id}.{self.dataset_name}.{tablename} AS
        WITH base AS (
            select 
            comp.company_no as id,
            comp.company_no as `no`,
            coalesce(comp.company_name, 'dummy') as name,
            coalesce(comp.company_address, 'dummy') as address,
            'A' as grade,
            1 as priority,
            coalesce(comp.telephone, 'dummy') as phone,
            'dummy' as email,
            coalesce(comp.name_of_representative, 'dummy') as representative,
            coalesce(comp.establishment_date, 'dummy') as established,
            1 as capital,
            100 as employeeCount,
            coalesce(branch.office_name, 'dummy') as branches_name,
            coalesce(branch.office_address, 'dummy') as branches_address,
            'dummy' as certifications

            from {self.project_id}.{self.dataset_name}.company_master comp
            left outer join {self.project_id}.{self.dataset_name}.office_master branch
            on comp.company_no = branch.company_no
        )
        select
        concat('com-', id) as id,
        `no`,
        name,
        address,
        grade,
        priority,
        phone,
        email,
        representative,
        established,
        capital,
        employeeCount,
        array_agg(
            struct(
                branches_name as name,
                branches_address as address
            )
        ) AS branches,
        array_agg(
            struct(
                certifications
            )
        ) as certifications
        from base
        group by
        id,
        `no`,
        name,
        address,
        grade,
        priority,
        phone,
        email,
        representative,
        established,
        capital,
        employeeCount
        """
        self.client.query(sql).result()

    def createBackendOrderers(self, tablename):
        # カテゴリの値は要確認：category
        sql = fr"""
        CREATE OR REPLACE TABLE {self.project_id}.{self.dataset_name}.{tablename} AS
        with base as (
            select 
            orderer_id as id,
            `no`,
            name,
            'national' as category, 
            address,
            phone,
            fax,
            email,
            departments,
            announcementCount,
            awardCount,
            averageAmount,
            lastAnnouncementDate
            from {self.project_id}.{self.dataset_name}.bid_orderer
        )
        select
        id,
        `no`,
        name,
        category,
        address,
        phone,
        fax,
        email,
        array_agg(
            departments
        ) as departments,
        announcementCount,
        awardCount,
        averageAmount,
        lastAnnouncementDate
        from base

        group by
        id,
        `no`,
        name,
        category,
        address,
        phone,
        fax,
        email,
        announcementCount,
        awardCount,
        averageAmount,
        lastAnnouncementDate
        """
        self.client.query(sql).result()

    def createBackendPartners(self, tablename):
        sql = fr"""
        CREATE OR REPLACE TABLE {self.project_id}.{self.dataset_name}.{tablename} AS
        WITH
        -- 1) categories を partner_id ごとに集約
        categories AS (
            SELECT
            partner_id,
            ARRAY_AGG(categories) AS categories
            FROM {self.project_id}.{self.dataset_name}.partners_categories
            GROUP BY partner_id
        ),

        -- 2) past projects を partner_id ごとに集約
        past_projects AS (
            SELECT
            partner_id,
            ARRAY_AGG(
                STRUCT(
                    cast(evaluationId as string) as evaluationId,
                    announcementId,
                    cast(announcementNo as int64) as announcementNo,
                    announcementTitle,
                    branchName,
                    workStatus,
                    evaluationStatus,
                    cast(priority as int64) as priority,
                    bidType,
                    category,
                    prefecture,
                    publishDate,
                    deadline,
                    evaluatedAt,
                    organization
                )
            ) AS pastProjects
            FROM {self.project_id}.{self.dataset_name}.partners_past_projects
            GROUP BY partner_id
        ),

        -- 3) branches を partner_id ごとに集約
        branches AS (
            SELECT
            partner_id,
            ARRAY_AGG(
                STRUCT(
                    name,
                    address
                )
            ) AS branches
            FROM {self.project_id}.{self.dataset_name}.partners_branches
            GROUP BY partner_id
        ),

        -- 4) unified qualifications を partner_id ごとに集約
        qual_unified AS (
        SELECT
            partner_id,
            ARRAY_AGG(
                STRUCT(
                    mainCategory,
                    category,
                    region,
                    cast(value as string) as value,
                    grade
                )
            ) AS unified
            FROM {self.project_id}.{self.dataset_name}.partners_qualifications_unified
            GROUP BY partner_id
        ),

        -- 5) orderer items を ordererName ごとに集約
        orderer_items AS (
            SELECT
            partner_id,
            ordererName,
            ARRAY_AGG(
                STRUCT(
                    category,
                    region,
                    cast(value as string) as value,
                    grade
                )
            ) AS items
            FROM {self.project_id}.{self.dataset_name}.partners_qualifications_orderer_items
            GROUP BY partner_id, ordererName
        ),
        -- 6) orderers を partner_id ごとに集約
        orderers AS (
            SELECT
            partner_id,
            ARRAY_AGG(
                STRUCT(
                    ordererName,
                    items
                )
            ) AS orderers
            FROM orderer_items
            GROUP BY partner_id
        )
        -- 7) 最終結合（爆発しない）
        SELECT
        pm.partner_id AS id,
        pm.no,
        pm.name,
        pm.postalCode,
        pm.address,
        pm.phone,
        pm.fax,
        pm.email,
        pm.url,
        pm.surveyCount,
        cast(pm.rating as int64) as rating,
        pm.resultCount,
        c.categories,
        pp.pastProjects,
        pm.representative,
        pm.established,
        pm.capital,
        pm.employeeCount,
        b.branches,
        STRUCT(
            qu.unified,
            o.orderers
        ) AS qualifications
        FROM {self.project_id}.{self.dataset_name}.partners_master pm
        LEFT JOIN categories c USING (partner_id)
        LEFT JOIN past_projects pp USING (partner_id)
        LEFT JOIN branches b USING (partner_id)
        LEFT JOIN qual_unified qu USING (partner_id)
        LEFT JOIN orderers o USING (partner_id)
        """
        self.client.query(sql).result()


class DBOperatorSQLITE3(DBOperator):
    """
    sqlite3 を操作するクラス。
    """

    def any_query(self, sql):
        df = pd.read_sql_query(sql, self.conn)
        return df

    def ifTableExists(self, tablename):
        sql = """
        SELECT name FROM sqlite_master WHERE type='table'
        """
        df = pd.read_sql_query(sql, self.conn)
        df = df[df["name"] == tablename]

        if df.shape[0] == 1:
            return True
        return False

    def dropTable(self, tablename):
        self.cur.execute(fr"DROP TABLE IF EXISTS {tablename}")

    def uploadDataToTable(self, data, tablename, chunksize=1):
        data.to_sql(tablename, self.conn, if_exists="replace", index=False, chunksize=chunksize)

    def selectToTable(self, tablename, where_clause=""):
        sql = fr"SELECT * FROM {tablename} {where_clause}"
        ret = pd.read_sql_query(sql, self.conn)
        return ret

    def createBidAnnouncements(self, bid_announcements_tablename):
        sql = fr"""
        create table {bid_announcements_tablename} (
        announcement_no integer PRIMARY KEY,
        workName string,
        userAnnNo integer,
        topAgencyNo integer,
        topAgencyName string,
        subAgencyNo integer,
        subAgencyName string,
        workPlace string,
        pdfUrl string,
        zipcode string,
        address string,
        department string,
        assigneeName string,
        telephone string,
        fax string,
        mail string,
        publishDate string,
        docDistStart string,
        docDistEnd string,
        submissionStart string,
        submissionEnd string,    
        bidStartDate string,
        bidEndDate string,
        doneOCR bool,
        remarks string, 
        createdDate string,
        updatedDate string
        )
        """
        self.cur.execute(sql)

    def createBidAnnouncementsV2(self, bid_announcements_tablename):
        sql = fr"""
        create table {bid_announcements_tablename} (
        announcement_no integer PRIMARY KEY,
        workName string,
        userAnnNo integer,
        topAgencyNo integer,
        topAgencyName string,
        subAgencyNo integer,
        subAgencyName string,
        workPlace string,

        pdfUrl string,
        pdfUrl2 string,
        pdfUrl3 string,
        pdfUrl4 string,
        pdfUrl5 string,

        pdfUrl_type string,
        pdfUrl2_type string,
        pdfUrl3_type string,
        pdfUrl4_type string,
        pdfUrl5_type string,

        document_id string,
        document_id2 string,
        document_id3 string,
        document_id4 string,
        document_id5 string,

        zipcode string,
        address string,
        department string,
        assigneeName string,
        telephone string,
        fax string,
        mail string,

        publishDate string,
        docDistStart string,
        docDistEnd string,
        submissionStart string,
        submissionEnd string,    
        bidStartDate string,
        bidEndDate string,

        doneOCR bool,
        remarks string, 
        createdDate string,
        updatedDate string,

        orderer_id string,
        category string,
        bidType string
        )
        """
        self.cur.execute(sql)


    def createBidOrderersFromAnnouncements(self, bid_orderer_tablename, bid_announcements_tablename):
        sql = fr"""
        create table {bid_orderer_tablename} as 
        select
        a.orderer_id,
        row_number() over() as `no`,
        a.name,
        a.category,
        a.address,
        a.phone,
        a.fax,
        a.email,
        a.departments,
        a.announcementCount,
        a.awardCount,
        a.averageAmount,
        a.lastAnnouncementDate
        from (
            select
            orderer_id,
            orderer_id as name,
            'unknown' as category,
            'unknown' as address,
            'unknown' as phone,
            'unknown' as fax,
            'unknown' as email,
            'unknown' as departments,
            count(*) as announcementCount,
            0 as awardCount,
            0 as averageAmount,
            min(updatedDate) as lastAnnouncementDate
            from {bid_announcements_tablename}
            group by
            orderer_id
        ) a
        """
        self.cur.execute(sql)


    def createBidRequirements(self, bid_requirements_tablename):
        sql = fr"""
        create table {bid_requirements_tablename} (
        requirement_no integer,
        announcement_no integer,
        requirement_type string,
        requirement_text string,
        done_judgement bool,
        createdDate string,
        updatedDate string,
        UNIQUE(announcement_no, requirement_no, requirement_type)
        )
        """
        self.cur.execute(sql)


    def transferAnnouncements(self, bid_announcements_tablename, bid_announcements_pre_tablename):
        sql = fr"""
        INSERT INTO {bid_announcements_tablename} (
            announcement_no,
            workName,
            userAnnNo,
            topAgencyNo,
            topAgencyName,
            subAgencyNo,
            subAgencyName,
            workPlace,
            pdfUrl,
            zipcode,
            address,
            department,
            assigneeName,
            telephone,
            fax,
            mail,
            publishDate,
            docDistStart,
            docDistEnd,
            submissionStart,
            submissionEnd,
            bidStartDate,
            bidEndDate,
            doneOCR,
            remarks, 
            createdDate,
            updatedDate
            )
        WITH maxval AS (
            SELECT IFNULL(MAX(announcement_no), 0) AS maxno FROM {bid_announcements_tablename}
        ), 
        to_insert AS (
        SELECT
            ROW_NUMBER() OVER (ORDER BY tbl_pre.pdfurl) AS rn,
            tbl_pre.workName,
            tbl_pre.userAnnNo,
            NULL AS topAgencyNo,
            tbl_pre.topAgencyName,
            NULL AS subAgencyNo,
            tbl_pre.subAgencyName,
            NULL as workPlace,
            tbl_pre.pdfUrl,
            NULL as zipcode,
            NULL as addres,
            NULL as department,
            NULL as assigneeName,
            NULL as telephone,
            NULL as fax,
            NULL as mail,
            tbl_pre.publishDate,
            NULL as docDistStart,
            tbl_pre.docDistEnd,
            NULL as submissionStart,
            tbl_pre.submissionEnd,
            NULL as bidStartDate,
            tbl_pre.bidEndDate,
            FALSE AS doneOCR,
            tbl_pre.remarks,
            strftime('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP) AS createdDate,
            strftime('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP) AS updatedDate
        FROM {bid_announcements_pre_tablename} AS tbl_pre
        LEFT JOIN {bid_announcements_tablename} AS tbl
            ON tbl_pre.pdfurl = tbl.pdfurl
        WHERE tbl.pdfurl IS NULL
        )
        SELECT 
        rn + maxno,
        workName,
        userAnnNo,
        topAgencyNo,
        topAgencyName,
        subAgencyNo,
        subAgencyName,
        workPlace,
        pdfUrl,
        zipcode,
        addres,
        department,
        assigneeName,
        telephone,
        fax,
        mail,
        publishDate,
        docDistStart,
        docDistEnd,
        submissionStart,
        submissionEnd,
        bidStartDate,
        bidEndDate,
        doneOCR,
        remarks,
        createdDate,
        updatedDate
        FROM to_insert, maxval
        """
        # FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP())
        # -> strftime('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP)
        self.cur.execute(sql)


    def transferAnnouncementsV2(self, bid_announcements_tablename, bid_announcements_documents_tablename):
        sql = fr"""
        WITH ordered AS (
            SELECT
                ad.*,
                ROW_NUMBER() OVER (
                    PARTITION BY ad.announcement_id
                    ORDER BY ad.document_id
                ) AS rn
            FROM {bid_announcements_documents_tablename} ad
        )
        INSERT INTO {bid_announcements_tablename} (
            announcement_no,
            workName,

            topAgencyName,

            pdfUrl, pdfUrl_type, document_id,
            pdfUrl2, pdfUrl2_type, document_id2,
            pdfUrl3, pdfUrl3_type, document_id3,
            pdfUrl4, pdfUrl4_type, document_id4,
            pdfUrl5, pdfUrl5_type, document_id5,

            doneOCR,
            createdDate,
            updatedDate,

            orderer_id,
            category,
            bidType
        )
        SELECT
            o.announcement_id,
            MAX(CASE WHEN o.rn = 1 THEN o.title END) AS workName,

            MAX(CASE WHEN o.rn = 1 THEN o.topAgencyName END) AS topAgencyName,

            MAX(CASE WHEN o.rn = 1 THEN o.url END) AS pdfUrl,
            MAX(CASE WHEN o.rn = 1 THEN o.type END) AS pdfUrl_type,
            MAX(CASE WHEN o.rn = 1 THEN o.document_id END) AS document_id,
            MAX(CASE WHEN o.rn = 2 THEN o.url END) AS pdfUrl2,
            MAX(CASE WHEN o.rn = 2 THEN o.type END) AS pdfUrl2_type,
            MAX(CASE WHEN o.rn = 2 THEN o.document_id END) AS document_id2,
            MAX(CASE WHEN o.rn = 3 THEN o.url END) AS pdfUrl3,
            MAX(CASE WHEN o.rn = 3 THEN o.type END) AS pdfUrl3_type,
            MAX(CASE WHEN o.rn = 3 THEN o.document_id END) AS document_id3,
            MAX(CASE WHEN o.rn = 4 THEN o.url END) AS pdfUrl4,
            MAX(CASE WHEN o.rn = 4 THEN o.type END) AS pdfUrl4_type,
            MAX(CASE WHEN o.rn = 4 THEN o.document_id END) AS document_id4,
            MAX(CASE WHEN o.rn = 5 THEN o.url END) AS pdfUrl5,
            MAX(CASE WHEN o.rn = 5 THEN o.type END) AS pdfUrl5_type,
            MAX(CASE WHEN o.rn = 5 THEN o.document_id END) AS document_id5,

            0 AS doneOCR,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,

            MAX(CASE WHEN o.rn = 1 THEN o.orderer_id END) AS orderer_id,
            MAX(CASE WHEN o.rn = 1 THEN o.category END) AS category,
            MAX(CASE WHEN o.rn = 1 THEN o.bidType END) AS bidType
        FROM ordered o
        WHERE NOT EXISTS (
            SELECT 1
            FROM {bid_announcements_tablename} b
            WHERE b.announcement_no = o.announcement_id
        )
        GROUP BY o.announcement_id
        """
        self.cur.execute(sql)


    def updateAnnouncements(self, bid_announcements_tablename, bid_announcements_tablename_for_update):
        sql = fr"""insert into {bid_announcements_tablename} (
            announcement_no,
            workName,
            userAnnNo,
            topAgencyNo,
            topAgencyName,
            subAgencyNo,
            subAgencyName,
            workPlace,
            pdfUrl,
            zipcode,
            address,
            department,
            assigneeName,
            telephone,
            fax,
            mail,
            publishDate,
            docDistStart,
            docDistEnd,
            submissionStart,
            submissionEnd,
            bidStartDate,
            bidEndDate,
            doneOCR,
            remarks, 
            createdDate,
            updatedDate
        )
        select 
        announcement_no,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        workplace,
        NULL,
        zipcode,
        address,
        department,
        assigneename,
        telephone,
        fax,
        mail,
        publishdate,
        docdiststart,
        docdistend,
        submissionstart,
        submissionend,
        bidstartdate,
        bidenddate,
        NULL,
        NULL,
        NULL,
        NULL
        from {bid_announcements_tablename_for_update} source where true
        ON CONFLICT(announcement_no) DO UPDATE SET
            announcement_no = {bid_announcements_tablename}.announcement_no,
            workname = {bid_announcements_tablename}.workname,
            userAnnNo = {bid_announcements_tablename}.userannno,
            topAgencyNo = {bid_announcements_tablename}.topagencyno,
            topAgencyName = {bid_announcements_tablename}.topagencyname,
            subAgencyNo = {bid_announcements_tablename}.subagencyno,
            subAgencyName = {bid_announcements_tablename}.subagencyname,
            workplace = excluded.workplace,
            pdfUrl = {bid_announcements_tablename}.pdfurl,
            zipcode = excluded.zipcode,
            address = excluded.address,
            department = excluded.department,
            assigneename = excluded.assigneename,
            telephone = excluded.telephone,
            fax = excluded.fax,
            mail = excluded.mail,
            publishDate = excluded.publishDate,
            docdiststart = excluded.docdiststart,
            docdistend = excluded.docdistend,
            submissionstart = excluded.submissionstart,
            submissionend = excluded.submissionend,
            bidstartdate = excluded.bidstartdate,
            bidenddate = excluded.bidenddate,
            doneocr = TRUE,
            remarks = {bid_announcements_tablename}.remarks, 
            createdDate = {bid_announcements_tablename}.createddate,
            updatedDate = {bid_announcements_tablename}.updateddate
        """
        self.cur.execute(sql)

    def updateRequirements(self, bid_requirements_tablename, bid_requirements_tablename_for_update):
        sql = fr"""insert into {bid_requirements_tablename} (
            requirement_no,
            announcement_no,
            requirement_type,
            requirement_text,
            done_judgement,
            createdDate,
            updatedDate
        )
        select 
        requirement_no,
        announcement_no,
        requirement_type,
        requirement_text,
        0,
        createdDate,
        updatedDate
        from {bid_requirements_tablename_for_update} source where true
        ON CONFLICT(announcement_no, requirement_no, requirement_type) DO UPDATE SET
            announcement_no = excluded.announcement_no,
            requirement_no = excluded.requirement_no,
            requirement_type = excluded.requirement_type,
            requirement_text = excluded.requirement_text,
            createdDate = excluded.createddate,
            updatedDate = excluded.updateddate
        """
        self.cur.execute(sql)

    def getMaxOfColumn(self, tablename, column_name):
        sql = fr"SELECT max({column_name}) FROM {tablename}"
        ret = pd.read_sql_query(sql, self.conn)
        return ret

    def createCompanyBidJudgements(self, company_bid_judgement_tablename):
        sql = fr"""
        create table {company_bid_judgement_tablename} (
            evaluation_no text,
            announcement_no integer,
            company_no integer,
            office_no integer,
            requirement_ineligibility bool,
            requirement_grade_item bool,
            requirement_location bool,
            requirement_experience bool,
            requirement_technician bool,
            requirement_other bool,
            deficit_requirement_message string,
            final_status bool,
            message string,
            remarks string,
            createdDate string,
            updatedDate string,
            unique(evaluation_no, announcement_no, company_no, office_no)
        )
        """
        self.cur.execute(sql)

    def createSufficientRequirements(self, sufficient_requirements_tablename):
        sql = fr"""
        create table {sufficient_requirements_tablename} (
            sufficiency_detail_no text,
            evaluation_no text,
            announcement_no integer,
            requirement_no integer,
            company_no integer,
            office_no integer,
            requirement_type string,
            requirement_description string,
            createdDate string,
            updatedDate string,
            unique(sufficiency_detail_no, evaluation_no, announcement_no, requirement_no, company_no, office_no, requirement_type)
        )
        """
        self.cur.execute(sql)

    def createInsufficientRequirements(self, insufficient_requirements_tablename):
        sql = fr"""
        create table {insufficient_requirements_tablename} (
            shortage_detail_no text,
            evaluation_no text,
            announcement_no integer,
            requirement_no integer,
            company_no integer,
            office_no integer,
            requirement_type string,
            requirement_description string,
            suggestions_for_improvement string,
            final_comment string,
            createdDate string,
            updatedDate string,
            unique(shortage_detail_no, evaluation_no, announcement_no, requirement_no, company_no, office_no, requirement_type)
        )
        """                
        self.cur.execute(sql)

    def preupdateCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        sql = fr"""insert into {company_bid_judgement_tablename} (
            evaluation_no, 
            announcement_no,
            company_no,
            office_no,
            requirement_ineligibility,
            requirement_grade_item,
            requirement_location,
            requirement_experience,
            requirement_technician,
            requirement_other,
            deficit_requirement_message,
            final_status,
            message,
            remarks,
            createdDate,
            updatedDate
        )
        select 
        NULL,
        a.announcement_no,
        b.company_no,
        b.office_no,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
        from {bid_announcements_tablename} as a 
        cross join 
        {office_master_tablename} as b
        where true
        ON CONFLICT(evaluation_no, announcement_no, company_no, office_no) DO NOTHING
        """
        self.cur.execute(sql)

    def preselectCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        sql = fr"""
        select
        x.announcement_no,
        x.company_no,
        x.office_no
        from 
        (
            select 
            a.announcement_no,
            b.company_no,
            b.office_no
            from {bid_announcements_tablename} as a 
            cross join 
            {office_master_tablename} as b
        ) x
        left outer join {company_bid_judgement_tablename} y
        ON 
        x.announcement_no = y.announcement_no
        and x.company_no = y.company_no
        and x.office_no = y.office_no
        where y.announcement_no is null
        """
        ret = pd.read_sql_query(sql, self.conn)
        return ret

    def updateCompanyBidJudgement(self, company_bid_judgement_tablename, company_bid_judgement_tablename_for_update):
        sql = fr"""insert into {company_bid_judgement_tablename} (
            evaluation_no,
            announcement_no,
            company_no,
            office_no,
            requirement_ineligibility,
            requirement_grade_item,
            requirement_location,
            requirement_experience,
            requirement_technician,
            requirement_other,
            deficit_requirement_message,
            final_status,
            message,
            remarks,
            createdDate,
            updatedDate
        ) 
        select 
            evaluation_no,
            announcement_no,
            company_no,
            office_no,
            requirement_ineligibility,
            requirement_grade_item,
            requirement_location,
            requirement_experience,
            requirement_technician,
            requirement_other,
            deficit_requirement_message,
            final_status,
            message,
            remarks,
            createdDate,
            updatedDate
        from {company_bid_judgement_tablename_for_update} where true
        ON CONFLICT(evaluation_no, announcement_no, company_no, office_no) 
        DO NOTHING
        """
        self.cur.execute(sql)

    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        sql = fr"""insert into {sufficient_requirements_tablename} (
            sufficiency_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            createdDate,
            updatedDate
        )
        select
            sufficiency_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            createdDate,
            updatedDate                    
        from {sufficient_requirements_tablename_for_update} where true
        ON CONFLICT(sufficiency_detail_no, evaluation_no, announcement_no, requirement_no, company_no, office_no, requirement_type) 
        DO UPDATE SET
            sufficiency_detail_no = {sufficient_requirements_tablename}.sufficiency_detail_no,
            evaluation_no = {sufficient_requirements_tablename}.evaluation_no,
            announcement_no = {sufficient_requirements_tablename}.announcement_no,
            requirement_no = {sufficient_requirements_tablename}.requirement_no,
            company_no = {sufficient_requirements_tablename}.company_no,
            office_no = {sufficient_requirements_tablename}.office_no,
            requirement_type = excluded.requirement_type,
            requirement_description = excluded.requirement_description,
            createdDate = excluded.createdDate,
            updatedDate = excluded.updatedDate
        """
        self.cur.execute(sql)

    def updateInsufficientRequirements(self, insufficient_requirements_tablename, insufficient_requirements_tablename_for_update):
        sql = fr"""insert into {insufficient_requirements_tablename} (
            shortage_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            suggestions_for_improvement,
            final_comment,
            createdDate,
            updatedDate
        )
        select
            shortage_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            suggestions_for_improvement,
            final_comment,
            createdDate,
            updatedDate
        from {insufficient_requirements_tablename_for_update} where true
        ON CONFLICT(shortage_detail_no, evaluation_no, announcement_no, requirement_no, company_no, office_no, requirement_type) 
        DO UPDATE SET
            shortage_detail_no = {insufficient_requirements_tablename}.shortage_detail_no,
            evaluation_no = {insufficient_requirements_tablename}.evaluation_no,
            announcement_no = {insufficient_requirements_tablename}.announcement_no,
            requirement_no = {insufficient_requirements_tablename}.requirement_no,
            company_no = {insufficient_requirements_tablename}.company_no,
            office_no = {insufficient_requirements_tablename}.office_no,
            requirement_type = excluded.requirement_type,
            requirement_description = excluded.requirement_description,
            suggestions_for_improvement = excluded.suggestions_for_improvement,
            final_comment = excluded.final_comment,
            createdDate = excluded.createdDate,
            updatedDate = excluded.updatedDate
        """
        self.cur.execute(sql)

    def createBackendAnnouncements(self, tablename):
        raise NotImplementedError

    def createBackendEvaluations(self, tablename):
        raise NotImplementedError

    def createBackendCompanies(self, tablename):
        raise NotImplementedError

    def createBackendOrderers(self, tablename):
        raise NotImplementedError

    def createBackendPartners(self, tablename):
        raise NotImplementedError


def _process_judgement_chunk(args):
    """
    チャンク単位で要件判定を処理（multiprocessing用グローバル関数）

    Args:
        args: タプル (df_chunk, req_df_map, master_data_dict)

    Returns:
        dict: 処理結果（judgement_list, sufficient_list, insufficient_list）
    """
    df_chunk, req_df_map, master_data_dict = args

    # マスターデータを取り出し
    master_data_company = master_data_dict['company']
    master_data_office = master_data_dict['office']
    master_data_office_registration_authorization = master_data_dict['office_registration_authorization']
    master_data_office_registration_authorization_with_converter = master_data_dict['office_registration_authorization_with_converter']
    master_data_agency = master_data_dict['agency']
    master_data_construction = master_data_dict['construction']
    master_data_office_work_achivements = master_data_dict['office_work_achivements']
    master_data_employee = master_data_dict['employee']
    master_data_employee_qualification = master_data_dict['employee_qualification']
    master_data_technician_qualification = master_data_dict['technician_qualification']
    master_data_employee_experience = master_data_dict['employee_experience']

    # requirements モジュールの関数をimport（ワーカープロセス内で確実に利用可能にする）
    try:
        from source.bid_announcement_judgement_tools.requirements.ineligibility import checkIneligibilityDynamic
        from source.bid_announcement_judgement_tools.requirements.experience import checkExperienceRequirement
        from source.bid_announcement_judgement_tools.requirements.location import checkLocationRequirement
        from source.bid_announcement_judgement_tools.requirements.grade_item import checkGradeAndItemRequirement
        from source.bid_announcement_judgement_tools.requirements.technician import checkTechnicianRequirement
    except ModuleNotFoundError:
        from requirements.ineligibility import checkIneligibilityDynamic
        from requirements.experience import checkExperienceRequirement
        from requirements.location import checkLocationRequirement
        from requirements.grade_item import checkGradeAndItemRequirement
        from requirements.technician import checkTechnicianRequirement

    result_judgement_list = []
    result_sufficient_requirements_list = []
    result_insufficient_requirements_list = []

    # チャンク内の各行を処理
    for row1 in df_chunk.itertuples():
        announcement_no = row1.announcement_no
        company_no = row1.company_no
        office_no = row1.office_no
        tmp_result_judgement_list = []

        req_df = req_df_map.get(announcement_no)

        if req_df is None or req_df.shape[0] == 0:
            print(f"   announcement_no={announcement_no}: No requirement found. Skip anyway.")
            continue

        # UUIDを生成
        evaluation_no = str(uuid.uuid4())

        for row2 in req_df.itertuples():
            requirement_type = row2.requirement_type
            requirement_text = row2.requirement_text
            requirement_no = row2.requirement_no

            if requirement_type == "欠格要件":
                val = checkIneligibilityDynamic(
                    requirementText=requirement_text,
                    companyNo=company_no,
                    officeNo=office_no,
                    company_data=master_data_company,
                    office_registration_authorization_data=master_data_office_registration_authorization
                )
            elif requirement_type == "業種・等級要件":
                val = checkGradeAndItemRequirement(
                    requirementText=requirement_text,
                    officeNo=office_no,
                    licenseData=master_data_office_registration_authorization_with_converter,
                    agencyData=master_data_agency,
                    constructionData=master_data_construction
                )
            elif requirement_type == "所在地要件":
                val = checkLocationRequirement(
                    requirementText=requirement_text,
                    officeNo=office_no,
                    agencyData=master_data_agency,
                    officeData=master_data_office
                )
            elif requirement_type == "実績要件":
                val = checkExperienceRequirement(
                    requirementText=requirement_text,
                    officeNo=office_no,
                    office_experience_data=master_data_office_work_achivements,
                    agency_data=master_data_agency,
                    construction_data=master_data_construction
                )
            elif requirement_type == "技術者要件":
                val = checkTechnicianRequirement(
                    requirementText=requirement_text,
                    companyNo=company_no,
                    officeNo=office_no,
                    employeeData=master_data_employee,
                    qualData=master_data_employee_qualification,
                    qualMasterData=master_data_technician_qualification,
                    expData=master_data_employee_experience
                )
            else:
                val = {"is_ok":False, "reason":"その他要件があります。確認してください"}

            tmp_result_judgement_list.append({
                "evaluation_no":evaluation_no,
                "requirement_no":requirement_no,
                "company_no":company_no,
                "office_no":office_no,
                "requirementType":requirement_type,
                "is_ok":val["is_ok"],
                "result":val["reason"]
            })

            if val["is_ok"]:
                result_sufficient_requirements_list.append({
                    "sufficiency_detail_no":str(uuid.uuid4()),
                    "evaluation_no":evaluation_no,
                    "announcement_no":announcement_no,
                    "requirement_no":requirement_no,
                    "company_no":company_no,
                    "office_no":office_no,
                    "requirement_type":requirement_type,
                    "requirement_description":val["reason"],
                    "createdDate":datetime.now(),
                    "updatedDate":datetime.now()
                })
            else:
                result_insufficient_requirements_list.append({
                    "shortage_detail_no":str(uuid.uuid4()),
                    "evaluation_no":evaluation_no,
                    "announcement_no":announcement_no,
                    "requirement_no":requirement_no,
                    "company_no":company_no,
                    "office_no":office_no,
                    "requirement_type":requirement_type,
                    "requirement_description":val["reason"],
                    "suggestions_for_improvement":"",
                    "final_comment":"",
                    "createdDate":datetime.now(),
                    "updatedDate":datetime.now()
                })

        # サマリー化
        tmp_result_judgement_df = pd.DataFrame(tmp_result_judgement_list)

        checked_requirement = {
            "evaluation_no":evaluation_no,
            "announcement_no":announcement_no,
            "company_no":company_no,
            "office_no":office_no,
            "requirement_ineligibility":True,
            "requirement_grade_item":True,
            "requirement_location":True,
            "requirement_experience":True,
            "requirement_technician":True,
            "requirement_other":True,
            "deficit_requirement_message":"",
            "final_status":True,
            "message":"",
            "remarks":"",
            "createdDate":datetime.now(),
            "updatedDate":datetime.now()
        }
        requirement_type_map = {
            "欠格要件":"requirement_ineligibility",
            "業種・等級要件":"requirement_grade_item",
            "所在地要件":"requirement_location",
            "実績要件":"requirement_experience",
            "技術者要件":"requirement_technician"
        }

        is_ok_false = tmp_result_judgement_df[~tmp_result_judgement_df["is_ok"]]

        if is_ok_false.shape[0] > 0:
            ng_req_types = is_ok_false["requirementType"].unique()
            for type_ in ng_req_types:
                type_name = requirement_type_map.get(type_, "requirement_other")
                checked_requirement[type_name] = False
                is_ok_false_type = is_ok_false[is_ok_false["requirementType"] == type_]
                result_values = is_ok_false_type["result"].str.replace(rf"{type_}[:：]", "", regex=True).unique()
                result_values = "[" + type_ + "]" + "|".join(result_values)

                if checked_requirement["deficit_requirement_message"] == "":
                    checked_requirement["deficit_requirement_message"] = result_values
                else:
                    checked_requirement["deficit_requirement_message"] = checked_requirement["deficit_requirement_message"] + " " + result_values
            checked_requirement["final_status"] = False

        result_judgement_list.append(checked_requirement)

    return {
        'judgement': result_judgement_list,
        'sufficient': result_sufficient_requirements_list,
        'insufficient': result_insufficient_requirements_list
    }


class BidJudgementSan:
    """
    以下のステップを踏み、公告判定処理を行う。

    - step0 : 判定前公告表アップロード
    - step1 : 転写処理

      公告マスターが無ければ公告マスターを作成する。要件マスターが無ければ要件マスターを作成する。
        
      判定前公告を公告マスターにコピーする。

    - step2 : OCR処理
    
      公告pdfに対してOCRを行い、公告マスターと要件マスターを更新する。

    - step3 : 要件判定処理
    
      企業 x 拠点 x 要件の全組み合わせに対して要件判定し結果を企業公告判定マスターに格納する。

      また、充足要件マスターと不足要件マスターを作成する。

    Attributes:

    - bid_announcements_pre_file: 
    
      判定前公告一覧表のローカルファイル。

    - tablenamesconfig:
    
      TablenamesConfig オブジェクト。

    - db_operator:

      データベースを操作するためのオブジェクト。

    """

    def __init__(self, bid_announcements_pre_file, tablenamesconfig=None, db_operator=None):
        self.bid_announcements_pre_file = bid_announcements_pre_file
        self.tablenamesconfig = tablenamesconfig
        self.db_operator=db_operator


    def step0_prepare_documents(
        self,
        input_list_file,
        output_base_dir="bid_announcement_judgement_tools/output",
        timestamp=None,
        topAgencyName="防衛省",
        extracted_at=None,
        base_digits=5,
        no_merge=False,
        use_gcp_vm=False,
        do_fetch_html=True,
        do_extract_links=True,
        do_format_documents=True,
        do_download_pdfs=True,
        do_count_pages=True,
        do_ocr=True,
        google_ai_studio_api_key_filepath="data/sec/google_ai_studio_api_key_mizu.txt",
        ocr_max_concurrency=5,
        ocr_max_api_calls_per_run=1000
    ):
        """
        step0 : 公告ドキュメント準備処理

        公告リストファイルから以下を実行：
        1. HTMLページ取得（オプション）
        2. ドキュメントリンク抽出（オプション）
        3. announcements_document_merged_updated.txt を生成（オプション）
        4. PDFダウンロード（オプション）
        5. PDFページ数カウント（オプション）
        6. Gemini OCR 実行（オプション）

        出力ディレクトリ構造：
            {timestamp}/
            ├── step0_html_DL/                  各公告HTMLダウンロード先
            │   └── {index}_{topAgencyName}_{subAgencyName}.html
            ├── step0_html_list/                リスト・リンク抽出結果
            │   ├── input_list_converted.txt
            │   ├── input_list_converted.html
            │   └── announcements_links.txt
            ├── announcements_document_merged_updated.txt
            └── req_announcements_document.txt  (OCR実行時)

        Args:
            input_list_file: リスト_防衛省入札_1.txt のパス
            output_base_dir: 出力ベースディレクトリ
            timestamp: タイムスタンプ (YYYYMMDDHHMM形式)。Noneなら現在時刻
            topAgencyName: トップ機関名
            extracted_at: 抽出日 (YYYY-MM-DD形式)。Noneなら現在日付
            base_digits: announcement_id のグルーピング桁数
            no_merge: 過去の結果とマージしないフラグ
            use_gcp_vm: GCS (gs://) を使用する場合 True
            do_fetch_html: HTML ページを取得する場合 True
            do_extract_links: ドキュメントリンクを抽出する場合 True
            do_format_documents: ドキュメント情報をフォーマットする場合 True
            do_download_pdfs: PDF をダウンロードする場合 True
            do_count_pages: PDF のページ数をカウントする場合 True
            do_ocr: Gemini OCR を実行する場合 True
            google_ai_studio_api_key_filepath: Google AI Studio API キーファイルのパス
            ocr_max_concurrency: OCR 実行時の最大並列数
            ocr_max_api_calls_per_run: 1回の実行での最大API呼び出し数（デフォルト: 1000）

        Returns:
            str: 生成された announcements_document_merged_updated.txt のパス
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
        
        project_root = script_dir.parent.parent  # judgesystem/
        output_base = project_root / output_base_dir
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
                     (1 if do_count_pages else 0) + \
                     (1 if do_ocr else 0)
        step_num = 0

        # 1. HTML取得処理
        if do_fetch_html:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Fetching HTML pages...")
            input_list2_path = self._step0_convert_input_list(input_list_file, output_dir_html_list)
            self._step0_fetch_html_pages(input_list2_path, output_dir_html_DL, topAgencyName)
        else:
            print("\n[Skipped] Fetching HTML pages (using existing files)...")
            input_list2_path = output_dir_html_list / "input_list_converted.txt"
            if not Path(input_list2_path).exists():
                raise FileNotFoundError(f"Required file not found: {input_list2_path}")

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
            merged_updated_file = self._step0_format_documents(
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
            print("\n[Skipped] Formatting documents (using existing file)...")
            merged_updated_file = str(output_dir / "announcements_document_merged_updated.txt")
            if not Path(merged_updated_file).exists():
                raise FileNotFoundError(f"Required file not found: {merged_updated_file}")

        # 4. PDFダウンロード（オプション）
        if do_download_pdfs:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Downloading PDFs...")
            df = pd.read_csv(merged_updated_file, sep="\t")
            df = self._step0_download_pdfs(df, use_gcp_vm=use_gcp_vm)
            df.to_csv(merged_updated_file, sep="\t", index=False)
            print(f"Updated file with pdf_is_saved info: {merged_updated_file}")

        # 5. PDFページ数カウント（オプション）
        if do_count_pages:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Counting PDF pages...")
            df = pd.read_csv(merged_updated_file, sep="\t")
            df = self._step0_count_pages(df)
            df.to_csv(merged_updated_file, sep="\t", index=False)
            print(f"Updated file with pageCount info: {merged_updated_file}")

        # 6. Gemini OCR 実行（オプション）
        req_file_path = None
        if do_ocr:
            step_num += 1
            print(f"\n[{step_num}/{total_steps}] Running Gemini OCR...")
            req_file_path = str(output_dir / "req_announcements_document.txt")
            df, req_file_path = self._step0_ocr_with_gemini(
                merged_updated_file=merged_updated_file,
                req_file_path=req_file_path,
                use_gcp_vm=use_gcp_vm,
                google_ai_studio_api_key_filepath=google_ai_studio_api_key_filepath,
                max_concurrency=ocr_max_concurrency,
                max_api_calls_per_run=ocr_max_api_calls_per_run
            )
            # 保存は _step0_ocr_with_gemini 内部で行われる
            print(f"OCR completed. Updated file: {merged_updated_file}")
            if req_file_path:
                print(f"Requirements file: {req_file_path}")
        else:
            print("\n[Skipped] Running Gemini OCR (using existing files)...")
            # OCR結果ファイルの確認
            req_file_path = str(output_dir / "req_announcements_document.txt")
            if Path(req_file_path).exists():
                print(f"Found existing requirements file: {req_file_path}")
            else:
                print(f"Warning: Requirements file not found: {req_file_path}")
                req_file_path = None
            # merged_updated_file は既にステップ3で作成されているはず
            # OCRによる更新がスキップされただけなので、ファイルは存在する

        print("=" * 60)
        print(f"Step0 completed successfully!")
        print(f"Output file: {merged_updated_file}")
        if req_file_path:
            print(f"Requirements file: {req_file_path}")
        print("=" * 60)

        return merged_updated_file


    def _step0_convert_input_list(self, input_list1, output_dir):
        """
        入力リストファイルを変換（TinyURL展開など）

        Args:
            input_list1: 元のリストファイルパス
            output_dir: 出力ディレクトリ（step0_html_list）

        Returns:
            str: 変換後のリストファイルパス
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

        Args:
            input_list_file: 変換済みリストファイル
            output_dir_html: HTML出力ディレクトリ（step0_html_DL）
            topAgencyName: トップ機関名
        """
        df = pd.read_csv(input_list_file, sep="\t")

        # 入札公告（現在募集中）2列を使用
        target_column = "入札公告（現在募集中）2" if "入札公告（現在募集中）2" in df.columns else "入札公告（現在募集中）"

        fetch_count = 0
        skip_count = 0

        for i, row in tqdm(df.iterrows(), total=len(df), desc="Fetching HTML"):
            target_index = row["index"]
            subAgencyName = row.get("Unnamed: 0", "unknown")
            target_url = row[target_column]

            output_file = f"{target_index:05d}_{topAgencyName}_{subAgencyName}.html"
            output_path = output_dir_html / output_file

            # 既に存在する場合はスキップ
            if output_path.exists():
                skip_count += 1
                continue

            # URLチェック
            if not isinstance(target_url, str) or not target_url.startswith("https"):
                skip_count += 1
                continue

            if target_url.endswith(".pdf"):
                skip_count += 1
                continue

            time.sleep(1)

            try:
                html_content = self._fetch_html_content(target_url)
                if html_content:
                    with open(output_path, "w", encoding="utf-8") as f:
                        f.write(html_content)
                    fetch_count += 1
            except Exception as e:
                tqdm.write(f"Error fetching index={target_index}: {e}")
                skip_count += 1

        print(f"HTML fetch completed: {fetch_count} fetched, {skip_count} skipped")


    def _fetch_html_content(self, target_url):
        """
        指定URLからHTMLコンテンツを取得・クリーニング

        Args:
            target_url: 取得するURL

        Returns:
            str: クリーニング済みHTML、またはNone
        """
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36",
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp",
            "Connection": "keep-alive",
        }

        # TinyURL処理
        if target_url.startswith("https://tinyurl.com"):
            response = requests.head(target_url, allow_redirects=True)
            if response.url.startswith("https://tinyurl.com") or response.url.endswith(".pdf"):
                return None
            target_url = response.url

        response = requests.get(url=target_url, headers=headers)
        soup = BeautifulSoup(response.text, "html.parser")

        # エンコーディング判定
        charset = None
        meta = soup.find("meta", attrs={"charset": True})
        if meta:
            charset = meta["charset"]
        else:
            meta = soup.find("meta", attrs={"http-equiv": "Content-Type"})
            if meta and "charset=" in meta.get("content", ""):
                charset = meta["content"]

        # エンコーディング推測
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
            # スコアベースで判定
            enc_list = list(set([i.lower() for i in [response.encoding, response.apparent_encoding, "shift_jis", "utf-8"]]))
            score_list = []
            for enc in enc_list:
                response.encoding = enc
                soup = BeautifulSoup(response.text, "html.parser")
                score = badness(response.text)
                score_list.append(score)
            charset_guess = enc_list[score_list.index(min(score_list))]
            response.encoding = charset_guess

        # 再度BeautifulSoupで処理
        soup = BeautifulSoup(response.text, "html.parser")

        # クリーニング
        for tag in soup(["script", "style"]):
            tag.decompose()

        for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
            comment.extract()

        html = str(soup)
        # 空白の正規化
        html = re.sub(r"\s+", " ", html)
        html = html.strip()

        return html


    def _step0_extract_links(self, input_dir_html, output_dir_links):
        """
        HTMLファイルから公告ドキュメントのリンクを抽出

        Args:
            input_dir_html: HTML入力ディレクトリ（step0_html_DL）
            output_dir_links: リンク出力ディレクトリ（step0_html_list）

        Returns:
            str: 生成されたリンクファイルパス
        """
        output_file = output_dir_links / "announcements_links.txt"

        html_files = sorted(Path(input_dir_html).glob('*.html'))

        if not html_files:
            raise FileNotFoundError(f"No HTML files found in {input_dir_html}")

        print(f"Found {len(html_files)} HTML files")

        # 出力ファイルを開く
        with open(output_file, 'w', encoding='utf-8') as out_f:
            # ヘッダー
            out_f.write("target_link\tpre_announcement_id\tannouncement_name\tlink_text\tpdf_link\n")

            total_announcements = 0
            total_links = 0

            for html_file in tqdm(html_files, desc="Extracting links"):
                try:
                    announcements = self._extract_links_from_html(html_file)

                    file_links = 0
                    for announcement_id, announcement_name, row_links in announcements:
                        for link_text, pdf_link in row_links:
                            out_f.write(f"{html_file.name}\t{announcement_id}\t{announcement_name}\t{link_text}\t{pdf_link}\n")
                            file_links += 1

                    total_announcements += len(announcements)
                    total_links += file_links

                except Exception as e:
                    tqdm.write(f"Error processing {html_file.name}: {e}")
                    continue

        print(f"Link extraction completed: {total_announcements} announcements, {total_links} links")
        print(f"Output: {output_file}")

        return str(output_file)


    def _extract_links_from_html(self, html_file_path):
        """
        単一のHTMLファイルから公告リンクを抽出

        Args:
            html_file_path: HTMLファイルパス

        Returns:
            list: (announcement_id, announcement_name, [(link_text, pdf_link), ...])
        """
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        # 改行を削除して正規表現マッチを容易に
        html_content = re.sub(r'<([^>]+)\n', lambda m: '<' + m.group(1).replace('\n', ' '), html_content)

        # テーブル行を検索
        tr_pattern = r'<tr[^>]*>(.*?)</tr>'
        rows = re.findall(tr_pattern, html_content, re.DOTALL | re.IGNORECASE)

        announcements = []
        announcement_id = 1

        for row_content in rows:
            # 各行の<a>タグを検索
            a_pattern = r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>'
            links = re.findall(a_pattern, row_content, re.DOTALL | re.IGNORECASE)

            if not links:
                continue

            # ドキュメントを指すリンクをフィルタ
            doc_links = []
            for href, link_text in links:
                if re.search(r'\.(pdf|xlsx?|zip|docx?|txt)$', href, re.IGNORECASE):
                    # リンクテキストをクリーニング
                    clean_text = re.sub(r'<[^>]+>', '', link_text)
                    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                    doc_links.append((href, clean_text))

            if not doc_links:
                continue

            # 最初のリンクのテキストを公告名として使用
            announcement_name = doc_links[0][1]

            # すべてのリンクを収集
            row_links = []
            for href, link_text in doc_links:
                row_links.append((link_text, href))

            announcements.append((announcement_id, announcement_name, row_links))
            announcement_id += 1

        return announcements


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
        ドキュメント情報をフォーマットし、最終的なファイルを生成

        Args:
            input_list2_path: 変換済みリストファイル
            links_file: リンク抽出ファイル
            output_dir: 出力ディレクトリ
            output_base: 出力ベースディレクトリ
            timestamp: タイムスタンプ
            extracted_at: 抽出日
            base_digits: グルーピング桁数
            no_merge: マージ無効フラグ
            topAgencyName: トップ機関名

        Returns:
            str: 生成された announcements_document_merged_updated.txt のパス
        """
        # 入力ファイル読み込み
        df1 = pd.read_csv(input_list2_path, sep="\t")
        df2 = pd.read_csv(links_file, sep="\t", quoting=csv.QUOTE_NONE)

        # クォート削除
        df2["announcement_name"] = df2["announcement_name"].str.replace('"', '', regex=False)
        df2["link_text"] = df2["link_text"].str.replace('"', '', regex=False)

        # target_link から index 取得
        df2.insert(0, "index", df2["target_link"].str.split("_").str[0].astype(int))
        df2["adhoc_index"] = df2["target_link"].apply(lambda x: f"{int(x.split('_')[0]):05d}")

        # df1 から base_link 情報を取得
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

        # マージ
        df_merged = df2.merge(df1_sub, on="index", how="left")

        # PDF完全URLを生成
        df_merged["pdf_full_url"] = df_merged.apply(
            lambda row: urljoin(row["base_link_parent"] + "/", row["pdf_link"])
            if row["base_link_parent"] is not None else row["pdf_link"],
            axis=1
        )

        # announcement_id 生成
        df_merged["index"] = df_merged["index"] * 100000
        df_merged["announcement_id"] = df_merged["pre_announcement_id"] + df_merged["index"]

        # save_path と document_id 設定
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

        # https: で始まらないレコードを除外
        before_filter_count = len(df_merged)
        df_merged = df_merged[df_merged["pdf_full_url"].str.startswith("https:", na=False)].copy()
        after_filter_count = len(df_merged)
        excluded_count = before_filter_count - after_filter_count
        if excluded_count > 0:
            print(f"Excluded {excluded_count} records where pdf_full_url does not start with 'https:'")

        # 重複チェック
        tmpdf2 = df_merged.duplicated(subset=["link_text", "announcement_id", "document_id"])
        df_merged["dup"] = tmpdf2

        # 最終データフレーム作成
        ext = df_merged["pdf_full_url"].str.extract(r'\.([^.]+)$')[0].str.lower()
        df_new = pd.DataFrame({
            "announcement_id": df_merged["announcement_id"],
            "document_id": df_merged["document_id"],
            "type": [None] * df_merged.shape[0],
            "title": df_merged["link_text"],
            "fileFormat": ext.fillna(""),
            "pageCount": np.where(ext == "pdf", -1, -2),
            "extractedAt": [extracted_at] * df_merged.shape[0],
            "url": df_merged["pdf_full_url"],
            "content": ["dummy"] * df_merged.shape[0],
            "adhoc_index": df_merged["adhoc_index"],
            "base_link_parent": df_merged["base_link_parent"],
            "base_link": df_merged["base_link"],
            "dup": df_merged["dup"],
            "save_path": df_merged["save_path"],
            "pdf_is_saved": [None] * df_merged.shape[0],
            "pdf_is_saved_date": [None] * df_merged.shape[0],
            "orderer_id": [None] * df_merged.shape[0],
            "topAgencyName": [None] * df_merged.shape[0],
            "category": [None] * df_merged.shape[0],
            "bidType": [None] * df_merged.shape[0],
            "workplace": [None] * df_merged.shape[0],
            "zipcode": [None] * df_merged.shape[0],
            "address": [None] * df_merged.shape[0],
            "department": [None] * df_merged.shape[0],
            "assigneename": [None] * df_merged.shape[0],
            "telephone": [None] * df_merged.shape[0],
            "fax": [None] * df_merged.shape[0],
            "mail": [None] * df_merged.shape[0],
            "publishdate": [None] * df_merged.shape[0],
            "docdiststart": [None] * df_merged.shape[0],
            "docdistend": [None] * df_merged.shape[0],
            "submissionstart": [None] * df_merged.shape[0],
            "submissionend": [None] * df_merged.shape[0],
            "bidstartdate": [None] * df_merged.shape[0],
            "bidenddate": [None] * df_merged.shape[0],
            "done": [False] * df_merged.shape[0]
        })

        # ソート
        df_new["_sort_fileformat"] = df_new["fileFormat"].apply(lambda x: 0 if x == "pdf" else 1)
        df_new.sort_values(["announcement_id", "_sort_fileformat", "document_id"], inplace=True)
        df_new = df_new.drop(columns=["_sort_fileformat"])

        # 出力ファイルパス
        output_path1 = output_dir / "announcements_document.txt"
        merged_output_path = output_dir / "announcements_document_merged.txt"
        merged_updated_path = output_dir / "announcements_document_merged_updated.txt"

        # 今回実行分のみを保存
        df_new.to_csv(output_path1, sep="\t", index=False)
        print(f"Current output saved: {output_path1}")

        # 過去の結果とマージ
        if not no_merge:
            previous_file = self._find_previous_merged_file(output_base, timestamp)

            if previous_file:
                print(f"Merging with previous result: {previous_file}")
                df_merged_result = self._append_new_documents_by_group(
                    file1=previous_file,
                    file2=str(output_path1),
                    base_digits=base_digits
                )
                df_merged_result.to_csv(merged_output_path, sep="\t", index=False)
                print(f"Merged output saved: {merged_output_path}")
            else:
                print("No previous result found. Using current output as merged result.")
                df_new.to_csv(merged_output_path, sep="\t", index=False)
        else:
            print("Skipping merge (--no_merge specified)")
            df_new.to_csv(merged_output_path, sep="\t", index=False)

        # _merged_updated.txt を作成
        df_merged = pd.read_csv(merged_output_path, sep="\t")

        # orderer_id と topAgencyName を更新
        print("Updating orderer_id and topAgencyName...")
        ord = df1[["Unnamed: 0", "Unnamed: 1", "入札公告（現在募集中）2"]].copy()
        ord["orderer_id"] = topAgencyName + ord["Unnamed: 0"].astype(str) + ord["Unnamed: 1"].astype(str)
        mapping = dict(zip(ord["入札公告（現在募集中）2"], ord["orderer_id"]))
        df_merged["orderer_id"] = df_merged["base_link"].map(mapping)
        df_merged["topAgencyName"] = topAgencyName

        df_merged.to_csv(merged_updated_path, sep="\t", index=False)
        print(f"Final output saved: {merged_updated_path}")

        return str(merged_updated_path)


    def _find_previous_merged_file(self, output_base, current_timestamp):
        """
        過去の merged ファイルを検索

        優先順位:
        1. announcements_document_merged_updated.txt
        2. announcements_document_merged.txt
        3. announcements_document.txt
        """
        if not output_base.exists():
            return None

        # タイムスタンプディレクトリを取得（現在のディレクトリを除く）
        all_dirs = [d for d in output_base.iterdir() if d.is_dir() and d.name.isdigit()]
        all_dirs = [d for d in all_dirs if d.name != current_timestamp]

        if not all_dirs:
            return None

        # 最新のディレクトリを取得
        latest_dir = sorted(all_dirs, reverse=True)[0]

        # 優先順位で検索
        for filename in ["announcements_document_merged_updated.txt",
                        "announcements_document_merged.txt",
                        "announcements_document.txt"]:
            candidate = latest_dir / filename
            if candidate.exists():
                return str(candidate)

        return None


    def _append_new_documents_by_group(self, file1, file2, base_digits=5):
        """
        df1 に存在しない document_id を持つ df2 のレコードを追加する
        announcement_id は group ごとに再採番
        """
        df1 = pd.read_csv(file1, sep="\t", quoting=csv.QUOTE_NONE)
        df2 = pd.read_csv(file2, sep="\t", quoting=csv.QUOTE_NONE)

        df1 = df1.copy()
        df2 = df2.copy()

        divisor = 10 ** base_digits
        df1["announcement_group"] = df1["announcement_id"] // divisor
        df2["announcement_group"] = df2["announcement_id"] // divisor

        result_list = []

        for group in df2["announcement_group"].unique():
            df1_g = df1[df1["announcement_group"] == group]
            df2_g = df2[df2["announcement_group"] == group]

            if df2_g.empty:
                continue

            # df1 に存在しない document_id だけ抽出
            existing_docs = set(df1_g["document_id"])
            df2_new = df2_g[~df2_g["document_id"].isin(existing_docs)].copy()

            if df2_new.empty:
                continue

            # group ごとの最大 announcement_id を基準に再採番
            group_max_id = df1_g["announcement_id"].max() if not df1_g.empty else group * divisor
            new_id_counter = group_max_id

            # 元 announcement_id ごとに新IDを割り当て
            unique_old_ids = df2_new["announcement_id"].unique()
            id_map = {}
            for old_id in unique_old_ids:
                new_id_counter += 1
                id_map[old_id] = new_id_counter

            df2_new["announcement_id"] = df2_new["announcement_id"].map(id_map)
            result_list.append(df2_new)

        # 結合
        if result_list:
            df_append = pd.concat(result_list, ignore_index=True)
            final_df = pd.concat([df1, df_append], ignore_index=True)
        else:
            final_df = df1.copy()

        # helper列削除
        final_df = final_df.drop(columns=["announcement_group"])

        # ソート
        final_df["_sort_fileformat"] = final_df["fileFormat"].apply(lambda x: 0 if x == "pdf" else 1)
        final_df.sort_values(["announcement_id", "_sort_fileformat", "document_id"], inplace=True)
        final_df = final_df.drop(columns=["_sort_fileformat"])

        return final_df


    def _step0_download_pdfs(self, df, use_gcp_vm=False):
        """
        PDF を URL からダウンロードして保存

        Args:
            df: announcements_document DataFrame (url, save_path, pdf_is_saved columns必要)
            use_gcp_vm: True なら GCS (gs://) へ、False ならローカルへ保存

        Returns:
            pd.DataFrame: pdf_is_saved, pdf_is_saved_date が更新された DataFrame
        """
        # Sleep time parameters
        SLEEP_AFTER_REQUEST = 0.4
        SLEEP_ON_HTTP_ERROR = 0.4
        SLEEP_ON_REQUEST_ERROR = 0.4

        today_str = datetime.now().strftime("%Y-%m-%d")

        # GCS/local パスへの変換
        if use_gcp_vm:
            df["save_path"] = df["save_path"].apply(
                lambda x: x.replace("output/pdf/", "gs://ann-files/pdf/") if pd.notna(x) else x
            )
            print("Converted save_path to GCS format (gs://ann-files/pdf/...)")

        # Skip URLs
        pdf_requests_skip_urls = ["dummy"]

        # Check pdf_is_saved before downloading
        print("Check pdf_is_saved (before url_requests).")
        file_cache = {}

        for i, row in tqdm(df.iterrows(), total=len(df), desc="Checking existing PDFs"):
            p = row["save_path"]
            if p is None or pd.isna(p):
                df.loc[i, "pdf_is_saved"] = False
                continue

            if use_gcp_vm and p.startswith("gs://"):
                # GCS path
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
                # Local path
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

        # Download PDFs
        print("Save pdf by requests.")
        for i, row in tqdm(df.iterrows(), total=len(df), desc="Downloading PDFs"):
            pdfurl = row["url"]
            save_path = row["save_path"]

            if pdfurl is None or pd.isna(pdfurl):
                continue

            # Skip if file already exists
            if df.loc[i, "pdf_is_saved"] == True:
                continue

            # Create directory if it doesn't exist (local only)
            save_path_dirname = os.path.dirname(save_path)
            if not use_gcp_vm and not os.path.exists(save_path_dirname):
                os.makedirs(save_path_dirname, exist_ok=True)

            # Skip certain URLs
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
                    # Download PDF
                    response = requests.get(pdfurl, headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36",
                        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp",
                        "Connection": "keep-alive",
                    })
                    response.raise_for_status()
                except requests.exceptions.HTTPError as e:
                    tqdm.write(f"HTTP エラー: {pdfurl} -> {e}")
                    time.sleep(SLEEP_ON_HTTP_ERROR)
                    continue
                except requests.exceptions.RequestException as e:
                    tqdm.write(f"通信エラー: {pdfurl} -> {e}")
                    time.sleep(SLEEP_ON_REQUEST_ERROR)
                    continue

                try:
                    if use_gcp_vm and save_path.startswith("gs://"):
                        gcs_upload_from_bytes(save_path, response.content)
                        tqdm.write(fr"Saved {save_path}.")
                        df.loc[i, "pdf_is_saved"] = True
                    else:
                        Path(save_path).write_bytes(response.content)
                        tqdm.write(fr"Saved {save_path}.")
                        df.loc[i, "pdf_is_saved"] = True
                except Exception as e:
                    tqdm.write(str(e))

                # Sleep after successful request
                time.sleep(SLEEP_AFTER_REQUEST)

        return df


    def _step0_count_pages(self, df):
        """
        PDF のページ数をカウント

        Args:
            df: announcements_document DataFrame (save_path, pageCount columns必要)

        Returns:
            pd.DataFrame: pageCount が更新された DataFrame
        """
        print("pagecount.")
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
        print(f"pageCount status: {df['pageCount'].value_counts(dropna=False).to_dict()}")

        return df


    def _step0_ocr_with_gemini(
        self,
        merged_updated_file,
        req_file_path,
        use_gcp_vm=False,
        google_ai_studio_api_key_filepath=None,
        max_concurrency=5,
        max_api_calls_per_run=1000
    ):
        """
        Gemini APIを使用してPDFからOCR処理を実行

        Args:
            merged_updated_file: announcements_document_merged_updated.txt のパス
            req_file_path: 要件文ファイルのパス (req_announcements_document.txt)
            use_gcp_vm: GCS (gs://) を使用する場合 True
            google_ai_studio_api_key_filepath: Google AI Studio API key filepath
            max_concurrency: 並列実行数
            max_api_calls_per_run: 1回の実行での最大API呼び出し数（デフォルト: 1000）

        Returns:
            tuple: (df_main, req_file_path) 更新されたメインDataFrameと要件文ファイルパス
        """
        print("=" * 60)
        print("Step0-6: OCR with Gemini")
        print("=" * 60)

        # API key読み込み
        if google_ai_studio_api_key_filepath is None:
            raise ValueError("google_ai_studio_api_key_filepath is required for OCR processing")

        with open(google_ai_studio_api_key_filepath, "r") as f:
            api_key = f.read().strip()

        client = genai.Client(api_key=api_key)

        # DataFrameを読み込み
        df_main = pd.read_csv(merged_updated_file, sep="\t", low_memory=False)

        # done列の初期化
        if "done" not in df_main.columns:
            df_main["done"] = False

        # 要件文DataFrame初期化
        req_file_path = Path(req_file_path)
        if req_file_path.exists():
            df_req = pd.read_csv(req_file_path, sep="\t", low_memory=False, encoding="utf-8")
            # done列がなければ追加
            if "done" not in df_req.columns:
                df_req["done"] = False
        else:
            df_req = pd.DataFrame({
                "document_id": df_main["document_id"],
                "資格・条件": "['INIT']",
                "done": False
            })

        # df_reqを df_mainの順番に合わせる
        df_req = df_req.drop_duplicates(subset="document_id", keep="first")
        df_req_dict = df_req.set_index("document_id").to_dict("index")
        new_req_data = []
        for doc_id in df_main["document_id"]:
            if doc_id in df_req_dict:
                new_req_data.append(df_req_dict[doc_id])
            else:
                new_req_data.append({"資格・条件": "['INIT']", "done": False})
        df_req = pd.DataFrame(new_req_data)
        df_req.insert(0, "document_id", df_main["document_id"].values)

        # パラメータリスト作成
        params = []
        print("Preparing parameters for Gemini API calls...")


        for i, row in tqdm(df_main.iterrows(), total=len(df_main), desc="Checking documents"):
            if row.get("done") == True:
                continue

            document_id = row["document_id"]

            # PDFファイルパス確認
            if use_gcp_vm:
                pdf_path = f"gs://ann-files/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
                pdf_exists = True  # GCSの場合は存在チェックスキップ
            else:
                pdf_path = f"output/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
                pdf_exists = os.path.exists(pdf_path)

            if not pdf_exists:
                continue

            # 公告情報抽出用パラメータ
            params.append([
                self._PROMPT_ANN,
                document_id,
                "pdf",
                "gemini-2.5-flash",
                "ann",
                use_gcp_vm
            ])

            # 要件文抽出用パラメータ
            params.append([
                self._PROMPT_REQ,
                document_id,
                "pdf",
                "gemini-2.5-flash",
                "req",
                use_gcp_vm
            ])

            # 1回の実行での処理数制限チェック
            if len(params) >= max_api_calls_per_run:
                print(f"\nReached batch processing limit: {len(params)} calls ({len(params)//2} documents)")
                print("Remaining documents will be processed in the next run.")
                break

        print(f"Found {len(params)//2} documents to process ({len(params)} API calls)")

        # 並列実行
        if len(params) > 0:
            print(f"Calling Gemini API with max_concurrency={max_concurrency}...")
            start_time = time.time()
            results = asyncio.run(self._call_parallel(client, params, max_concurrency))
            elapsed_time = time.time() - start_time
            print(f"Gemini API processing completed in {elapsed_time:.2f} seconds")

            # 公告情報結果処理
            ann_results = [r for r in results if r.get("type") == "ann" and r.get("error") is None]

            if len(ann_results) > 0:
                records = []
                for res in tqdm(ann_results, desc="Processing announcement results"):
                    document_id = res["document_id"]
                    try:
                        json_str = res["result"].replace('\n', '').replace('```json', '').replace('```', '')
                        dict0 = json.loads(json_str)
                        dict0 = self._convertJson(dict0)

                        record = {
                            "document_id": document_id,
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
                            "pagecount": dict0.get("pagecount"),
                            "docdiststart": dict0.get("docdiststart"),
                            "docdistend": dict0.get("docdistend"),
                            "submissionstart": dict0.get("submissionstart"),
                            "submissionend": dict0.get("submissionend"),
                            "bidstartdate": dict0.get("bidstartdate"),
                            "bidenddate": dict0.get("bidenddate"),
                            "done": True
                        }
                        records.append(record)
                    except Exception as e:
                        tqdm.write(f"Error processing {document_id}: {e}")
                        records.append({"document_id": document_id, "done": True})

                # DataFrameにマージ
                df_records = pd.DataFrame(records)
                df_records = df_records.drop_duplicates(subset="document_id", keep="first")

                df_main = df_main.merge(df_records, on="document_id", how="left", suffixes=("", "_new"))

                # done列の更新
                df_main["done"] = (df_main["done"] | df_main["done_new"].fillna(False)).astype("boolean")
                df_main.drop(columns=["done_new"], inplace=True, errors="ignore")

                # その他の列を更新
                new_cols = [col for col in df_main.columns if col.endswith("_new")]
                for new_col in new_cols:
                    original_col = new_col[:-4]
                    df_main[original_col] = df_main[new_col].fillna(df_main[original_col])
                    df_main.drop(columns=[new_col], inplace=True)

                print(f"Updated {len(records)} documents with announcement data")

            # 要件文結果処理
            req_results = [r for r in results if r.get("type") == "req"]

            if len(req_results) > 0:
                for res in tqdm(req_results, desc="Processing requirement results"):
                    document_id = res["document_id"]
                    try:
                        if res.get("error") is not None:
                            text2 = str(res["error"])
                        else:
                            text2 = res["result"].replace('\n', '').replace('```json', '').replace('```', '')

                        try:
                            requirement_texts = json.loads(text2)
                        except json.decoder.JSONDecodeError:
                            text2 = text2.replace('"', "'")
                            requirement_texts = json.loads('{"資格・条件" : ["' + text2 + '"]}')

                        if isinstance(requirement_texts, dict) and "資格・条件" in requirement_texts:
                            dict2 = {
                                "document_id": document_id,
                                "資格・条件": str(requirement_texts["資格・条件"])
                            }
                        elif isinstance(requirement_texts, str):
                            dict2 = {
                                "document_id": document_id,
                                "資格・条件": requirement_texts
                            }
                        else:
                            dict2 = {
                                "document_id": document_id,
                                "資格・条件": "['Error fetching requirements.']"
                            }

                        # df_reqを更新
                        df_req.loc[df_req["document_id"] == document_id, "資格・条件"] = dict2["資格・条件"]
                        df_req.loc[df_req["document_id"] == document_id, "done"] = True

                    except Exception as e:
                        tqdm.write(f"Error processing requirements for {document_id}: {e}")
                        df_req.loc[df_req["document_id"] == document_id, "資格・条件"] = "['Error fetching requirements.']"
                        df_req.loc[df_req["document_id"] == document_id, "done"] = True

                print(f"Updated {len(req_results)} documents with requirement data")

        # ファイル保存
        df_main.to_csv(merged_updated_file, sep="\t", index=False, encoding="utf-8")
        print(f"Main OCR results saved to: {merged_updated_file}")

        df_req.to_csv(req_file_path, sep="\t", index=False, encoding="utf-8")
        df_req.to_csv(str(req_file_path) + ".zip", sep="\t", compression="zip", index=False, encoding="utf-8")
        print(f"Requirement results saved to: {req_file_path}")

        return df_main, str(req_file_path)


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

                prompt, document_id, data_type, model, type2, gcp_vm = item

                for attempt in range(3):
                    try:
                        result = await asyncio.to_thread(
                            self._call_gemini,
                            client,
                            prompt,
                            document_id,
                            data_type,
                            model,
                            gcp_vm
                        )

                        results.append({
                            "document_id": document_id,
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


    def _call_gemini(self, client, prompt, document_id, data_type, model="gemini-2.5-flash", gcp_vm=True):
        """
        Gemini APIを呼び出してPDFを解析
        """
        # PDFデータ取得
        if gcp_vm:
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

        # Gemini API呼び出し
        if data_type == "pdf":
            response = client.models.generate_content(
                model=model,
                contents=[
                    types.Part.from_bytes(
                        data=data,
                        mime_type='application/pdf',
                    ),
                    prompt
                ]
            )
        else:
            raise ValueError(f"Unsupported data_type: {data_type}")

        return response.text


    def _convertJson(self, json_value):
        """
        Geminiから取得したJSONを整形
        """
        def _modifyDate(datestr, handle_same_year=None, handle_same_month=None):
            try:
                datestr = datestr.replace(" ", "").replace("　", "")
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
        new_json["category"] = json_value.get("category", None)
        new_json["pagecount"] = json_value.get("pagecount", None)

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

        return new_json


    # Gemini プロンプト定義
    _PROMPT_ANN = """
Goal: Extract specific information related to construction projects and bidding procedures from the provided context.

Steps (T1 → T2 → T3):
T1: Thoroughly read and understand the entire context.
T2: Identify and locate the following fields within the context.  If a field is not present, its value will be "".
T3: Return the extracted information in a valid JSON format, adhering to the specified rules.

JSON Structure:

```json
{
"工事場所": "",
"入札手続等担当部局": {
"郵便番号": "",
"住所": "",
"担当部署名": "",
"担当者名": "",
"電話番号": "",
"FAX番号": "",
"メールアドレス": ""
},
"公告日" : "",
"入札方式" : "",
"資料種類" : "",
"category" : "",
"pagecount" : "",
"入札説明書の交付期間": {
"開始日": "",
"終了日": ""
},
"申請書及び競争参加資格確認資料の提出期限": {
"開始日": "",
"終了日": ""
},
"入札書の提出期間": {
"開始日": "",
"終了日": ""
}
}
```

Rules:
1.  **Exact Text:** Use the exact original text from the context for all extracted data.  Do not modify or translate the text.
1-1. As to the "入札方式" field, please set one from: open_competitive, designated_competitive, negotiated_contract, planning_competition, preferred_designation, open_counter, document_request, opinion_request, unknown, other.
1-2. As to the "資料種類" field, please set one from: "公募", "一般競争入札", "指名停止措置", "入札公告", "変更公告/注意事項公告/訂正公告/再公告", "中止", "企画競争実施の公示", "企画競争に係る手続開始の公示", "競争参加者の資格に関する公示", "見積書", "見積依頼書", "品目等内訳書", "入札書", "入札結果", "公告結果", "仕様書", "情報提案要求書", "業者の選定", "その他".
1-3. As to the "category" field, please set one from: '土木一式工事', '建築一式工事', '大工工事', '左官工事', 'とび・土工・コンクリート工事', '石工事', '屋根工事', '電気工事', '管工事', 'タイル・れんが・ブロック工事', '鋼構造物工事', '鉄筋工事', '舗装工事', 'しゅんせつ工事', '板金工事', 'ガラス工事', '塗装工事', '防水工事', '内装仕上工事', '機械器具設置工事', '熱絶縁工事', '電気通信工事', '造園工事', 'さく井工事', '建具工事', '水道施設工事', '消防施設工事', '清掃施設工事', '解体工事', 'その他'.
2.  **Completeness:**  Extract all requested fields. If a field is not found in the context, represent it with an empty string (`""`). No omissions are allowed.
3.  **Limited Output:** Only include the specified fields in the JSON output. Do not add any extra information or labels.
4.  **Hide Steps:** Do not display the internal steps (T1 or T2). Only the final JSON output (T3) should be shown.
5.  **Prefix Exclusion:** Exclude prefixes like "〒", "TEL", "FAX", and "E-mail:" from the extracted values.
6.  **Output Language:** The output (field names and extracted text if applicable) should be in Japanese.
7. **Data Structure:** Maintain the nested structure shown in the JSON Structure above.  "入札手続等担当部局", "入札説明書の交付期間", "申請書及び競争参加資格確認資料の提出期限" and "入札書の提出期間" are objects containing their respective sub-fields.
"""

    _PROMPT_REQ = """
# Goal Seek Prompt for Bid Qualification Extraction

[Input]
→ [Extract bidding qualifications from document]
→ [Intent](identify, extract, format, maintain original text, output JSON)

[Input]
→ [User Intent]
→ [Want or need Intent](accurate extraction, complete requirements, properly formatted JSON, faithful text reproduction)

[抽象化オブジェクト]
-> Legal Document Parser for Bid Qualifications
Why
<User Input>
I need to automatically extract all bidding and competition participation qualifications/requirements from legal documents and format them in a structured JSON output while preserving the original text exactly.
</User Input>
[Fixed User want intent] = Extract and structure bidding qualification requirements from legal documents

Achieve Goal == Need Tasks[Qualification Extraction]=[Tasks](
Read and comprehend document,
Identify qualification sections,
Determine primary qualification headings,
Extract qualification text blocks,
Maintain text integrity,
Handle dependent requirements,
Format as specified JSON
)

To Do Task Execute need Prompt And (Text Analysis Tool)
assign Agent
LegalDocumentParser

Agent Task Execute Feed back loop:
1. Read entire document to understand context
2. Locate all sections related to "competition participation qualifications
3. Identify primary qualification sections and related subsections
4. Extract complete text blocks for each qualification item
5. Preserve original formatting including numbering and indentation
6. Group dependent requirements together
7. Structure output in specified JSON format
8. Verify all qualification requirements are captured

Then Task Complete
Execute
====================

### Important Output Instructions
1. The JSON key name must be exactly "資格・条件" - do not change this key name even if similar terms appear in the document
2. Preserve the original text of qualifications exactly as they appear in the document, including numbering and formatting
3. Extract all qualifications completely without omission
4. Ensure the output is valid JSON format

### Output Format
```json
{
"資格・条件" : [
"(1) ・・・本文・・・",
"(2) ・・・本文・・・",
...
]
}
```
"""


    def step0_create_bid_announcements_pre(self, bid_announcements_pre_file=None):
        """
        step0 : 判定前公告表アップロード

        判定前公告表をデータフレームとして読み込み、アップロードする。

        表の列は型変換する。

        Attributes:

        - bid_announcements_pre_file=None: 
        
          判定前公告表のファイルパス。
                
          None なら、自身のbid_announcements_pre_fileを参照して表を読み込む。
        """

        if bid_announcements_pre_file is None:
            bid_announcements_pre_file = self.bid_announcements_pre_file

        tablename = self.tablenamesconfig.bid_announcements_pre
        db_operator = self.db_operator
        
        if db_operator.ifTableExists(tablename=tablename):
            db_operator.dropTable(tablename=tablename)
        else:
            print(fr"TABLE Not exists: {tablename}")

        # データ用意
        df = pd.read_csv(bid_announcements_pre_file, sep="\t")
        df["userAnnNo"] = df["userAnnNo"].astype("Int64")
        for cname in [
            "workName",
            "topAgencyName",
            "subAgencyName",
            "publishDate",
            "docDistEnd",
            "submissionEnd",
            "bidEndDate",
            "remarks",
            "pdfUrl",
            "reasonForNG"
        ]:
            df[cname] = df[cname].astype("string")
        
        print(fr"Upload {tablename}")
        db_operator.uploadDataToTable(data=df, tablename=tablename)

        # check
        #val = db_operator.selectToTable(tablename=tablename)



    def step1_transfer(self, remove_table=False):
        """
        step1 : 転写処理

        公告マスターが無ければ公告マスターを作成する。要件マスターが無ければ要件マスターを作成する。

        引数 remove_table に応じて、事前に公告マスター・要件マスターを削除する。
        
        判定前公告を公告マスターにコピーする。

        Args:

        - remove_table=False: 
        
          処理前に、公告マスター・要件マスターを削除するかどうか。
        """

        tablename_pre = self.tablenamesconfig.bid_announcements_pre
        tablename_announcements = self.tablenamesconfig.bid_announcements
        tablename_requirements = self.tablenamesconfig.bid_requirements
        db_operator = self.db_operator


        # テーブル 'bid_announcements' の存在確認。
        tmpcheck = db_operator.ifTableExists(tablename=tablename_announcements)
        # テーブルが存在するなら、削除オプションに応じて削除
        if tmpcheck:
            if remove_table:
                db_operator.dropTable(tablename=tablename_announcements)
                print(fr"DELETE existing table: {tablename_announcements}.")
                # テーブル削除したのでフラグ更新
                tmpcheck = False

        if not tmpcheck:
            # テーブルが無いなら作成
            db_operator.createBidAnnouncements(bid_announcements_tablename=tablename_announcements)
            print(fr"NEWLY CREATED: {tablename_announcements}.")
        else:
            print(fr"ALREADY EXISTS: {tablename_announcements}.")


        # 同様に bid_requirements 
        # テーブル 'bid_requirements' の存在確認。
        tmpcheck = db_operator.ifTableExists(tablename=tablename_requirements)

        # テーブルが存在するなら、削除オプションに応じて削除
        if tmpcheck:
            if remove_table:
                db_operator.dropTable(tablename=tablename_requirements)
                print(fr"DELETE existing table: {tablename_requirements}.")
                # テーブル削除したのでフラグ更新
                tmpcheck = False

        if not tmpcheck:
            # テーブルが無いなら作成
            db_operator.createBidRequirements(bid_requirements_tablename=tablename_requirements)
            print(fr"NEWLY CREATED: {tablename_requirements}.")
        else:
            print(fr"ALREADY EXISTS: {tablename_requirements}.")


        # 転写処理
        # BigQueryのような分析基盤は OLAP寄り。
        # ID管理や逐次更新はOLTP型DB（RDBMS）が得意
        #
        # ID ... GENERATE_UUID() で UUID を作る方法はある。
        # バッチ処理なら連番採番で問題なさそう。同時実行が想定される(例：近い時刻に異なる注文をinsert)場合は問題あるかもしれない。
        # TODO: 要テスト
        # 疑問:row_number付与の order by 列は pdf_urlがよいのか？
        db_operator.transferAnnouncements(
            bid_announcements_tablename=tablename_announcements, 
            bid_announcements_pre_tablename=tablename_pre
        )
        # check
        # val = db_operator.selectToTable(tablename=tablename)


    def step1_transfer_v2(self, announcements_documents_file=None, remove_table=False):
        """
        step1 : 転写処理

        公告マスターが無ければ公告マスターを作成する。要件マスターが無ければ要件マスターを作成する。

        引数 remove_table に応じて、事前に公告マスター・要件マスターを削除する。

        判定前公告を公告マスターにコピーする。

        Args:

        - announcements_documents_file: announcements_document ファイルのパス。
          Noneの場合は処理をスキップ。

        - remove_table=False:

          処理前に、公告マスター・要件マスターを削除するかどうか。
        """

        tablename_announcements = self.tablenamesconfig.bid_announcements
        tablename_requirements = self.tablenamesconfig.bid_requirements
        tablename_bid_announcements_document_table = self.tablenamesconfig.bid_announcements_document_table

        db_operator = self.db_operator

        # announcements_documents_file が指定されていない場合は警告
        if announcements_documents_file is None:
            print("Warning: announcements_documents_file is not specified. Skipping step1_transfer_v2.")
            return

        # ファイルの存在確認
        if not Path(announcements_documents_file).exists():
            print(f"Error: announcements_documents_file not found: {announcements_documents_file}")
            return

        # テーブル 'bid_announcements' の存在確認。
        tmpcheck = db_operator.ifTableExists(tablename=tablename_announcements)
        # テーブルが存在するなら、削除オプションに応じて削除
        if tmpcheck:
            if remove_table:
                db_operator.dropTable(tablename=tablename_announcements)
                print(fr"DELETE existing table: {tablename_announcements}.")
                # テーブル削除したのでフラグ更新
                tmpcheck = False

        if not tmpcheck:
            # テーブルが無いなら作成
            db_operator.createBidAnnouncementsV2(bid_announcements_tablename=tablename_announcements)
            print(fr"NEWLY CREATED: {tablename_announcements}.")
        else:
            print(fr"ALREADY EXISTS: {tablename_announcements}.")


        # 同様に bid_requirements
        # テーブル 'bid_requirements' の存在確認。
        tmpcheck = db_operator.ifTableExists(tablename=tablename_requirements)

        # テーブルが存在するなら、削除オプションに応じて削除
        if tmpcheck:
            if remove_table:
                db_operator.dropTable(tablename=tablename_requirements)
                print(fr"DELETE existing table: {tablename_requirements}.")
                # テーブル削除したのでフラグ更新
                tmpcheck = False

        if not tmpcheck:
            # テーブルが無いなら作成
            db_operator.createBidRequirements(bid_requirements_tablename=tablename_requirements)
            print(fr"NEWLY CREATED: {tablename_requirements}.")
        else:
            print(fr"ALREADY EXISTS: {tablename_requirements}.")

        # announcements_documents ファイルを読み込み
        print(f"Loading announcements_documents_file: {announcements_documents_file}")
        df_new = pd.read_csv(announcements_documents_file, sep="\t")
        print(f"Loaded {len(df_new)} records from announcements_documents_file")

        # announcements_document_table の処理
        # テーブルの存在確認
        tmpcheck_document_table = db_operator.ifTableExists(tablename=tablename_bid_announcements_document_table)

        if not tmpcheck_document_table:
            # テーブルが存在しない場合は新規作成
            print(f"Creating new table: {tablename_bid_announcements_document_table}")
            db_operator.uploadDataToTable(data=df_new, tablename=tablename_bid_announcements_document_table, chunksize=5000)
            print(f"NEWLY CREATED: {tablename_bid_announcements_document_table} with {len(df_new)} records")
        else:
            # テーブルが存在する場合は、一時テーブルを使ってMERGE処理
            print(f"Table already exists: {tablename_bid_announcements_document_table}")
            print("Using MERGE to insert only new records...")

            # 一時テーブル名
            tmp_tablename = f"tmp_{tablename_bid_announcements_document_table}"

            # 一時テーブルにデータをアップロード（既存テーブルがあれば削除して再作成）
            print(f"Uploading {len(df_new)} records to temporary table: {tmp_tablename}")
            db_operator.uploadDataToTable(
                data=df_new,
                tablename=tmp_tablename,
                chunksize=5000,
                if_exists='replace'
            )

            # MERGE文を実行（announcement_id と document_id で重複チェック）
            print(f"Executing MERGE statement to insert new records...")

            # 列名を取得（announcement_id, document_id を含む全ての列）
            columns = df_new.columns.tolist()
            columns_str = ", ".join(columns)
            values_str = ", ".join([f"S.{col}" for col in columns])

            # MERGE文を構築
            merge_sql = f"""
            MERGE `{db_operator.project_id}.{db_operator.dataset_name}.{tablename_bid_announcements_document_table}` AS T
            USING `{db_operator.project_id}.{db_operator.dataset_name}.{tmp_tablename}` AS S
            ON T.announcement_id = S.announcement_id AND T.document_id = S.document_id
            WHEN NOT MATCHED THEN
              INSERT ({columns_str})
              VALUES ({values_str})
            """

            # MERGE文を実行
            print(f"Executing MERGE query...")
            try:
                query_job = db_operator.client.query(merge_sql)
                query_job.result()  # 完了を待つ
                print(f"MERGE completed: {query_job.num_dml_affected_rows} rows inserted")
            finally:
                # エラーが発生しても一時テーブルは削除
                print(f"Dropping temporary table: {tmp_tablename}")
                db_operator.dropTable(tablename=tmp_tablename)


        db_operator.transferAnnouncementsV2(
            bid_announcements_tablename=tablename_announcements, 
            bid_announcements_documents_tablename=tablename_bid_announcements_document_table
        )
        # check
        # val = db_operator.selectToTable(tablename=tablename)


    def step2_ocr(self, ocr_utils, condition_doneOCR):
        """
        step2 : OCR処理
    
        公告pdfに対してOCRを行い、公告マスターと要件マスターを更新する。

        OCRは、公告マスターのうち、OCRをしていない公告(doneOCR=False)に対して行う。

        公告対象の pdf を data/pdf 以下に、{announcement_no}.pdf で保存する。

        OCR結果を、data/ocr 以下に、ocr_announcements_{announcement_no}.json, ocr_requirements_{announcement_no}.json として保存する。

        OCR処理は ocr_utils に行わせる。

        annoucements, requirements に対する OCR結果をデータフレームにまとめ、いったんデータベースに中間テーブルとしてアップロードし、公告マスターと要件マスターを更新する。更新後、中間テーブルは削除する。

        Args:

        - ocr_utils: 
        
          OCRを行うオブジェクト。
        """

        tablename_announcements = self.tablenamesconfig.bid_announcements
        tmp_tablename_announcements = fr"tmp_{tablename_announcements}"
        tablename_requirements = self.tablenamesconfig.bid_requirements
        tmp_tablename_requirements = fr"tmp_{tablename_requirements}"
        db_operator = self.db_operator

        # OCR
        if condition_doneOCR == "FALSE":
            df1 = db_operator.selectToTable(tablename=fr"{tablename_announcements}", where_clause="where doneOCR = FALSE order by announcement_no")
        elif condition_doneOCR == "TRUE":
            df1 = db_operator.selectToTable(tablename=fr"{tablename_announcements}", where_clause="where doneOCR = TRUE order by announcement_no")
        elif condition_doneOCR == "all":
            df1 = db_operator.selectToTable(tablename=fr"{tablename_announcements}")
        else:
            raise ValueError(fr"Unknown condition_doneOCR = {condition_doneOCR}")

        #output_path_ann = "../4_get_documents/output_v3/pdf_txt_all_gemini_ann/ann.txt"
        #output_path_ann_zip = "../4_get_documents/output_v3/pdf_txt_all_gemini_ann/ann.txt.zip"
        #output_path_req = "../4_get_documents/output_v3/pdf_txt_all_gemini_req/req.txt"
        #output_path_req_zip = "../4_get_documents/output_v3/pdf_txt_all_gemini_req/req.txt.zip"

        output_path_ann = "data/ocr/ann.txt"
        output_path_ann_zip = "data/ocr/ann.txt.zip"
        output_path_req = "data/ocr/req.txt"
        output_path_req_zip = "data/ocr/req.txt.zip"

        # 既にファイルがある前提になっていることに注意。
        if os.path.exists(output_path_ann_zip):
            df_ann = pd.read_csv(output_path_ann_zip,sep="\t")
        else:
            df_ann = pd.read_csv(output_path_ann,sep="\t")

        if os.path.exists(output_path_req_zip):
            df_req = pd.read_csv(output_path_req_zip,sep="\t")
        else:
            df_req = pd.read_csv(output_path_req,sep="\t")


        all_announcements = []
        all_requirement_texts = []
        # Processing OCR for announcement_no=300144...
        # 00003_2025_0204a
        for index, row in tqdm(df1.iterrows(), total=len(df1)):
            # row = df1.loc[index]
            announcement_no = row["announcement_no"]
            # print(f"Processing OCR for announcement_no={announcement_no}...")

            pdfurl = row["pdfUrl"]
            document_id = row["document_id"]

            try:
                # announcements
                doc_data = None
                if document_id in df_ann["document_id"].values:
                    dict2 = df_ann[df_ann["document_id"]==document_id]
                    dict1 = {
                        "工事場所": dict2["工事場所"].values[0],
                        "入札手続等担当部局": {
                            "郵便番号": dict2["入札手続等担当部局___郵便番号"].values[0],
                            "住所": dict2["入札手続等担当部局___住所"].values[0],
                            "担当部署名": dict2["入札手続等担当部局___担当部署名"].values[0],
                            "担当者名": dict2["入札手続等担当部局___担当者名"].values[0],
                            "電話番号": dict2["入札手続等担当部局___電話番号"].values[0],
                            "FAX番号": dict2["入札手続等担当部局___FAX番号"].values[0],
                            "メールアドレス": dict2["入札手続等担当部局___メールアドレス"].values[0]
                        },
                        "公告日": dict2["公告日"].values[0],
                        "入札説明書の交付期間": {
                            "開始日": dict2["入札説明書の交付期間___開始日"].values[0],
                            "終了日": dict2["入札説明書の交付期間___終了日"].values[0]
                        },
                        "申請書及び競争参加資格確認資料の提出期限": {
                            "開始日": dict2["申請書及び競争参加資格確認資料の提出期限___開始日"].values[0],
                            "終了日": dict2["申請書及び競争参加資格確認資料の提出期限___終了日"].values[0]
                        },
                        "入札書の提出期間": {
                            "開始日": dict2["入札書の提出期間___開始日"].values[0],
                            "終了日": dict2["入札書の提出期間___終了日"].values[0]
                        }
                    }
                else:
                    print(document_id)
                    time.sleep(0.5)
                    doc_data = ocr_utils.getPDFDataFromUrl(pdfurl)
                    dict1 = ocr_utils.getJsonFromDocData(doc_data=doc_data)
                    dict2 = {
                        "document_id" : document_id,
                        "工事場所" : dict1["工事場所"],
                        "入札手続等担当部局___郵便番号" : dict1["入札手続等担当部局"]["郵便番号"],
                        "入札手続等担当部局___住所" : dict1["入札手続等担当部局"]["住所"],
                        "入札手続等担当部局___担当部署名" : dict1["入札手続等担当部局"]["担当部署名"],
                        "入札手続等担当部局___担当者名" : dict1["入札手続等担当部局"]["担当者名"],
                        "入札手続等担当部局___電話番号" : dict1["入札手続等担当部局"]["電話番号"],
                        "入札手続等担当部局___FAX番号" : dict1["入札手続等担当部局"]["FAX番号"],
                        "入札手続等担当部局___メールアドレス" : dict1["入札手続等担当部局"]["メールアドレス"],
                        "公告日" : dict1["公告日"],
                        "入札説明書の交付期間___開始日" : dict1["入札説明書の交付期間"]["開始日"],
                        "入札説明書の交付期間___終了日" : dict1["入札説明書の交付期間"]["終了日"],
                        "申請書及び競争参加資格確認資料の提出期限___開始日" : dict1["申請書及び競争参加資格確認資料の提出期限"]["開始日"],
                        "申請書及び競争参加資格確認資料の提出期限___終了日" : dict1["申請書及び競争参加資格確認資料の提出期限"]["終了日"],
                        "入札書の提出期間___開始日" : dict1["入札書の提出期間"]["開始日"],
                        "入札書の提出期間___終了日" : dict1["入札書の提出期間"]["終了日"]
                    }
                    tmpdict2 = pd.DataFrame(dict2, index=[0])
                    #df_ann = pd.concat([df_ann, tmpdict2], axis=0, ignore_index=True)
                    #df_ann.to_csv(output_path_ann, sep="\t", index=False)
                    #df_ann.to_csv(output_path_ann_zip, sep="\t", compression="zip", index=False)
                dict1["announcement_no"] = announcement_no
                new_json = ocr_utils.convertJson(json_value=dict1)


                # requirements
                if document_id in df_req["document_id"].values:
                    dict2 = df_req[df_req["document_id"]==document_id]
                    if dict2["資格・条件"].isna().all():
                        requirement_texts = {
                            "資格・条件": ["Missing requirements."]
                        }
                    else:
                        requirement_texts = {
                            "資格・条件": dict2["資格・条件"].apply(ast.literal_eval).values[0]
                        }
                else:
                    print(document_id)
                    if doc_data is None:
                        doc_data = ocr_utils.getPDFDataFromUrl(pdfurl)

                    time.sleep(0.5)
                    requirement_texts = ocr_utils.getRequirementText(doc_data=doc_data)
                    dict2 = {
                        "document_id" : document_id,
                        "資格・条件" : str(requirement_texts["資格・条件"])
                    }
                    # tmpdict2 = pd.DataFrame(dict2, index=[0])
                    tmpdict2 = pd.DataFrame([dict2])
                    #df_req = pd.concat([df_req, tmpdict2], axis=0, ignore_index=True)
                    #df_req.to_csv(output_path_req, sep="\t", index=False)
                    #df_req.to_csv(output_path_req_zip, sep="\t", compression="zip", index=False)
                requirement_texts["announcement_no"] = announcement_no
                dic = ocr_utils.convertRequirementTextDict(requirement_texts=requirement_texts)



                all_announcements.append(new_json)
                all_requirement_texts.append(pd.DataFrame(dic))
            except ClientError as e:
                # print(e)
                break


        ######################################
        # まずは bid_announcements を更新。   #
        ######################################

        df1 = pd.DataFrame(all_announcements)
        if df1.shape[0] > 0:
            df1["fax"] = df1["fax"].astype("string")
            print(fr"Upload {tmp_tablename_announcements}")
            db_operator.uploadDataToTable(data=df1, tablename=tmp_tablename_announcements, chunksize=5000)

            if False:
                val = db_operator.selectToTable(tablename=tmp_tablename_announcements)
                print(val)
            if False:
                val_pre = db_operator.selectToTable(tablename=tablename_announcements)
                print(val_pre)

            print(fr"Update {tablename_announcements}")
            db_operator.updateAnnouncements(bid_announcements_tablename=tablename_announcements, bid_announcements_tablename_for_update=tmp_tablename_announcements)

        # 中間テーブル削除
        db_operator.dropTable(tablename=tmp_tablename_announcements)

        ######################################
        # bid_requirements を更新。           #
        ######################################

        if all_requirement_texts != []:
            df2 = pd.concat(all_requirement_texts, ignore_index=True)
            max_requirement_no = db_operator.getMaxOfColumn(tablename=tablename_requirements,column_name="requirement_no")
            if max_requirement_no.iloc[0,0] is None or pd.isna(max_requirement_no.iloc[0,0]):
                max_requirement_no = 0
            else:
                max_requirement_no = max_requirement_no.iloc[0,0]
            current_requirement_no = max_requirement_no + 1
            df2["requirement_no"] = range(current_requirement_no, current_requirement_no + df2.shape[0])

            df2["announcement_no"] = df2["announcement_no"].astype("Int64")
            df2["requirement_no"] = df2["requirement_no"].astype("Int64")

            print(fr"Upload {tmp_tablename_requirements}")
            db_operator.uploadDataToTable(data=df2, tablename=tmp_tablename_requirements, chunksize=5000)
            print(fr"Update {tablename_requirements}")
            db_operator.updateRequirements(bid_requirements_tablename=tablename_requirements, bid_requirements_tablename_for_update=tmp_tablename_requirements)

        # 中間テーブル削除
        db_operator.dropTable(tablename=tmp_tablename_requirements)

    def step3(self, remove_table=False):
        """
        step3 : 要件判定処理

        企業 x 拠点 x 要件の全組み合わせに対して要件判定し結果を企業公告判定マスターに格納する。

        また、充足要件マスターと不足要件マスターを作成する。

        要件判定の対象は、企業公告判定マスターのうち、最終判定結果が記載されていない企業 x 拠点 x 要件のレコードが対象。

        (企業 x 拠点 x 要件) の3つ組 1000 件ごとに要件判定処理を実行し、企業公告判定マスター・充足要件マスター・不足要件マスターを更新するための結果を得る。この結果を中間テーブルとしてアップロードし、各マスターを更新する。更新が終わったら中間テーブルを削除する。

        Args:

        - remove_table:

          処理の前に、企業公告判定マスター・充足要件マスター・不足要件マスターを削除するかどうか。
        """

        tablename_announcements = self.tablenamesconfig.bid_announcements
        tablename_requirements = self.tablenamesconfig.bid_requirements
        tablename_company_bid_judgement = self.tablenamesconfig.company_bid_judgement

        tablename_office_master = self.tablenamesconfig.office_master

        tablename_sufficient_requirement_master = self.tablenamesconfig.sufficient_requirements
        tablename_insufficient_requirement_master = self.tablenamesconfig.insufficient_requirements

        db_operator = self.db_operator

        # ループの外で全てのマスターデータを事前に読み込み（高速化のため）
        print("Loading master data files...")
        master_data_company = pd.read_csv("data/master/company_master.txt", sep="\t")
        master_data_office_registration_authorization = pd.read_csv("data/master/office_registration_authorization_master.txt", sep="\t")
        master_data_office_registration_authorization_with_converter = pd.read_csv("data/master/office_registration_authorization_master.txt", sep="\t", converters={"construction_no": lambda x: str(x)})
        master_data_agency = pd.read_csv("data/master/agency_master.txt", sep="\t")
        master_data_construction = pd.read_csv("data/master/construction_master.txt", sep="\t")
        master_data_office = pd.read_csv("data/master/office_master.txt", sep="\t")
        master_data_office_work_achivements = pd.read_csv("data/master/office_work_achivements_master.txt", sep="\t")
        master_data_employee = pd.read_csv("data/master/employee_master.txt", sep="\t")
        master_data_employee_qualification = pd.read_csv("data/master/employee_qualification_master.txt", sep="\t")
        master_data_technician_qualification = pd.read_csv("data/master/technician_qualification_master.txt", sep="\t")
        master_data_employee_experience = pd.read_csv("data/master/employee_experience_master.txt", sep="\t")
        print("Master data files loaded.")





        tablenames = [
            tablename_company_bid_judgement, 
            tablename_sufficient_requirement_master,
            tablename_insufficient_requirement_master
        ]
        target_tablename = tablenames[0]
        for i, target_tablename in enumerate(tablenames):

            tmpcheck = db_operator.ifTableExists(tablename = target_tablename)

            if tmpcheck:
                if remove_table:
                    db_operator.dropTable(tablename=target_tablename)
                    print(fr"DELETE existing table: {target_tablename}.")
                    tmpcheck = False

            if not tmpcheck:
                if target_tablename == tablename_company_bid_judgement:
                    db_operator.createCompanyBidJudgements(company_bid_judgement_tablename=tablename_company_bid_judgement)
                elif target_tablename == tablename_sufficient_requirement_master:
                    db_operator.createSufficientRequirements(sufficient_requirements_tablename=tablename_sufficient_requirement_master)
                elif target_tablename == tablename_insufficient_requirement_master:
                    db_operator.createInsufficientRequirements(insufficient_requirements_tablename=tablename_insufficient_requirement_master)
                else:
                    raise Exception(fr"Unknown target_tablename={target_tablename}.")
                print(fr"NEWLY CREATED: {target_tablename}.")
            else:
                print(fr"ALREADY EXISTS: {target_tablename}.")


        # office_master テーブルを作成（既に読み込んだデータを使用）
        print(fr"Upload {tablename_office_master}")
        db_operator.uploadDataToTable(data=master_data_office, tablename=tablename_office_master, chunksize=5000)

        if False:
            db_operator.preupdateCompanyBidJudgement(
                company_bid_judgement_tablename=tablename_company_bid_judgement, 
                office_master_tablename=tablename_office_master, 
                bid_announcements_tablename=tablename_announcements
            )
        df0 = db_operator.preselectCompanyBidJudgement(
            company_bid_judgement_tablename=tablename_company_bid_judgement, 
            office_master_tablename=tablename_office_master, 
            bid_announcements_tablename=tablename_announcements
        )
        # df0 = db_operator.selectToTable(tablename=fr"{tablename_company_bid_judgement}", where_clause="where final_status is NULL")
        print(fr"Target of checking requirement : {df0.shape[0]}")

        # UUID化により連番採番は不要

        # req_df はひとまず一括取得
        req_df0 = db_operator.selectToTable(tablename=fr"{tablename_requirements}")
        # announcement_noでgroupbyして辞書化（高速化のため）
        req_df_map = dict(tuple(req_df0.groupby("announcement_no")))
        # 並列処理設定
        n_processes = cpu_count()
        print(f"Using {n_processes} processes for parallel execution")

        # マスターデータを辞書にまとめる
        master_data_dict = {
            'company': master_data_company,
            'office': master_data_office,
            'office_registration_authorization': master_data_office_registration_authorization,
            'office_registration_authorization_with_converter': master_data_office_registration_authorization_with_converter,
            'agency': master_data_agency,
            'construction': master_data_construction,
            'office_work_achivements': master_data_office_work_achivements,
            'employee': master_data_employee,
            'employee_qualification': master_data_employee_qualification,
            'technician_qualification': master_data_technician_qualification,
            'employee_experience': master_data_employee_experience
        }

        # df0をn_processes個のチャンクに分割
        df_chunks = np.array_split(df0, n_processes)

        # 各チャンクに対するタスクを準備
        tasks = []
        for df_chunk in df_chunks:
            if len(df_chunk) > 0:  # 空のチャンクをスキップ
                tasks.append((df_chunk, req_df_map, master_data_dict))

        # 並列実行
        print(f"Starting parallel processing with {len(tasks)} tasks...")
        with Pool(processes=n_processes) as pool:
            chunk_results = list(tqdm(pool.imap(_process_judgement_chunk, tasks), total=len(tasks), desc="Processing chunks"))

        # 結果を集約
        print("Aggregating results from all processes...")
        result_judgement_list = []
        result_sufficient_requirements_list = []
        result_insufficient_requirements_list = []

        for result in chunk_results:
            result_judgement_list.extend(result['judgement'])
            result_sufficient_requirements_list.extend(result['sufficient'])
            result_insufficient_requirements_list.extend(result['insufficient'])

        print(f"Aggregation complete: {len(result_judgement_list)} judgements, {len(result_sufficient_requirements_list)} sufficient, {len(result_insufficient_requirements_list)} insufficient")

        # DataFrameに変換してDB書き込み
        result_judgement = pd.DataFrame(result_judgement_list)
        result_insufficient_requirements = pd.DataFrame(result_insufficient_requirements_list)
        result_sufficient_requirements = pd.DataFrame(result_sufficient_requirements_list)

        if result_judgement.shape[0] > 0:
            tmp_result_judgement_table = "tmp_result_judgement"
            #max_evaluation_no = db_operator.any_query(sql = fr"SELECT max(evaluation_no) FROM {tablename_company_bid_judgement}")

            print(fr"Upload {tmp_result_judgement_table}")
            db_operator.uploadDataToTable(data=result_judgement, tablename=tmp_result_judgement_table, chunksize=5000)
            print(fr"Update {tablename_company_bid_judgement}")
            db_operator.updateCompanyBidJudgement(
                company_bid_judgement_tablename=tablename_company_bid_judgement, 
                company_bid_judgement_tablename_for_update=tmp_result_judgement_table
            )
            db_operator.dropTable(tablename=tmp_result_judgement_table)

        if result_insufficient_requirements.shape[0] > 0:
            tmp_result_insufficient_requirements_master_table = "tmp_result_insufficient_requirements"
            print(fr"Upload {tmp_result_insufficient_requirements_master_table}")
            db_operator.uploadDataToTable(data=result_insufficient_requirements, tablename=tmp_result_insufficient_requirements_master_table, chunksize=5000)
            print(fr"Update {tablename_insufficient_requirement_master}")
            db_operator.updateInsufficientRequirements(
                insufficient_requirements_tablename=tablename_insufficient_requirement_master, 
                insufficient_requirements_tablename_for_update=tmp_result_insufficient_requirements_master_table
            )
            db_operator.dropTable(tablename=tmp_result_insufficient_requirements_master_table)

        if result_sufficient_requirements.shape[0] > 0:
            tmp_result_sufficient_requirements_master_table = "tmp_result_sufficient_requirements"
            print(fr"Upload {tmp_result_sufficient_requirements_master_table}")
            db_operator.uploadDataToTable(data=result_sufficient_requirements, tablename=tmp_result_sufficient_requirements_master_table, chunksize=5000)
            print(fr"Update {tablename_sufficient_requirement_master}")
            db_operator.updateSufficientRequirements(
                sufficient_requirements_tablename=tablename_sufficient_requirement_master, 
                sufficient_requirements_tablename_for_update=tmp_result_sufficient_requirements_master_table
            )
            db_operator.dropTable(tablename=tmp_result_sufficient_requirements_master_table)



if __name__ == "__main__":
    # GCP bigquery想定
    # google ai studio に接続しなくてよいなら  --google_ai_studio_api_key_filepath 無しでよい。
    # python source/bid_announcement_judgement_tools/main.py --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key_mizu.txt --bigquery_location SPECIFY_LOCATION --bigquery_project_id SPECIFY_PROJECT_ID --bigquery_dataset_name SPECIFY_DATASET_NAME --use_gcp_vm
    # 
    # python source/bid_announcement_judgement_tools/main.py --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key_mizu.txt --bigquery_location "asia-northeast1" --bigquery_project_id mizu-api-457906 --bigquery_dataset_name bid_db --use_gcp_vm
    # python source/bid_announcement_judgement_tools/main.py --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key_mizu.txt --bigquery_location "asia-northeast1" --bigquery_project_id mizu-api-457906 --bigquery_dataset_name bid_db --use_gcp_vm
    # python source/bid_announcement_judgement_tools/main.py --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key_mizu.txt --bigquery_location "asia-northeast1" --bigquery_project_id mizu-api-457906 --bigquery_dataset_name bid_db --use_gcp_vm  --step1_transfer_remove_table --step3_remove_table
    # 
    # sqlite3想定
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --sqlite3_db_file_path data/example.db
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/all.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key_mizu.txt --sqlite3_db_file_path data/example.db
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/all.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key_mizu.txt --sqlite3_db_file_path data/example.db --step1_transfer_remove_table --step3_remove_table
    # python -i source/bid_announcement_judgement_tools/main.py --sqlite3_db_file_path data/example.db --stop_processing

    parser = argparse.ArgumentParser(description="")
    parser.add_argument("--use_gcp_vm", action="store_true")
    parser.add_argument("--bid_announcements_pre_file")
    parser.add_argument("--google_ai_studio_api_key_filepath")
    parser.add_argument("--stop_processing", action="store_true")

    parser.add_argument("--sqlite3_db_file_path", default=None)

    parser.add_argument("--bigquery_location", default=None)
    parser.add_argument("--bigquery_project_id", default=None)
    parser.add_argument("--bigquery_dataset_name", default=None)

    # Step0 関連の引数
    parser.add_argument("--input_list_file", default=None,
                       help="リスト_防衛省入札_1.txt のパス（step0_prepare_documentsの入力）")
    parser.add_argument("--run_step0_prepare_documents", action="store_true",
                       help="step0_prepare_documents（HTML取得・リンク抽出・フォーマット）を実行")
    parser.add_argument("--run_step0_only", action="store_true",
                       help="step0のみ実行して終了（データベース不要でテスト可能）")
    parser.add_argument("--stop_after_step1", action="store_true",
                       help="step1まで実行して終了")
    parser.add_argument("--step0_output_base_dir", default="output",
                       help="step0の出力ベースディレクトリ（デフォルト: output）")
    parser.add_argument("--step0_topAgencyName", default="防衛省",
                       help="トップ機関名（デフォルト: 防衛省）")
    parser.add_argument("--step0_no_merge", action="store_true",
                       help="過去の結果とマージしない")
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
    parser.add_argument("--step0_do_count_pages", action="store_true",
                       help="ページ数カウント処理を実行")
    parser.add_argument("--step0_do_ocr", action="store_true",
                       help="Gemini OCR処理を実行")
    parser.add_argument("--step0_google_api_key", default="data/sec/google_ai_studio_api_key_mizu.txt",
                       help="Google AI Studio API キーファイルのパス")
    parser.add_argument("--step0_ocr_max_concurrency", type=int, default=5,
                       help="OCR並列実行数")
    parser.add_argument("--step0_ocr_max_api_calls_per_run", type=int, default=1000,
                       help="1回の実行での最大API呼び出し数")
    parser.add_argument("--announcements_documents_file", default=None,
                       help="announcements_document ファイルのパス（step1_transfer_v2で使用）")

    parser.add_argument("--step1_transfer_remove_table", action="store_true")
    parser.add_argument("--step3_remove_table", action="store_true")

    parser.add_argument("--condition_doneOCR", default="FALSE")

    try:
        args = parser.parse_args()
        bid_announcements_pre_file = args.bid_announcements_pre_file
        google_ai_studio_api_key_filepath = args.google_ai_studio_api_key_filepath
        use_gcp_vm = args.use_gcp_vm
        stop_processing = args.stop_processing
        sqlite3_db_file_path = args.sqlite3_db_file_path

        bigquery_location = args.bigquery_location
        bigquery_project_id = args.bigquery_project_id
        bigquery_dataset_name = args.bigquery_dataset_name

        # Step0 関連の引数
        input_list_file = args.input_list_file
        run_step0_prepare_documents = args.run_step0_prepare_documents
        run_step0_only = args.run_step0_only
        stop_after_step1 = args.stop_after_step1
        step0_output_base_dir = args.step0_output_base_dir
        step0_topAgencyName = args.step0_topAgencyName
        step0_no_merge = args.step0_no_merge
        step0_timestamp = args.step0_timestamp
        step0_do_fetch_html = args.step0_do_fetch_html
        step0_do_extract_links = args.step0_do_extract_links
        step0_do_format_documents = args.step0_do_format_documents
        step0_do_download_pdfs = args.step0_do_download_pdfs
        step0_do_count_pages = args.step0_do_count_pages
        step0_do_ocr = args.step0_do_ocr
        step0_google_api_key = args.step0_google_api_key
        step0_ocr_max_concurrency = args.step0_ocr_max_concurrency
        step0_ocr_max_api_calls_per_run = args.step0_ocr_max_api_calls_per_run
        announcements_documents_file = args.announcements_documents_file

        step1_transfer_remove_table = args.step1_transfer_remove_table
        step3_remove_table = args.step3_remove_table

        condition_doneOCR = args.condition_doneOCR
    except:
        bid_announcements_pre_file = "data/bid_announcements_pre/bid_announcements_pre_1.txt"
        use_bigquery = False
        stop_processing = True

        input_list_file = None
        run_step0_prepare_documents = False
        run_step0_only = False
        step0_output_base_dir = "output"
        step0_topAgencyName = "防衛省"
        step0_no_merge = False
        step0_timestamp = None
        step0_do_fetch_html = False
        step0_do_extract_links = False
        step0_do_format_documents = False
        step0_do_download_pdfs = False
        step0_do_count_pages = False
        announcements_documents_file = None

        step1_transfer_remove_table = False
        step3_remove_table = False

        condition_doneOCR = "FALSE"
    if bid_announcements_pre_file is None:
        bid_announcements_pre_file = "data/bid_announcements_pre/bid_announcements_pre_1.txt"
        print(fr"Set bid_announcements_pre_file = {bid_announcements_pre_file}")

    # Step0のみ実行モード（データベース不要）
    if run_step0_only:
        if input_list_file is None:
            print("Error: --input_list_file is required when --run_step0_only is specified")
            exit(1)

        # db_operatorなしでオブジェクト作成（step0のみ使用）
        obj = BidJudgementSan(
            bid_announcements_pre_file=bid_announcements_pre_file,
            tablenamesconfig=TablenamesConfig,
            db_operator=None
        )

        # Step0のみ実行
        announcements_documents_file = obj.step0_prepare_documents(
            input_list_file=input_list_file,
            output_base_dir=step0_output_base_dir,
            timestamp=step0_timestamp,
            topAgencyName=step0_topAgencyName,
            no_merge=step0_no_merge,
            use_gcp_vm=use_gcp_vm,
            do_fetch_html=step0_do_fetch_html,
            do_extract_links=step0_do_extract_links,
            do_format_documents=step0_do_format_documents,
            do_download_pdfs=step0_do_download_pdfs,
            do_count_pages=step0_do_count_pages,
            do_ocr=step0_do_ocr,
            google_ai_studio_api_key_filepath=step0_google_api_key,
            ocr_max_concurrency=step0_ocr_max_concurrency,
            ocr_max_api_calls_per_run=step0_ocr_max_api_calls_per_run
        )
        print(f"\nGenerated announcements_documents_file: {announcements_documents_file}")
        print("\n--run_step0_only specified. Exiting after step0.")
        exit(0)

    # 通常モード：データベース必要
    if use_gcp_vm:
        db_operator = DBOperatorGCPVM(
            bigquery_location=bigquery_location,
            bigquery_project_id=bigquery_project_id,
            bigquery_dataset_name=bigquery_dataset_name
        )
    else:
        db_operator = DBOperatorSQLITE3(
            sqlite3_db_file_path=sqlite3_db_file_path
        )

    obj = BidJudgementSan(
        bid_announcements_pre_file=bid_announcements_pre_file,
        tablenamesconfig=TablenamesConfig,
        db_operator=db_operator
    )

    if stop_processing:
        exit(1)

    # Step0: 公告ドキュメント準備処理（オプション）
    if run_step0_prepare_documents:
        if input_list_file is None:
            print("Error: --input_list_file is required when --run_step0_prepare_documents is specified")
            exit(1)

        announcements_documents_file = obj.step0_prepare_documents(
            input_list_file=input_list_file,
            output_base_dir=step0_output_base_dir,
            timestamp=step0_timestamp,
            topAgencyName=step0_topAgencyName,
            no_merge=step0_no_merge,
            use_gcp_vm=use_gcp_vm,
            do_fetch_html=step0_do_fetch_html,
            do_extract_links=step0_do_extract_links,
            do_format_documents=step0_do_format_documents,
            do_download_pdfs=step0_do_download_pdfs,
            do_count_pages=step0_do_count_pages,
            do_ocr=step0_do_ocr,
            google_ai_studio_api_key_filepath=step0_google_api_key,
            ocr_max_concurrency=step0_ocr_max_concurrency,
            ocr_max_api_calls_per_run=step0_ocr_max_api_calls_per_run
        )
        print(f"\nGenerated announcements_documents_file: {announcements_documents_file}")

    # obj.step0_create_bid_announcements_pre(bid_announcements_pre_file=bid_announcements_pre_file)
    # obj.step1_transfer(remove_table=step1_transfer_remove_table)
    obj.step1_transfer_v2(
        announcements_documents_file=announcements_documents_file,
        remove_table=step1_transfer_remove_table
    )

    # step1で止まる場合
    if stop_after_step1:
        print("\n--stop_after_step1 specified. Exiting after step1.")
        exit(0)

    obj.step2_ocr(
        ocr_utils = OCRutils(google_ai_studio_api_key_filepath=google_ai_studio_api_key_filepath),
        condition_doneOCR=condition_doneOCR
    )
    obj.step3(remove_table=step3_remove_table)
    print("Ended step3.")

    master = Master()
    company_master = master.getCompanyMaster()
    office_master = master.getOfficeMaster()
    db_operator.uploadDataToTable(data=office_master, tablename="office_master", chunksize=5000)
    db_operator.uploadDataToTable(data=company_master, tablename="company_master", chunksize=5000)

    partners_master = master.getPartnersMaster()
    partners_branches = master.getPartnersBranches()
    partners_categories = master.getPartnersCategories()
    partners_past_projects = master.getPartnersPastProjects()
    partners_qualifications_orderer_items = master.getPartnersQualificationsOrdererItems()
    partners_qualifications_orderers = master.getPartnersQualificationsOrderers()
    partners_qualifications_unified = master.getPartnersQualificationsUnified()

    if not db_operator.ifTableExists(tablename="partners_master"):
        db_operator.uploadDataToTable(data=partners_master, tablename="partners_master", chunksize=5000)
    if not db_operator.ifTableExists(tablename="partners_branches"):
        db_operator.uploadDataToTable(data=partners_branches, tablename="partners_branches", chunksize=5000)
    if not db_operator.ifTableExists(tablename="partners_categories"):
        db_operator.uploadDataToTable(data=partners_categories, tablename="partners_categories", chunksize=5000)
    if not db_operator.ifTableExists(tablename="partners_past_projects"):
        db_operator.uploadDataToTable(data=partners_past_projects, tablename="partners_past_projects", chunksize=5000)
    if not db_operator.ifTableExists(tablename="partners_qualifications_orderer_items"):
        db_operator.uploadDataToTable(data=partners_qualifications_orderer_items, tablename="partners_qualifications_orderer_items", chunksize=5000)
    if not db_operator.ifTableExists(tablename="partners_qualifications_orderers"):
        db_operator.uploadDataToTable(data=partners_qualifications_orderers, tablename="partners_qualifications_orderers", chunksize=5000)
    if not db_operator.ifTableExists(tablename="partners_qualifications_unified"):
        db_operator.uploadDataToTable(data=partners_qualifications_unified, tablename="partners_qualifications_unified", chunksize=5000)

    announcements_competing_companies_master = master.getAnnouncementsCompetingCompaniesMaster()
    announcements_competing_company_bids_master = master.getAnnouncementsCompetingCompanyBidsMaster()

    db_operator.uploadDataToTable(data=announcements_competing_companies_master, tablename="announcements_competing_companies_master", chunksize=5000)
    db_operator.uploadDataToTable(data=announcements_competing_company_bids_master, tablename="announcements_competing_company_bids_master", chunksize=5000)

    # announcements_documents_master = master.getAnnouncementsDocumentsMaster()
    # db_operator.uploadDataToTable(data=announcements_documents_master, tablename="announcements_documents_master")
    if False:
        announcements_documents_file="source/check_html/use_claude/3_source_formatting/output/announcements_document_202602162218_updated.txt.zip"
        announcements_documents_master = pd.read_csv(announcements_documents_file, sep="\t")
        db_operator.uploadDataToTable(data=announcements_documents_master, tablename="announcements_documents_master")

    # db_operator.selectToTable(tablename="bid_announcements_pre")
    # db_operator.selectToTable(tablename="bid_announcements")
    # db_operator.selectToTable(tablename="bid_requirements")
    # db_operator.any_query(sql=fr"select requirement_type, count(*) as N from bid_requirements group by requirement_type order by N desc")
    # db_operator.selectToTable(tablename="sufficient_requirements")
    # db_operator.selectToTable(tablename="insufficient_requirements")
    # db_operator.selectToTable(tablename="company_bid_judgement")
    # db_operator.selectToTable(tablename="bid_orderer")
    # db_operator.any_query(sql = "SELECT name FROM sqlite_master WHERE type='table'")

    # db_operator.any_query(sql = fr"SELECT table_name FROM `{bigquery_project_id}.{bigquery_dataset_name}.INFORMATION_SCHEMA.TABLES`")
    # db_operator.any_query(sql=fr"select requirement_type, count(*) as N from `{bigquery_project_id}.{bigquery_dataset_name}.bid_requirements` group by requirement_type order by N desc")

    # backend 用意する用
    if False:
        if not db_operator.ifTableExists(tablename="bid_orderer"):
            db_operator.createBidOrderersFromAnnouncements(bid_orderer_tablename="bid_orderer", bid_announcements_tablename="bid_announcements")
        else:
            db_operator.dropTable("bid_orderer")
            db_operator.createBidOrderersFromAnnouncements(bid_orderer_tablename="bid_orderer", bid_announcements_tablename="bid_announcements")

        db_operator.createBackendAnnouncements(tablename="backend_announcements_pre")
        db_operator.createBackendEvaluations(tablename="backend_evaluations_pre")
        db_operator.createBackendCompanies(tablename="backend_companies_pre")
        db_operator.createBackendOrderers(tablename="backend_orderers_pre")
        db_operator.createBackendPartners(tablename="backend_partners_pre")

        db_operator.createBackendAnnouncements(tablename="backend_announcements")
        db_operator.createBackendEvaluations(tablename="backend_evaluations")
        db_operator.createBackendCompanies(tablename="backend_companies")
        db_operator.createBackendOrderers(tablename="backend_orderers")
        db_operator.createBackendPartners(tablename="backend_partners")

        df_backend_announcement = db_operator.selectToTable(tablename="backend_announcements")
        df_backend_evaluations = db_operator.selectToTable(tablename="backend_evaluations")
        df_backend_companies = db_operator.selectToTable(tablename="backend_companies")
        df_backend_orderers = db_operator.selectToTable(tablename="backend_orderers")
        df_backend_partners = db_operator.selectToTable(tablename="backend_partners")

        df_backend_announcement.shape
        df_backend_evaluations.shape
        df_backend_companies.shape
        df_backend_orderers.shape
        df_backend_partners.shape


    if False:
        df_new = pd.read_csv("source/check_html/use_claude/announcements_document.txt",sep="\t")
        col = "announcement_id"
        df_new = df_new[df_new[col] <= 100004]

        bid_announcements_table = "bid_announcements"
        bid_announcements_document_table = "announcements_documents_master"

        # anno_doc はひとまず1回アップロードすればよい
        # db_operator.uploadDataToTable(data=df_new, tablename=bid_announcements_document_table, chunksize=5000)
        # db_operator.dropTable(tablename=bid_announcements_documents_table)

        db_operator.selectToTable(tablename=bid_announcements_document_table)

        db_operator.dropTable(tablename=bid_announcements_table)

        sql = fr"""
        create table {bid_announcements_table} (
        announcement_no integer PRIMARY KEY,
        workName string,
        userAnnNo integer,
        topAgencyNo integer,
        topAgencyName string,
        subAgencyNo integer,
        subAgencyName string,
        workPlace string,

        pdfUrl string,
        pdfUrl2 string,
        pdfUrl3 string,
        pdfUrl4 string,
        pdfUrl5 string,

        pdfUrl_type string,
        pdfUrl2_type string,
        pdfUrl3_type string,
        pdfUrl4_type string,
        pdfUrl5_type string,

        zipcode string,
        address string,
        department string,
        assigneeName string,
        telephone string,
        fax string,
        mail string,
        publishDate string,
        docDistStart string,
        docDistEnd string,
        submissionStart string,
        submissionEnd string,    
        bidStartDate string,
        bidEndDate string,
        doneOCR bool,
        remarks string, 
        createdDate string,
        updatedDate string
        )
        """
        db_operator.cur.execute(sql)
        db_operator.selectToTable(tablename=bid_announcements_table)


        sql = fr"""
        INSERT INTO {bid_announcements_table} (
            announcement_no,
            workName,

            pdfUrl, pdfUrl_type,
            pdfUrl2, pdfUrl2_type,
            pdfUrl3, pdfUrl3_type,
            pdfUrl4, pdfUrl4_type,
            pdfUrl5, pdfUrl5_type,

            doneOCR,
            createdDate,
            updatedDate
        )
        SELECT
            ad.announcement_id,
            MAX(CASE WHEN ad.document_id = 1 THEN ad.title END) AS workName,

            MAX(CASE WHEN ad.document_id = 1 THEN ad.url END) AS pdfUrl,
            MAX(CASE WHEN ad.document_id = 1 THEN ad.type END) AS pdfUrl_type,
            MAX(CASE WHEN ad.document_id = 2 THEN ad.url END) AS pdfUrl2,
            MAX(CASE WHEN ad.document_id = 2 THEN ad.type END) AS pdfUrl2_type,
            MAX(CASE WHEN ad.document_id = 3 THEN ad.url END) AS pdfUrl3,
            MAX(CASE WHEN ad.document_id = 3 THEN ad.type END) AS pdfUrl3_type,
            MAX(CASE WHEN ad.document_id = 4 THEN ad.url END) AS pdfUrl4,
            MAX(CASE WHEN ad.document_id = 4 THEN ad.type END) AS pdfUrl4_type,
            MAX(CASE WHEN ad.document_id = 5 THEN ad.url END) AS pdfUrl5,
            MAX(CASE WHEN ad.document_id = 5 THEN ad.type END) AS pdfUrl5_type,

            0 as doneOCR,

            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM {bid_announcements_document_table} ad
        WHERE NOT EXISTS (
            SELECT 1
            FROM {bid_announcements_table} b
            WHERE b.announcement_no = ad.announcement_id
        )
        GROUP BY ad.announcement_id
        """
        db_operator.cur.execute(sql)

        df_tmp = db_operator.selectToTable(tablename=bid_announcements_table)
        df_tmp.head(5)
        df_tmp.shape
        df_tmp.columns






