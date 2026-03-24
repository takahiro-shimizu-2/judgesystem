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
  - announcements_document_table に DB 保存
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
        --sqlite3_db_file_path data/example.db \\
        --step3_remove_table

    # Step0をスキップして既存のDBデータを使用（announcements_document_table が既に存在する場合）
    # announcements_documents_file パラメータは非推奨（DBから直接読み込み）
    python source/bid_announcement_judgement_tools/main.py \\
        --sqlite3_db_file_path data/example.db

    # GCP VM での実行例
    python source/bid_announcement_judgement_tools/main.py \\
        --bigquery_location "LOCATION" \\
        --bigquery_project_id PROJECT_ID \\
        --bigquery_dataset_name DATASET_NAME \\
        --use_gcp_vm \\
        --step3_remove_table

    # PostgreSQL での実行例
    python source/bid_announcement_judgement_tools/main.py \\
        --postgres_host localhost \\
        --postgres_port 5432 \\
        --postgres_database biddb \\
        --postgres_user postgres \\
        --postgres_password your_password \\
        --use_postgres \\
        --step3_remove_table

Arguments:

- --use_gcp_vm: (フラグ引数)

  GCP VM で動作させる場合に指定する。指定した場合、データベースを操作するオブジェクトとして DBOperatorGCPVM を使い、PDF/Markdown を GCS (gs://) に保存する。PostgreSQL 接続を使う場合も、自動的に GCS 保存を有効にする。

- --use_postgres: (フラグ引数)

  PostgreSQL を使用する場合に指定する。指定した場合、DBOperatorPOSTGRES を使い、PDF/Markdown の保存先は GCS (gs://) に切り替わる（--use_gcp_vm を省略しても同様）。

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

- --postgres_host: (パラメータ引数)

  PostgreSQL のホスト名。

- --postgres_port: (パラメータ引数)

  PostgreSQL のポート番号（デフォルト: 5432）。

- --postgres_database: (パラメータ引数)

  PostgreSQL のデータベース名。

- --postgres_user: (パラメータ引数)

  PostgreSQL のユーザー名。

- --postgres_password: (パラメータ引数)

  PostgreSQL のパスワード。

- --input_list_file: (パラメータ引数)

  リスト_防衛省入札_1.txt のパス（step0_prepare_documentsの入力）。
  --run_step0_prepare_documents を指定する場合は必須。

- --run_step0_prepare_documents: (フラグ引数)

  step0_prepare_documents（HTML取得・リンク抽出・フォーマット）を実行する。

- --run_step0_only: (フラグ引数)

  step0のみ実行して終了する（データベース不要でテスト可能）。

- --step0_output_base_dir: (パラメータ引数)

  step0の出力ベースディレクトリ（デフォルト: output）。

- --step0_topAgencyName: (パラメータ引数)

  トップ機関名（デフォルト: 防衛省）。

- --step0_no_merge: (フラグ引数)

  過去の結果とマージしない。

- --step0_skip_db_save: (フラグ引数)

  step0 の DataFrame 結果を DB に保存しない（ダウンロード済みのファイル確認や OCR のみ行いたい場合に使用）。

- --announcements_documents_file: (パラメータ引数) [非推奨]

  announcements_document ファイルのパス。
  このパラメータは非推奨です。現在の実装では announcements_document_table から DB 経由でデータを読み込みます。

- --step3_remove_table: (フラグ引数)

  step3の要件判定処理で、企業公告マスター・充足要件マスター・不足要件マスターを削除するかどうか。
"""

import pdb
import sqlite3  # sqlite3使わない想定でもimport
import os
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
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import execute_values
except Exception as e:
    print(e)

try:
    from sqlalchemy import create_engine
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
    from packages.engine.requirements.ineligibility import checkIneligibilityDynamic
    from packages.engine.requirements.experience import checkExperienceRequirement
    from packages.engine.requirements.location import checkLocationRequirement
    from packages.engine.requirements.grade_item import checkGradeAndItemRequirement
    from packages.engine.requirements.technician import checkTechnicianRequirement
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


def gcs_upload_from_bytes(gcs_path, data, content_type=None):
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
    if content_type:
        blob.upload_from_string(data, content_type=content_type)
    else:
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

            "announcements_estimated_amounts":"data/master/announcements_estimated_amounts.txt",
            "similar_cases_master":"data/master/similar_cases_master.txt",
            "similar_cases_competitors":"data/master/similar_cases_competitors.txt",
            
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

    def getAnnouncementsEstimatedAmounts(self):
        return pd.read_csv(self.announcements_estimated_amounts, sep="\t")

    def getAnnouncementsDocumentsMaster(self):
        raise NotImplementedError
        return pd.read_csv(self.announcements_documents_master, sep="\t")

    def getSimilarCasesMaster(self):
        return pd.read_csv(self.similar_cases_master, sep="\t")

    def getSimilarCasesCompetitors(self):
        return pd.read_csv(self.similar_cases_competitors, sep="\t")


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


def _convert_requirement_text_dict(requirement_texts):
    """
    要件テキストを変換してDataFrame用の辞書を作成（multiprocessing用グローバル関数）

    Args:
        requirement_texts: {"announcement_no": int, "資格・条件": list}

    Returns:
        dict: DataFrame作成用の辞書
    """
    announcement_no = requirement_texts["announcement_no"]

    # 資格・条件が空の場合はデフォルトレコードを返す
    if not requirement_texts["資格・条件"] or len(requirement_texts["資格・条件"]) == 0:
        return {
            "announcement_no": [announcement_no],
            "requirement_no": [0],
            "requirement_type": ["その他要件"],
            "requirement_text": ["No requirements specified"],
            "createdDate": [datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
            "updatedDate": [datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
        }

    announcement_no_list = []
    requirement_no_list = []
    requirement_type_list = []
    requirement_text_list = []
    createdDate_list = []
    updatedDate_list = []

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
        "その他要件":["jv","共同企業体","出資比率"]
    }

    for i, text in enumerate(requirement_texts["資格・条件"]):
        has_other_req = True
        text_lower = text.lower()
        for req_type, search_list in req_type_list_search_list.items():
            search_str = "|".join(search_list)
            if (req_type != "その他要件" and re.search(search_str, text_lower)) or (req_type == "その他要件" and re.search(search_str, text_lower)) or (req_type == "その他要件" and not re.search(search_str, text_lower) and has_other_req):
                announcement_no_list.append(announcement_no)
                requirement_no_list.append(i)
                requirement_type_list.append(req_type)
                requirement_text_list.append(text)
                createdDate_list.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
                updatedDate_list.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
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
        from packages.engine.requirements.ineligibility import checkIneligibilityDynamic
        from packages.engine.requirements.experience import checkExperienceRequirement
        from packages.engine.requirements.location import checkLocationRequirement
        from packages.engine.requirements.grade_item import checkGradeAndItemRequirement
        from packages.engine.requirements.technician import checkTechnicianRequirement
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

    - step0 : 判定前公告表アップロード（公告マスター／要件マスターの作成・更新まで実施）

    - step3 : 要件判定処理
    
      企業 x 拠点 x 要件の全組み合わせに対して要件判定し結果を企業公告判定マスターに格納する。

      また、充足要件マスターと不足要件マスターを作成する。

    Attributes:

    - tablenamesconfig:

      TablenamesConfig オブジェクト。

    - db_operator:

      データベースを操作するためのオブジェクト。

    """

    def __init__(
        self,
        tablenamesconfig=None,
        db_operator=None,
        gemini_model="gemini-2.5-flash",
        google_api_key_path=None,
        gemini_use_vertex_ai=False,
        vertex_ai_project_id=None,
        vertex_ai_location="asia-northeast1",
        gemini_max_output_tokens=None,
        ocr_json_debug_output_path=None,
    ):
        self.tablenamesconfig = tablenamesconfig
        self.db_operator=db_operator
        self.gemini_model = gemini_model
        self.google_api_key_path = google_api_key_path
        self.gemini_use_vertex_ai = gemini_use_vertex_ai
        self.vertex_ai_project_id = vertex_ai_project_id
        self.vertex_ai_location = vertex_ai_location or "asia-northeast1"
        self.gemini_max_output_tokens = gemini_max_output_tokens
        self.ocr_json_debug_output_path = ocr_json_debug_output_path

    def _create_gemini_client(self, google_api_key=None):
        """
        Create a Gemini client configured for either Vertex AI or API key based authentication.
        """
        if self.gemini_use_vertex_ai:
            project_id = self.vertex_ai_project_id
            if not project_id:
                raise ValueError("Vertex AI project ID is required when gemini_use_vertex_ai is enabled.")
            return genai.Client(
                vertexai=True,
                project=project_id,
                location=self.vertex_ai_location or "asia-northeast1",
            )

        key_path = google_api_key or self.google_api_key_path
        if not key_path:
            raise ValueError("google_api_key is required when Vertex AI is not enabled.")

        path_obj = Path(key_path)
        if not path_obj.exists():
            raise FileNotFoundError(f"Google API key file not found: {path_obj}")

        api_key = path_obj.read_text().strip()
        if not api_key:
            raise ValueError("Google API key file is empty")

        return genai.Client(api_key=api_key)


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
        google_api_key="data/sec/google_ai_studio_api_key_mizu.txt",
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
            google_api_key: Google AI Studio API キーファイルのパス（Vertex AI を使用しない場合に参照）
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
        if do_fetch_html:
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
                google_api_key=google_api_key,
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
                google_api_key=google_api_key,
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
                google_api_key=google_api_key,
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
        ドキュメント情報をフォーマットし、DB用の新規レコードを生成

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
            DataFrame: DB に保存する新規レコードの DataFrame
        """
        # 入力ファイル読み込み
        df1 = pd.read_csv(input_list2_path, sep="\t")
        df2 = pd.read_csv(links_file, sep="\t", quoting=csv.QUOTE_NONE)
        print(f"[DEBUG] Loaded {len(df1)} rows from input_list_converted.txt")
        print(f"[DEBUG] df1 columns: {df1.columns.tolist()}")
        print(f"[DEBUG] Loaded {len(df2)} rows from announcements_links.txt")

        # クォート削除
        df2["announcement_name"] = df2["announcement_name"].str.replace('"', '', regex=False)
        df2["link_text"] = df2["link_text"].str.replace('"', '', regex=False)

        # target_link から index 取得
        df2.insert(0, "index", df2["target_link"].str.split("_").str[0].astype(int))
        df2["adhoc_index"] = df2["target_link"].apply(lambda x: f"{int(x.split('_')[0]):05d}")
        print(f"[DEBUG] Extracted index values: {df2['index'].unique().tolist()}")

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
        print(f"[DEBUG] After merge: {len(df_merged)} rows")
        print(f"[DEBUG] Rows with base_link=None: {df_merged['base_link'].isna().sum()}")

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
        print(f"[DEBUG] Sample document_id values: {df_merged['document_id'].head(10).tolist()}")

        # https: で始まらないレコードを除外
        before_filter_count = len(df_merged)
        print(f"[DEBUG] Before https: filter: {before_filter_count} rows")
        print(f"[DEBUG] Sample pdf_full_url values: {df_merged['pdf_full_url'].head(10).tolist()}")
        df_merged = df_merged[df_merged["pdf_full_url"].str.startswith("https:", na=False)].copy()
        after_filter_count = len(df_merged)
        excluded_count = before_filter_count - after_filter_count
        if excluded_count > 0:
            print(f"[DEBUG] Excluded {excluded_count} records where pdf_full_url does not start with 'https:'")

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

        # ソート
        df_new["_sort_fileformat"] = df_new["fileFormat"].apply(lambda x: 0 if x == "pdf" else 1)
        df_new.sort_values(["announcement_id", "_sort_fileformat", "document_id"], inplace=True)
        df_new = df_new.drop(columns=["_sort_fileformat"])

        print(f"[DEBUG] df_new columns: {df_new.columns.tolist()}")

        # DB ベースのマージ処理
        existing_table = self.tablenamesconfig.bid_announcements_document_table
        print(f"[DEBUG] Before DB comparison: {len(df_new)} records (df_new)")

        if no_merge:
            # no_merge フラグが True の場合、DB 比較をスキップして全レコードを新規扱い
            print("\n--- no_merge flag is True: Skipping DB comparison ---")
            print(f"Treating all {len(df_new)} records as new (no_merge=True)")
            df_new_only = df_new.copy()
        else:
            # DB ベースのマージ処理
            print("\n--- DB-based merge processing ---")
            print(f"[DEBUG] df_new document_id sample: {df_new['document_id'].head(10).tolist()}")

            # 1. df_new を一時テーブルにアップロード
            tmp_table = "tmp_new_announcements_document"
            print(f"Uploading {len(df_new)} records to temporary table: {tmp_table}")
            self.db_operator.uploadDataToTable(df_new, tmp_table, chunksize=5000)

            # 2. 新規レコードのみ取得
            if self.db_operator.ifTableExists(existing_table):
                print(f"Comparing with existing table: {existing_table}")
                df_new_only = self._get_new_documents_from_db(tmp_table, existing_table)
                print(f"[DEBUG] Found {len(df_new_only)} new records (not in DB)")
                if len(df_new_only) > 0:
                    print(f"[DEBUG] New document_id sample: {df_new_only['document_id'].head(10).tolist()}")
            else:
                print(f"Table {existing_table} does not exist. All records are new.")
                df_new_only = df_new.copy()

            # 3. 一時テーブル削除
            self.db_operator.dropTable(tmp_table)
            print(f"Dropped temporary table: {tmp_table}")

        # 4. announcement_id を採番
        if len(df_new_only) > 0:
            print(f"Renumbering announcement_id for {len(df_new_only)} new records...")
            # no_merge=True の場合は既存DBを参照せず、ゼロから採番
            table_for_renumber = None if no_merge else existing_table
            df_new_only = self._renumber_announcement_ids(df_new_only, table_for_renumber, base_digits)
            print(f"Renumbering completed")
        else:
            print("No new records to process. Skipping renumbering.")

        # 5. orderer_id と topAgencyName を更新
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

        Args:
            tmp_table: 一時テーブル名（今回の announcements_document）
            existing_table: 既存テーブル名（announcements_document_table）

        Returns:
            DataFrame: 既存テーブルに存在しない新規レコード
        """
        query = self.db_operator.build_new_documents_query(tmp_table, existing_table)
        return self.db_operator.any_query(query)


    def _renumber_announcement_ids(self, df_new, existing_table, base_digits):
        """
        adhoc_index グループごとに announcement_id を採番
        既存テーブルの最大 announcement_id を考慮

        Args:
            df_new: 新規レコードの DataFrame
            existing_table: 既存テーブル名（announcements_document_table）。None の場合は DB 参照をスキップ
            base_digits: グルーピング桁数（デフォルト: 5）

        Returns:
            DataFrame: announcement_id が採番された DataFrame
        """
        if len(df_new) == 0:
            return df_new

        divisor = 10 ** base_digits  # 例: base_digits=5 → 100000

        # announcement_group を計算（announcement_id の上位桁）
        df_new = df_new.copy()
        df_new["announcement_group"] = df_new["announcement_id"] // divisor

        # グループごとの最大 announcement_id を DB から取得
        max_id_map = {}
        if existing_table is not None and self.db_operator.ifTableExists(existing_table):
            query = self.db_operator.build_max_announcement_id_query(existing_table, divisor)
            df_max_ids = self.db_operator.any_query(query)
            if len(df_max_ids) > 0:
                max_id_map = dict(zip(df_max_ids['announcement_group'], df_max_ids['max_id']))

        result_list = []

        for group in df_new["announcement_group"].unique():
            df_group = df_new[df_new["announcement_group"] == group].copy()

            # このグループの既存最大 ID を取得（なければ group * divisor）
            group_max_id = max_id_map.get(group, group * divisor)
            new_id_counter = group_max_id

            # 元の announcement_id ごとに新しい ID を割り当て
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

        Args:
            df: 保存する DataFrame（新規レコードのみ）
        """
        tablename = self.tablenamesconfig.bid_announcements_document_table

        if len(df) == 0:
            print("No new records to save.")
            return

        # 型を確実に修正（BigQuery対応）
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
            # テーブルが存在しない場合は新規作成
            print(f"Creating new table: {tablename}")
            self.db_operator.uploadDataToTable(df, tablename, chunksize=5000)
            print(f"Created {tablename} with {len(df)} records")
        else:
            self.db_operator.ensure_column(tablename, "ocr_json_path", text_column_type)
            self.db_operator.ensure_column(tablename, "file_404_flag", bool_column_type)
            # 既存テーブルがある場合は MERGE で追加
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

        Args:
            df: 保存する DataFrame（集約された公告情報 + 基本情報）
                - 基本情報: workName, topAgencyName, orderer_id, category, bidType
                - OCR情報: workPlace, assigneeName, publishDate, etc.
        """
        tablename = self.tablenamesconfig.bid_announcements

        if len(df) == 0:
            print("No announcements to save.")
            return

        # 型を確実に修正
        df = df.copy()
        if 'announcement_no' in df.columns:
            df['announcement_no'] = pd.to_numeric(df['announcement_no'], errors='coerce').fillna(0).astype('int64')

        # テーブルが存在しない場合は作成
        if not self.db_operator.ifTableExists(tablename):
            print(f"Creating new table: {tablename}")
            self.db_operator.createBidAnnouncementsV2(tablename)

        # MERGE で追加（重複は無視、INSERT のみ）
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

        Args:
            df: 保存する DataFrame（要件情報）
        """
        tablename = self.tablenamesconfig.bid_requirements

        if len(df) == 0:
            print("No requirements to save.")
            return

        # requirement_no を一括採番
        if not self.db_operator.ifTableExists(tablename):
            self.db_operator.createBidRequirements(tablename)
            print(f"Created new table: {tablename}")
            start_requirement_no = 1
        else:
            # 既存の最大 requirement_no を取得
            max_requirement_no = self.db_operator.getMaxOfColumn(tablename, 'requirement_no')
            if max_requirement_no.iloc[0, 0] is None or pd.isna(max_requirement_no.iloc[0, 0]):
                start_requirement_no = 1
            else:
                start_requirement_no = max_requirement_no.iloc[0, 0] + 1

        # requirement_no を採番
        df = df.copy()
        df['requirement_no'] = range(start_requirement_no, start_requirement_no + len(df))
        df['requirement_no'] = df['requirement_no'].astype('int64')
        df['announcement_no'] = df['announcement_no'].astype('int64')

        # MERGE で追加
        print(f"Merging {len(df)} requirements into {tablename}...")
        tmp_table = 'tmp_bid_requirements_ocr'
        self.db_operator.uploadDataToTable(df, tmp_table, chunksize=5000)
        affected_rows = self.db_operator.mergeRequirements(tablename, tmp_table)
        self.db_operator.dropTable(tmp_table)
        print(f"Merged: {affected_rows} rows inserted")


    def _step0_download_pdfs(self, df, use_gcs=False):
        """
        PDF を URL からダウンロードして保存

        Args:
            df: announcements_document DataFrame (url, save_path, pdf_is_saved columns必要)
            use_gcs: True なら GCS (gs://) へ、False ならローカルへ保存

        Returns:
            pd.DataFrame: pdf_is_saved, pdf_is_saved_date が更新された DataFrame
        """
        # Sleep time parameters
        SLEEP_AFTER_REQUEST = 0.4
        SLEEP_ON_HTTP_ERROR = 0.4
        SLEEP_ON_REQUEST_ERROR = 0.4

        today_str = datetime.now().strftime("%Y-%m-%d")

        # GCS/local パスへの変換
        if use_gcs:
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

            if use_gcs and p.startswith("gs://"):
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
            if not use_gcs and not os.path.exists(save_path_dirname):
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

                # Sleep after successful request
                time.sleep(SLEEP_AFTER_REQUEST)

        return df


    def _build_markdown_path(self, document_id, file_format=None, use_gcs=False):
        """
        Markdownファイルの保存先を生成

        Args:
            document_id: ドキュメントID
            file_format: ファイル形式（pdf, xlsx等）。指定時は {document_id}.{file_format}.md
            use_gcs: GCS保存の場合 True
        """
        doc_id = str(document_id).strip()
        if not doc_id:
            doc_id = str(uuid.uuid4())
        prefix = doc_id.split("_")[0] if "_" in doc_id else doc_id[:6]
        prefix = prefix or "misc"

        # ファイル名: file_format指定時は拡張子付き
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
        google_api_key=None,
        max_concurrency=5,
        max_api_calls_per_run=1000,
        force_regenerate=False
    ):
        """
        PDF から Gemini を使って Markdown 要約を生成し保存する

        Args:
            force_regenerate: True の場合、既存の Markdown ファイルがあっても再生成する
        """
        client = self._create_gemini_client(google_api_key)
        df_main = df_main.copy()
        df_main["document_id"] = df_main["document_id"].astype(str).str.strip()

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

        # 行ごとに処理（PDFのみ）
        iterator = tqdm(df_main.iterrows(), total=len(df_main), desc="Preparing Markdown tasks")
        for idx, row in iterator:
            document_id = str(row.get("document_id", "")).strip()
            file_format = str(row.get("fileFormat", "")).strip().lower()
            save_path = row.get("save_path")

            if document_id in ("", "nan", "None"):
                continue

            # PDFのみ処理（Gemini APIはxlsx/docx/zipをサポートしていない）
            if file_format != "pdf":
                continue

            # Markdown保存先: {document_id}.{fileFormat}.md
            md_path = self._build_markdown_path(document_id, file_format=file_format, use_gcs=use_gcs)
            key = (document_id, file_format)

            # 既に処理済みまたはファイル存在チェック
            if key in doc_to_md_path:
                continue
            doc_to_md_path[key] = md_path

            if self._path_exists_with_cache(md_path, file_cache) and not force_regenerate:
                mask = (df_main["document_id"] == document_id) & (df_main["fileFormat"] == file_format)
                df_main.loc[mask, "markdown_path"] = md_path
                continue

            # ファイルパス存在チェック
            if pd.isna(save_path) or not self._path_exists_with_cache(save_path, file_cache):
                skipped_docs.append(f"{document_id}.{file_format}")
                continue

            # Gemini API呼び出しパラメータ
            params.append([
                self._PROMPT_MD,
                document_id,
                file_format,  # 実際のファイル形式を渡す
                self.gemini_model,
                "md",
                use_gcs,
                save_path  # 実際のファイルパスを渡す
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

                # markdown_path カラムにパスを保存（document_id + fileFormat でマッチ）
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
        google_api_key=None,
        max_concurrency=5,
        max_api_calls_per_run=1000,
        force_regenerate=False,
        debug_output_list_path=None
    ):
        """
        Gemini を使って OCR JSON を生成し保存する
        """
        client = self._create_gemini_client(google_api_key)
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
        google_api_key=None,
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

        # DBごとのクォートルールに合わせて fileFormat 列を小文字化
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
            google_api_key=google_api_key,
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
        google_api_key=None,
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
            google_api_key=google_api_key,
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

        Args:
            df: announcements_document DataFrame (save_path, pageCount columns必要)

        Returns:
            pd.DataFrame: pageCount が更新された DataFrame
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

        # 型を確実に int64 に統一
        df["pageCount"] = df["pageCount"].astype('int64')
        print(f"pageCount status: {df['pageCount'].value_counts(dropna=False).to_dict()}")

        return df


    def _select_best_value(self, values):
        """
        複数の値から "もっともらしい" 値を選択

        Args:
            values: 値のリスト

        Returns:
            最適な値（欠損値を除外した後の最頻値、または最初の非欠損値）
        """
        # 欠損値を除外
        valid_values = [
            v for v in values
            if v is not None
            and v != ''
            and str(v).lower() not in ['null', 'nan', 'none']
        ]

        if not valid_values:
            return None

        # 最頻値を計算（同頻度の場合は最初の値）
        from collections import Counter
        counter = Counter(valid_values)
        most_common = counter.most_common(1)[0][0]

        return most_common


    def _step0_ocr_with_gemini(
        self,
        df_main,
        use_gcs=False,
        google_api_key=None,
        max_concurrency=5,
        max_api_calls_per_run=1000
    ):
        """
        Gemini APIを使用してPDFからOCR処理を実行し、DBに保存

        Args:
            df_main: announcements_document の DataFrame
            use_gcs: GCS (gs://) を使用する場合 True
            google_api_key: Google AI Studio API key filepath (used when Vertex AI is disabled)
            max_concurrency: 並列実行数
            max_api_calls_per_run: 1回の実行での最大API呼び出し数（デフォルト: 1000）

        Returns:
            pd.DataFrame: 更新されたメインDataFrame
        """
        print("=" * 60)
        print("Step0-6: OCR with Gemini")
        print("=" * 60)

        client = self._create_gemini_client(google_api_key)

        # DataFrameのコピーを作成（元のデータを変更しない）
        df_main = df_main.copy()
        df_main["document_id"] = df_main["document_id"].astype(str).str.strip()

        # done列の初期化
        if "done" in df_main.columns:
            df_main["done"] = (
                df_main["done"]
                .map({True: True, False: False, "True": True, "False": False})
                .fillna(False)
                .astype(bool)
            )
        else:
            df_main["done"] = False

        # requirements の存在チェック（DB上でJOIN）
        tablename_requirements = self.tablenamesconfig.bid_requirements
        tmp_check_table = "tmp_req_check"

        df_check = pd.DataFrame({'announcement_id': df_main['announcement_id'].unique().astype(int)})
        self.db_operator.uploadDataToTable(df_check, tmp_check_table, chunksize=5000)

        if self.db_operator.ifTableExists(tablename_requirements):
            df_req_status = self.db_operator.checkRequirementsExist(tmp_check_table, tablename_requirements)
            req_done_lookup = df_req_status.set_index('announcement_id')['req_exists'].to_dict()
            # bool に変換（BigQuery は TRUE/FALSE、SQLite は 1/0）
            req_done_lookup = {k: bool(v) for k, v in req_done_lookup.items()}
        else:
            # テーブルが存在しない場合は全て False
            req_done_lookup = {ann_id: False for ann_id in df_main['announcement_id']}

        self.db_operator.dropTable(tmp_check_table)
        print(f"Checked requirements existence for {len(req_done_lookup)} announcements")

        # デバッグ: req_done_lookup の内容を表示
        req_done_true = [k for k, v in req_done_lookup.items() if v]
        req_done_false = [k for k, v in req_done_lookup.items() if not v]
        print(f"[DEBUG] req_done=True: {len(req_done_true)} announcements: {req_done_true[:5]}")
        print(f"[DEBUG] req_done=False: {len(req_done_false)} announcements: {req_done_false[:5]}")

        # パラメータリスト作成
        params = []
        print("Preparing parameters for Gemini API calls...")

        # デバッグ: df_mainのdocument_id重複チェック
        doc_id_counts = df_main['document_id'].value_counts()
        duplicate_docs = doc_id_counts[doc_id_counts > 1]
        if len(duplicate_docs) > 0:
            print(f"[DEBUG] df_main contains {len(duplicate_docs)} duplicate document_ids (same PDF, multiple announcements):")
            print(f"[DEBUG] Duplicates: {duplicate_docs.to_dict()}")

        # 要件文抽出用に処理済みdocument_idを記録（同じPDF/テキストを複数回APIに送らないため）
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

            # PDFファイルパス確認
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

            # 公告情報抽出用パラメータ
            if not ann_done:
                # data_type は結果を pdf 保存先へ紐付けるキーとして使う（text_override があっても "pdf" を維持する）
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

            # 要件文抽出用パラメータ（同じPDFを複数回APIに送らないため、document_idごとに1回のみ）
            # ただし、結果は同じdocument_idを参照する全てのannouncement_idに保存される
            if not req_done and document_id not in processed_docs:
                # text_override 時も Markdown/OCR 保存先は pdf 名なので data_type は "pdf" 固定
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
            # 1回の実行での処理数制限チェック
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

        # デバッグ: req API呼び出しの対象document_idを表示
        req_docs = [p[1] for p in params if p[4] == "req"]
        if req_docs:
            print(f"[DEBUG] Documents for req API calls: {req_docs[:10]}")  # 最初の10件

        # 並列実行
        if len(params) > 0:
            print(f"Calling Gemini API with max_concurrency={max_concurrency}...")
            start_time = time.time()
            results = asyncio.run(self._call_parallel(client, params, max_concurrency))
            elapsed_time = time.time() - start_time
            print(f"Gemini API processing completed in {elapsed_time:.2f} seconds")

            # 公告情報結果処理
            ann_results = [r for r in results if r.get("type") == "ann"]
            ann_done_updates = 0

            # announcement_id 単位で集約するための準備
            # 同じ document_id に複数の announcement_id がある場合に対応
            doc_id_to_ann_ids = df_main.groupby('document_id')['announcement_id'].apply(list).to_dict()

            if len(ann_results) > 0:
                # document 単位で OCR 結果を収集
                doc_records = []  # document固有情報（pageCount, done）用
                ann_records_by_doc = {}  # announcement固有情報を document 単位で収集

                for res in tqdm(ann_results, desc="Processing announcement results"):
                    document_id = res["document_id"]
                    announcement_ids = doc_id_to_ann_ids.get(document_id, [])

                    try:
                        # エラーチェック
                        if res.get("error") is not None:
                            tqdm.write(f"API error for {document_id}: {res.get('error')}")
                            # エラー時は done=True, is_ocr_failed=True
                            doc_records.append({"document_id": document_id, "done": True, "is_ocr_failed": True})

                            # エラー時でも announcement にレコードを作成（NULL値 + ocr_failed フラグ）
                            for announcement_id in announcement_ids:
                                if announcement_id not in ann_records_by_doc:
                                    ann_records_by_doc[announcement_id] = []
                                ann_records_by_doc[announcement_id].append({
                                    "document_id": document_id,
                                    "workplace": None,
                                    "zipcode": None,
                                    "address": None,
                                    "department": None,
                                    "assigneename": None,
                                    "telephone": None,
                                    "fax": None,
                                    "mail": None,
                                    "publishdate": None,
                                    "bidType": None,
                                    "type": None,
                                    "category": None,
                                    "docdiststart": None,
                                    "docdistend": None,
                                    "submissionstart": None,
                                    "submissionend": None,
                                    "bidstartdate": None,
                                    "bidenddate": None,
                                    "ocr_failed": True,  # エラーフラグ
                                })

                            ann_done_updates += 1
                            continue

                        json_str = res["result"].replace('\n', '').replace('```json', '').replace('```', '')
                        dict0 = json.loads(json_str)
                        dict0 = self._convertJson(dict0)

                        # document固有情報（pageCount, done, is_ocr_failed）
                        doc_records.append({
                            "document_id": document_id,
                            "pageCount": dict0.get("pageCount"),
                            "done": True,
                            "is_ocr_failed": False
                        })

                        # announcement固有情報を収集（後で集約）
                        # 同じPDFに紐づく全てのannouncement_idに対して同じOCR結果を保存
                        for announcement_id in announcement_ids:
                            if announcement_id not in ann_records_by_doc:
                                ann_records_by_doc[announcement_id] = []

                            ann_records_by_doc[announcement_id].append({
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
                                "docdiststart": dict0.get("docdiststart"),
                                "docdistend": dict0.get("docdistend"),
                                "submissionstart": dict0.get("submissionstart"),
                                "submissionend": dict0.get("submissionend"),
                                "bidstartdate": dict0.get("bidstartdate"),
                                "bidenddate": dict0.get("bidenddate"),
                                "ocr_failed": False,  # 成功
                            })

                        ann_done_updates += 1
                    except Exception as e:
                        tqdm.write(f"Error processing {document_id}: {e}")
                        # Exception時も done=True, is_ocr_failed=True
                        doc_records.append({"document_id": document_id, "done": True, "is_ocr_failed": True})

                        # Exception時でも announcement にレコードを作成（NULL値 + ocr_failed フラグ）
                        for announcement_id in announcement_ids:
                            if announcement_id not in ann_records_by_doc:
                                ann_records_by_doc[announcement_id] = []
                            ann_records_by_doc[announcement_id].append({
                                "document_id": document_id,
                                "workplace": None,
                                "zipcode": None,
                                "address": None,
                                "department": None,
                                "assigneename": None,
                                "telephone": None,
                                "fax": None,
                                "mail": None,
                                "publishdate": None,
                                "bidType": None,
                                "type": None,
                                "category": None,
                                "docdiststart": None,
                                "docdistend": None,
                                "submissionstart": None,
                                "submissionend": None,
                                "bidstartdate": None,
                                "bidenddate": None,
                                "ocr_failed": True,  # エラーフラグ
                            })

                        ann_done_updates += 1

                # df_main に document固有情報（pageCount, done）をマージ
                df_doc_records = pd.DataFrame(doc_records)
                df_doc_records = df_doc_records.drop_duplicates(subset="document_id", keep="first")

                df_main = df_main.merge(df_doc_records, on="document_id", how="left", suffixes=("", "_new"))

                # done列の更新
                if "done_new" in df_main.columns:
                    df_main["done"] = (df_main["done"] | df_main["done_new"].fillna(False)).astype("boolean")
                    df_main.drop(columns=["done_new"], inplace=True, errors="ignore")

                # pageCount列の更新
                if "pageCount_new" in df_main.columns:
                    df_main["pageCount"] = df_main["pageCount_new"].fillna(df_main.get("pageCount"))
                    df_main.drop(columns=["pageCount_new"], inplace=True, errors="ignore")

                # is_ocr_failed列の更新
                if "is_ocr_failed_new" in df_main.columns:
                    df_main["is_ocr_failed"] = (df_main["is_ocr_failed"] | df_main["is_ocr_failed_new"].fillna(False)).astype("boolean")
                    df_main.drop(columns=["is_ocr_failed_new"], inplace=True, errors="ignore")

                # announcement_id 単位で集約して df_announcements を作成
                aggregated_announcements = []
                for announcement_id, docs_data in ann_records_by_doc.items():
                    # df_main から基本情報を取得（複数行から最適な値を選択）
                    ann_docs = df_main[df_main['announcement_id'] == announcement_id]
                    if len(ann_docs) > 0:
                        workName = self._select_best_value(ann_docs['title'].tolist())
                        topAgencyName = self._select_best_value(ann_docs['topAgencyName'].tolist())
                        orderer_id = self._select_best_value(ann_docs['orderer_id'].tolist())
                    else:
                        workName = None
                        topAgencyName = None
                        orderer_id = None

                    # 各フィールドについて、複数 document から最適な値を選択
                    # category, bidType は OCR結果のみから取得
                    category_ocr = self._select_best_value([d["category"] for d in docs_data])
                    bidType_ocr = self._select_best_value([d["bidType"] for d in docs_data])

                    # is_ocr_failed: 1つでも失敗していたら True
                    has_ocr_failure = any(d.get("ocr_failed", False) for d in docs_data)

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
                        "docDistStart": self._select_best_value([d["docdiststart"] for d in docs_data]),
                        "docDistEnd": self._select_best_value([d["docdistend"] for d in docs_data]),
                        "submissionStart": self._select_best_value([d["submissionstart"] for d in docs_data]),
                        "submissionEnd": self._select_best_value([d["submissionend"] for d in docs_data]),
                        "bidStartDate": self._select_best_value([d["bidstartdate"] for d in docs_data]),
                        "bidEndDate": self._select_best_value([d["bidenddate"] for d in docs_data]),
                        "is_ocr_failed": has_ocr_failure,
                        "doneOCR": True,
                        "createdDate": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        "updatedDate": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    }
                    aggregated_announcements.append(aggregated)

                df_announcements = pd.DataFrame(aggregated_announcements) if aggregated_announcements else pd.DataFrame()

                print(f"Updated {len(doc_records)} documents with pageCount and done status")
                print(f"Aggregated {len(aggregated_announcements)} announcements from {len(ann_results)} OCR results")
            else:
                df_announcements = pd.DataFrame()

            # 要件文結果処理 → DataFrame で返す
            req_results = [r for r in results if r.get("type") == "req"]
            db_req_records = []

            if len(req_results) > 0:
                # document_id → announcement_id のマッピング作成（複数の announcement_id に対応）
                doc_to_ann_ids = df_main.groupby('document_id')['announcement_id'].apply(list).to_dict()

                for res in tqdm(req_results, desc="Processing requirement results"):
                    document_id = res["document_id"]
                    announcement_ids = doc_to_ann_ids.get(document_id, [])

                    try:
                        # エラーがあるかチェック
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

                        # 資格・条件リストを取得
                        if isinstance(requirement_texts, dict) and "資格・条件" in requirement_texts:
                            req_list = requirement_texts["資格・条件"]
                        elif isinstance(requirement_texts, list):
                            req_list = requirement_texts
                        else:
                            req_list = ["Error fetching requirements."]

                        # 各 announcement_id に対して要件を保存（同じPDFを参照する全ての公告に保存）
                        for announcement_id in announcement_ids:
                            # リスト展開 + requirement_type 判定 + レコード作成
                            for idx, req_text in enumerate(req_list):
                                req_type = self._classify_requirement_type(req_text)
                                db_req_records.append({
                                    'document_id': document_id,
                                    'announcement_no': announcement_id,
                                    'requirement_no': None,  # 後で一括採番
                                    'requirement_text': req_text,
                                    'requirement_type': req_type,
                                    'is_ocr_failed': has_error,
                                    'done_judgement': False,
                                    'createdDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                    'updatedDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                                })

                    except Exception as e:
                        tqdm.write(f"Error processing requirements for {document_id}: {e}")
                        # エラー時もダミーレコードを作成（全ての announcement_id に対して）
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

        return df_main, df_announcements, df_requirements


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

                # paramsの形式:
                # [prompt, document_id, data_type, model, type2, use_gcs, save_path(optional), text_override(optional)]
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

        Args:
            save_path: 実際のファイルパス。指定時はこれを優先使用
        """
        # ファイルデータ取得
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
                # save_pathが指定されている場合はそれを使用
                if use_gcs and save_path.startswith("gs://"):
                    from google.cloud import storage
                    storage_client = storage.Client()
                    # gs://bucket/path/to/file.ext から bucket と path を抽出
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
                # 従来の方法（後方互換性）
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

        # Gemini API呼び出し
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
"pageCount" : "",
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

    _PROMPT_OCR_JSON = """
You are an OCR and document-structure extraction system.
Return plain extracted text from the PDF and a compact JSON structure summary.
Output JSON with keys:
- extracted_text
- normalized_structure
Do not add explanations outside JSON.
"""

    _PROMPT_MD = """
あなたは日本語の建設・調達関連文書を要約する専門アシスタントです。添付 PDF の内容を読み、次のルールに従って Markdown でまとめてください。

ルール:
1. 出力は Markdown だけにし、余計な説明や JSON は付けない。
2. 以下のセクション構成を必ず守る:
   # 概要
   ## 日程
   ## 発注者・問い合わせ先
   ## 主要条件
   ## その他特記事項
3. それぞれのセクションでは原文の日本語を尊重し、必要に応じて箇条書きで整理する。情報が無い場合は「情報なし」と明記する。
4. 日付は判読できる場合 YYYY-MM-DD 形式に変換する。難しい場合は原文のまま残す。
5. 数値や固有名詞は可能な限り具体的に保つ。
"""


    def _classify_requirement_type(self, text):
        """
        要件文から requirement_type を判定

        Args:
            text: 要件文のテキスト

        Returns:
            str: 要件タイプ（欠格要件、業種・等級要件、所在地要件、技術者要件、実績要件、その他要件）
        """
        req_type_list_search_list = {
            "欠格要件": [
                "70条", "71条", "会社更生法", "民事再生法", "更生手続",
                "再生手続", "情報保全", "資本関係", "人的関係", "滞納",
                "外国法", "取引停止", "破産", "暴力団", "指名停止",
                "後見人", "法人格取消"
            ],
            "業種・等級要件": ["競争参加資格", "一般競争", "指名競争", "等級", "総合審査"],
            "所在地要件": ["所在", "県内", "市内", "防衛局管内", "本店が", "支店が"],
            "技術者要件": [
                "施工管理技士", "技術士", "資格者証", "電気工事士", "建築士",
                "基幹技能者", "監理技術者", "主任技術者", "監理技術者資格者証", "監理技術者講習修了証"
            ],
            "実績要件": [
                "実績", "工事成績", "元請けとして", "元請として", "点以上",
                "jv比率", "過去実績"
            ],
            "その他要件": ["jv", "共同企業体", "出資比率"]
        }

        text_lower = text.lower()
        for req_type, search_list in req_type_list_search_list.items():
            if req_type == "その他要件":
                continue
            search_str = "|".join(search_list)
            if re.search(search_str, text_lower):
                return req_type
        return "その他要件"

    def convertRequirementTextDict(self, requirement_texts):
        """
        公告データから取得した json ライクな公告情報を整形して json とする。

        Args:

        - requirement_texts

          json ライクな要件文
        """

        # requirement_texts = {"announcement_no":1, "資格・条件":["(2)令和07・08・09年度防衛省競争参加資格(全省庁統一資格)の「役務の提供等」において、開札時までに「C」又は「D」の等級に格付けされ北海道地域の競争参加を希望する者であること(会社更生法(平成14年法律第154号)に基づき更生手続開始の申立てがなされている者又は民事再生法(平成11年法律第225号)に基づき再生手続開始の申立てがなされている者については、手続開始の決定後、再度級別の格付けを受けていること。)。"]}
        announcement_no = requirement_texts["announcement_no"]

        # 資格・条件が空の場合はデフォルトレコードを返す
        if not requirement_texts["資格・条件"] or len(requirement_texts["資格・条件"]) == 0:
            return {
                "announcement_no": [announcement_no],
                "requirement_no": [0],
                "requirement_type": ["その他要件"],
                "requirement_text": ["No requirements specified"],
                "createdDate": [datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
                "updatedDate": [datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
            }

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
                    createdDate_list.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
                    updatedDate_list.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
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

        tablename_bid_announcements_document_table = self.tablenamesconfig.bid_announcements_document_table

        db_operator = self.db_operator

        required_tables = [
            tablename_bid_announcements_document_table,
            tablename_announcements,
            tablename_requirements
        ]
        missing_tables = [
            name for name in required_tables
            if not db_operator.ifTableExists(tablename=name)
        ]
        if missing_tables:
            print("Error: 必要な基礎テーブルが存在しません。")
            print(f"Missing tables: {', '.join(missing_tables)}")
            print("step0_prepare_documents を実行してデータを作成してください。")
            return

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
        if len(df0) > 0:
            print(f"[DEBUG] Target combinations (announcement_no, company_no, office_no):")
            print(df0[['announcement_no', 'company_no', 'office_no']].to_string(index=False, max_rows=20))

        # 並列処理では連番採番時に重複が発生するため UUID を使用

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
