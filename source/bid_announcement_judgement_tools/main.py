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
        --sqlite3_db_file_path data/example.db \\
        --step1_transfer_remove_table \\
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
        --step1_transfer_remove_table \\
        --step3_remove_table

    # PostgreSQL での実行例
    python source/bid_announcement_judgement_tools/main.py \\
        --postgres_host localhost \\
        --postgres_port 5432 \\
        --postgres_database biddb \\
        --postgres_user postgres \\
        --postgres_password your_password \\
        --use_postgres \\
        --step1_transfer_remove_table \\
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
  このフラグを指定すると、step1以降は実行されない。

- --step0_output_base_dir: (パラメータ引数)

  step0の出力ベースディレクトリ（デフォルト: output）。

- --step0_topAgencyName: (パラメータ引数)

  トップ機関名（デフォルト: 防衛省）。

- --step0_no_merge: (フラグ引数)

  過去の結果とマージしない。

- --announcements_documents_file: (パラメータ引数) [非推奨]

  announcements_document ファイルのパス。
  このパラメータは非推奨です。現在の実装では announcements_document_table から DB 経由でデータを読み込みます。

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

    def __init__(self, sqlite3_db_file_path=None, bigquery_location=None, bigquery_project_id=None, bigquery_dataset_name=None,
                 postgres_host=None, postgres_port=None, postgres_database=None, postgres_user=None, postgres_password=None):
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

        - postgres_host

          PostgreSQL のホスト名

        - postgres_port

          PostgreSQL のポート番号

        - postgres_database

          PostgreSQL のデータベース名

        - postgres_user

          PostgreSQL のユーザー名

        - postgres_password

          PostgreSQL のパスワード
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

        # PostgreSQL 接続情報を保存
        self.postgres_host = postgres_host
        self.postgres_port = postgres_port
        self.postgres_database = postgres_database
        self.postgres_user = postgres_user
        self.postgres_password = postgres_password

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

    def createIndex(self, index_name, table_name, columns):
        """
        インデックスを作成する（抽象メソッド）

        Args:
            index_name (str): インデックス名
            table_name (str): テーブル名
            columns (str or list): カラム指定
        """
        raise NotImplementedError

    @abstractmethod
    def ensure_column(self, tablename, column_name, column_type):
        """
        対象テーブルに指定カラムが無い場合は追加する
        """
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
    def updateAnnouncements(self, bid_announcements_tablename, bid_announcements_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def getMaxOfColumn(self, tablename, column_name):
        raise NotImplementedError

    @abstractmethod
    def showAllTables(self):
        """
        データベース内の全テーブル一覧を DataFrame で返す

        Returns:
            DataFrame: テーブル名の列を持つ DataFrame
        """
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
    def createWorkflowContacts(self, workflow_contacts_tablename):
        raise NotImplementedError

    @abstractmethod
    def createEvaluationAssignees(self, evaluation_assignees_tablename, workflow_contacts_tablename="workflow_contacts"):
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
    def mergeAnnouncementsDocumentTable(self, target_tablename, source_tablename, columns):
        """
        announcements_document_table に新しいレコードをマージ（UPSERT）する

        document_id で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）
            columns: 挿入する列のリスト

        Returns:
            int: 挿入された行数
        """
        raise NotImplementedError

    @abstractmethod
    def updateMarkdownPaths(self, tablename, df_markdown):
        """
        announcements_documents_master の markdown_path を更新する

        Args:
            tablename: 対象テーブル名
            df_markdown: document_id / fileFormat / markdown_path を含む DataFrame
        """
        raise NotImplementedError

    @abstractmethod
    def updateOcrJsonPaths(self, tablename, df_json):
        """
        announcements_documents_master の ocr_json_path を更新する

        Args:
            tablename: 対象テーブル名
            df_json: document_id / fileFormat / ocr_json_path を含む DataFrame
        """
        raise NotImplementedError

    @abstractmethod
    def mergeBidAnnouncements(self, target_tablename, source_tablename):
        """
        bid_announcements に新しいレコードを挿入する

        announcement_no で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）

        Returns:
            int: 挿入された行数
        """
        raise NotImplementedError

    @abstractmethod
    def mergeRequirements(self, target_tablename, source_tablename):
        """
        bid_requirements に新しいレコードをマージ（UPSERT）する

        document_id で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。
        同じdocument_idの要件が既に存在する場合、その要件セット全体をスキップする。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）

        Returns:
            int: 挿入された行数
        """
        raise NotImplementedError

    @abstractmethod
    def checkRequirementsExist(self, tmp_check_table, requirements_table):
        """
        一時テーブルの document_id について、requirements テーブルにレコードが存在するかチェック

        Args:
            tmp_check_table: チェック対象の document_id を含む一時テーブル
            requirements_table: チェック先の requirements テーブル

        Returns:
            DataFrame: document_id と req_exists (bool) の列を持つ DataFrame
        """
        raise NotImplementedError

    @abstractmethod
    def build_new_documents_query(self, tmp_table, existing_table):
        """
        一時テーブルと既存テーブルを document_id で比較し、新規レコードを取得するクエリを生成

        Args:
            tmp_table: 一時テーブル名
            existing_table: 既存テーブル名

        Returns:
            str: SQL クエリ
        """
        raise NotImplementedError

    @abstractmethod
    def build_max_announcement_id_query(self, existing_table, divisor):
        """
        既存テーブルからグループごとの最大 announcement_id を取得するクエリを生成

        Args:
            existing_table: 既存テーブル名
            divisor: グルーピング用の除数（10^base_digits）

        Returns:
            str: SQL クエリ
        """
        raise NotImplementedError

    @abstractmethod
    def selectUnprocessedAnnouncementDocuments(self, announcements_document_tablename, requirements_tablename, requirements_exists):
        """
        未処理の announcement-document ペアを取得する

        requirements テーブルが存在する場合は、既に処理済みの announcement_no を除外し、
        未処理のものだけを返す。存在しない場合は全ての announcement-document ペアを返す。

        Args:
            announcements_document_tablename: announcements_document_table のテーブル名
            requirements_tablename: requirements テーブル名
            requirements_exists: requirements テーブルが存在するか（True/False）

        Returns:
            DataFrame: announcement_no, document_id の列を持つ DataFrame
        """
        raise NotImplementedError

    @abstractmethod
    def createBackendCompanies(self, tablename):
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

    def showAllTables(self):
        """
        BigQuery データセット内の全テーブル一覧を DataFrame で返す

        Returns:
            DataFrame: table_name 列を持つ DataFrame
        """
        sql = fr"""
        SELECT table_name
        FROM `{self.project_id}.{self.dataset_name}.INFORMATION_SCHEMA.TABLES`
        ORDER BY table_name
        """
        df = self.client.query(sql).result().to_dataframe()
        return df

    def dropTable(self, tablename):
        self.client.delete_table(fr"{self.project_id}.{self.dataset_name}.{tablename}", not_found_ok=True)

    def uploadDataToTable(self, data, tablename, chunksize=1):
        # デバッグ: データ型を確認
        if 'pageCount' in data.columns:
            print(f"[DEBUG uploadDataToTable] pageCount dtype: {data['pageCount'].dtype}")
            print(f"[DEBUG uploadDataToTable] pageCount sample values: {data['pageCount'].head().tolist()}")

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

    def createIndex(self, index_name, table_name, columns):
        """BigQuery はインデックスをサポートしていないため未実装"""
        raise NotImplementedError("BigQuery does not support explicit indexes")

    def ensure_column(self, tablename, column_name, column_type):
        if not self.ifTableExists(tablename):
            return
        sql = f"""
        ALTER TABLE `{self.project_id}.{self.dataset_name}.{tablename}`
        ADD COLUMN IF NOT EXISTS `{column_name}` {column_type}
        """
        self.client.query(sql).result()

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
        bidType string,
        is_ocr_failed bool
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
            'national' as category,
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
        document_id string,
        announcement_no int64,
        requirement_no int64,
        requirement_type string,
        requirement_text string,
        done_judgement bool,
        createdDate string,
        updatedDate string,
        is_ocr_failed bool
        )
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

    def createWorkflowContacts(self, workflow_contacts_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{workflow_contacts_tablename}` (
            contact_id string default generate_uuid(),
            name string,
            role string,
            department string,
            email string,
            phone string,
            notes string,
            is_active bool default true,
            created_at timestamp default current_timestamp(),
            updated_at timestamp default current_timestamp()
        )
        """
        self.client.query(sql).result()

    def createEvaluationAssignees(self, evaluation_assignees_tablename, workflow_contacts_tablename="workflow_contacts"):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{evaluation_assignees_tablename}` (
            evaluation_no string,
            step_id string,
            contact_id string,
            assigned_role string,
            assigned_at timestamp default current_timestamp(),
            assigned_by string
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
        # preselectCompanyBidJudgementで未判定のみ取得済み、かつUUID使用のため単純INSERTでOK
        sql = f"""
        INSERT INTO `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename}` (
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
        SELECT
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
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', createdDate),
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', updatedDate)
        FROM `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename_for_update}`
        """
        self.client.query(sql).result()

    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        # UUID使用のため単純INSERTでOK
        sql = f"""
        INSERT INTO `{self.project_id}.{self.dataset_name}.{sufficient_requirements_tablename}` (
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
        SELECT
            sufficiency_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', createdDate),
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', updatedDate)
        FROM `{self.project_id}.{self.dataset_name}.{sufficient_requirements_tablename_for_update}`
        """
        self.client.query(sql).result()

    def updateInsufficientRequirements(self, insufficient_requirements_tablename, insufficient_requirements_tablename_for_update):
        # UUID使用のため単純INSERTでOK
        sql = f"""
        INSERT INTO `{self.project_id}.{self.dataset_name}.{insufficient_requirements_tablename}` (
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
        SELECT
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
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', createdDate),
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', updatedDate)
        FROM `{self.project_id}.{self.dataset_name}.{insufficient_requirements_tablename_for_update}`
        """
        self.client.query(sql).result()

    def mergeAnnouncementsDocumentTable(self, target_tablename, source_tablename, columns):
        """
        BigQuery MERGE文で announcements_document_table に新しいレコードを挿入

        document_id で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）
            columns: 挿入する列のリスト

        Returns:
            int: 挿入された行数
        """
        # BigQueryでは `:` を含むカラム名はバッククォートで囲む必要がある
        columns_escaped = [f"`{col}`" for col in columns]
        columns_str = ", ".join(columns_escaped)
        values_str = ", ".join([f"S.`{col}`" for col in columns])

        # MERGE文を構築（document_id のみで重複チェック）
        merge_sql = f"""
        MERGE `{self.project_id}.{self.dataset_name}.{target_tablename}` AS T
        USING `{self.project_id}.{self.dataset_name}.{source_tablename}` AS S
        ON T.document_id = S.document_id
        WHEN NOT MATCHED THEN
          INSERT ({columns_str})
          VALUES ({values_str})
        """

        # MERGE文を実行
        query_job = self.client.query(merge_sql)
        query_job.result()  # 完了を待つ
        return query_job.num_dml_affected_rows

    def updateMarkdownPaths(self, tablename, df_markdown):
        if df_markdown.empty:
            return 0

        tmp_table = "tmp_markdown_updates"
        df_tmp = df_markdown[["document_id", "fileFormat", "markdown_path"]].dropna()
        if df_tmp.empty:
            return 0

        self.uploadDataToTable(df_tmp, tmp_table, chunksize=5000)
        sql = f"""
        MERGE `{self.project_id}.{self.dataset_name}.{tablename}` AS T
        USING `{self.project_id}.{self.dataset_name}.{tmp_table}` AS S
        ON T.document_id = S.document_id AND T.fileFormat = S.fileFormat
        WHEN MATCHED THEN
          UPDATE SET T.markdown_path = S.markdown_path
        """
        job = self.client.query(sql)
        job.result()
        self.dropTable(tmp_table)
        return job.num_dml_affected_rows

    def updateOcrJsonPaths(self, tablename, df_json):
        if df_json.empty:
            return 0

        tmp_table = "tmp_ocr_json_updates"
        df_tmp = df_json[["document_id", "fileFormat", "ocr_json_path"]].dropna()
        if df_tmp.empty:
            return 0

        self.uploadDataToTable(df_tmp, tmp_table, chunksize=5000)
        sql = f"""
        MERGE `{self.project_id}.{self.dataset_name}.{tablename}` AS T
        USING `{self.project_id}.{self.dataset_name}.{tmp_table}` AS S
        ON T.document_id = S.document_id AND T.fileFormat = S.fileFormat
        WHEN MATCHED THEN
          UPDATE SET T.ocr_json_path = S.ocr_json_path
        """
        job = self.client.query(sql)
        job.result()
        self.dropTable(tmp_table)
        return job.num_dml_affected_rows

    def mergeRequirements(self, target_tablename, source_tablename):
        """
        BigQuery MERGE文で bid_requirements に新しいレコードを挿入

        announcement_no で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）

        Returns:
            int: 挿入された行数
        """
        merge_sql = f"""
        MERGE `{self.project_id}.{self.dataset_name}.{target_tablename}` AS T
        USING `{self.project_id}.{self.dataset_name}.{source_tablename}` AS S
        ON T.announcement_no = S.announcement_no
        WHEN NOT MATCHED THEN
          INSERT (document_id, announcement_no, requirement_no,
                  requirement_type, requirement_text, is_ocr_failed, done_judgement, createdDate, updatedDate)
          VALUES (S.document_id, S.announcement_no, S.requirement_no,
                  S.requirement_type, S.requirement_text, S.is_ocr_failed, S.done_judgement, S.createdDate, S.updatedDate)
        """

        query_job = self.client.query(merge_sql)
        query_job.result()
        return query_job.num_dml_affected_rows

    def mergeBidAnnouncements(self, target_tablename, source_tablename):
        """
        BigQuery MERGE文で bid_announcements に新しいレコードを挿入

        announcement_no で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）

        Returns:
            int: 挿入された行数
        """
        merge_sql = f"""
        MERGE `{self.project_id}.{self.dataset_name}.{target_tablename}` AS T
        USING `{self.project_id}.{self.dataset_name}.{source_tablename}` AS S
        ON T.announcement_no = S.announcement_no
        WHEN NOT MATCHED THEN
          INSERT (announcement_no, workName, topAgencyName, orderer_id,
                  workPlace, zipcode, address, department, assigneeName,
                  telephone, fax, mail, publishDate, docDistStart, docDistEnd,
                  submissionStart, submissionEnd, bidStartDate, bidEndDate,
                  bidType, category, is_ocr_failed, doneOCR, createdDate, updatedDate)
          VALUES (S.announcement_no, S.workName, S.topAgencyName, S.orderer_id,
                  S.workPlace, S.zipcode, S.address, S.department, S.assigneeName,
                  S.telephone, S.fax, S.mail, S.publishDate, S.docDistStart, S.docDistEnd,
                  S.submissionStart, S.submissionEnd, S.bidStartDate, S.bidEndDate,
                  S.bidType, S.category, S.is_ocr_failed, S.doneOCR, S.createdDate, S.updatedDate)
        """

        query_job = self.client.query(merge_sql)
        query_job.result()
        return query_job.num_dml_affected_rows

    def checkRequirementsExist(self, tmp_check_table, requirements_table):
        """
        BigQuery で一時テーブルの announcement_id について requirements の存在をチェック

        Args:
            tmp_check_table: チェック対象の announcement_id を含む一時テーブル
            requirements_table: チェック先の requirements テーブル

        Returns:
            DataFrame: announcement_id と req_exists (bool) の列を持つ DataFrame
        """
        query = f"""
        SELECT
            t.announcement_id,
            CASE WHEN r.announcement_no IS NOT NULL THEN TRUE ELSE FALSE END as req_exists
        FROM `{self.project_id}.{self.dataset_name}.{tmp_check_table}` t
        LEFT JOIN (
            SELECT DISTINCT announcement_no
            FROM `{self.project_id}.{self.dataset_name}.{requirements_table}`
        ) r ON t.announcement_id = r.announcement_no
        """
        query_job = self.client.query(query)
        return query_job.to_dataframe()

    def getDistinctDocumentIds(self, tablename):
        """
        BigQuery でテーブルから DISTINCT な document_id を取得

        Args:
            tablename: テーブル名

        Returns:
            DataFrame: document_id 列を持つ DataFrame
        """
        query = f"""
        SELECT DISTINCT document_id
        FROM `{self.project_id}.{self.dataset_name}.{tablename}`
        """
        return self.client.query(query).result().to_dataframe()

    def build_new_documents_query(self, tmp_table, existing_table):
        """
        DBOperatorGCPVM: 一時テーブルと既存テーブルを document_id で比較し、新規レコードを取得するクエリを生成
        """
        query = f"""
        SELECT n.*
        FROM `{self.project_id}.{self.dataset_name}.{tmp_table}` n
        LEFT JOIN `{self.project_id}.{self.dataset_name}.{existing_table}` e
          ON n.document_id = e.document_id
        WHERE e.document_id IS NULL
        """
        return query

    def build_max_announcement_id_query(self, existing_table, divisor):
        """
        DBOperatorGCPVM: 既存テーブルからグループごとの最大 announcement_id を取得するクエリを生成
        """
        query = f"""
        SELECT
          announcement_group,
          MAX(announcement_id) as max_id
        FROM (
          SELECT
            announcement_id,
            CAST(FLOOR(announcement_id / {divisor}) AS INT64) as announcement_group
          FROM `{self.project_id}.{self.dataset_name}.{existing_table}`
        )
        GROUP BY announcement_group
        """
        return query

    def selectUnprocessedAnnouncementDocuments(self, announcements_document_tablename, requirements_tablename, requirements_exists):
        """
        BigQuery で未処理の announcement-document ペアを取得する

        Args:
            announcements_document_tablename: announcements_document_table のテーブル名
            requirements_tablename: requirements テーブル名
            requirements_exists: requirements テーブルが存在するか（True/False）

        Returns:
            DataFrame: announcement_no, document_id の列を持つ DataFrame
        """
        if requirements_exists:
            # 既存の announcement_no を除外
            query = f"""
            SELECT ad.announcement_id AS announcement_no, ad.document_id
            FROM `{self.project_id}.{self.dataset_name}.{announcements_document_tablename}` AS ad
            LEFT JOIN (
                SELECT DISTINCT announcement_no
                FROM `{self.project_id}.{self.dataset_name}.{requirements_tablename}`
            ) AS r ON ad.announcement_id = r.announcement_no
            WHERE r.announcement_no IS NULL
            ORDER BY ad.announcement_id, ad.document_id
            """
        else:
            # 全ての announcement-document ペアを取得
            query = f"""
            SELECT announcement_id AS announcement_no, document_id
            FROM `{self.project_id}.{self.dataset_name}.{announcements_document_tablename}`
            ORDER BY announcement_id, document_id
            """

        return self.any_query(query)

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
        pm.establishment_date AS established,
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

    def showAllTables(self):
        """
        SQLite3 データベース内の全テーブル一覧を DataFrame で返す

        Returns:
            DataFrame: name 列を持つ DataFrame
        """
        sql = """
        SELECT name
        FROM sqlite_master
        WHERE type='table'
        ORDER BY name
        """
        df = pd.read_sql_query(sql, self.conn)
        return df

    def dropTable(self, tablename):
        self.cur.execute(fr"DROP TABLE IF EXISTS {tablename}")

    def uploadDataToTable(self, data, tablename, chunksize=1):
        data.to_sql(tablename, self.conn, if_exists="replace", index=False, chunksize=chunksize)

    def selectToTable(self, tablename, where_clause=""):
        sql = fr"SELECT * FROM {tablename} {where_clause}"
        ret = pd.read_sql_query(sql, self.conn)
        return ret

    def createIndex(self, index_name, table_name, columns):
        """SQLite3 のインデックス作成（未実装）"""
        raise NotImplementedError("SQLite3 index creation is not implemented yet")

    def ensure_column(self, tablename, column_name, column_type):
        if not self.ifTableExists(tablename):
            return
        info_sql = fr"PRAGMA table_info({tablename})"
        df_info = pd.read_sql_query(info_sql, self.conn)
        if column_name in df_info["name"].tolist():
            return
        alter_sql = fr"ALTER TABLE {tablename} ADD COLUMN {column_name} {column_type}"
        self.cur.execute(alter_sql)
        self.conn.commit()

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
        bidType string,
        is_ocr_failed bool
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
            'national' as category,
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
        document_id text,
        announcement_no integer,
        requirement_no integer,
        requirement_type text,
        requirement_text text,
        done_judgement bool,
        createdDate text,
        updatedDate text,
        is_ocr_failed bool,
        UNIQUE(requirement_no)
        )
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

    def createWorkflowContacts(self, workflow_contacts_tablename):
        sql = fr"""
        create table {workflow_contacts_tablename} (
            contact_id text primary key default (
                lower(hex(randomblob(4))) || '-' ||
                lower(hex(randomblob(2))) || '-' ||
                '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
                substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
                lower(hex(randomblob(6)))
            ),
            name text,
            role text,
            department text,
            email text,
            phone text,
            notes text,
            is_active boolean default 1,
            created_at timestamp default current_timestamp,
            updated_at timestamp default current_timestamp
        )
        """
        self.cur.execute(sql)

    def createEvaluationAssignees(self, evaluation_assignees_tablename, workflow_contacts_tablename="workflow_contacts"):
        sql = fr"""
        create table {evaluation_assignees_tablename} (
            evaluation_no text not null,
            step_id text not null,
            contact_id text not null,
            assigned_role text,
            assigned_at timestamp default current_timestamp,
            assigned_by text,
            primary key (evaluation_no, step_id),
            foreign key(contact_id) references {workflow_contacts_tablename}(contact_id)
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
        # preselectCompanyBidJudgementで未判定のみ取得済み、かつUUID使用のため単純INSERTでOK
        sql = f"""
        INSERT INTO {company_bid_judgement_tablename} (
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
        SELECT
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
        FROM {company_bid_judgement_tablename_for_update}
        """
        self.cur.execute(sql)

    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        # UUID使用のため単純INSERTでOK
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
        """
        self.cur.execute(sql)

    def updateInsufficientRequirements(self, insufficient_requirements_tablename, insufficient_requirements_tablename_for_update):
        # UUID使用のため単純INSERTでOK
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
        """
        self.cur.execute(sql)

    def mergeAnnouncementsDocumentTable(self, target_tablename, source_tablename, columns):
        """
        SQLite3で announcements_document_table に新しいレコードを挿入

        document_id で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）
            columns: 挿入する列のリスト

        Returns:
            int: 挿入された行数
        """
        # 列名をカンマ区切りで結合
        columns_str = ", ".join(columns)

        # INSERT ... SELECT ... WHERE NOT EXISTS を使用して重複を避ける（document_id のみで重複チェック）
        sql = f"""
        INSERT INTO {target_tablename} ({columns_str})
        SELECT {columns_str}
        FROM {source_tablename} AS S
        WHERE NOT EXISTS (
            SELECT 1
            FROM {target_tablename} AS T
            WHERE T.document_id = S.document_id
        )
        """

        self.cur.execute(sql)
        # SQLite3では affected rows を取得
        return self.cur.rowcount

    def updateMarkdownPaths(self, tablename, df_markdown):
        df_tmp = df_markdown[["document_id", "fileFormat", "markdown_path"]].dropna()
        if df_tmp.empty:
            return 0
        sql = fr"UPDATE {tablename} SET markdown_path = ? WHERE document_id = ? AND fileFormat = ?"
        values = [(row["markdown_path"], row["document_id"], row["fileFormat"]) for _, row in df_tmp.iterrows()]
        self.cur.executemany(sql, values)
        self.conn.commit()
        return len(values)

    def updateOcrJsonPaths(self, tablename, df_json):
        df_tmp = df_json[["document_id", "fileFormat", "ocr_json_path"]].dropna()
        if df_tmp.empty:
            return 0
        sql = fr"UPDATE {tablename} SET ocr_json_path = ? WHERE document_id = ? AND fileFormat = ?"
        values = [(row["ocr_json_path"], row["document_id"], row["fileFormat"]) for _, row in df_tmp.iterrows()]
        self.cur.executemany(sql, values)
        self.conn.commit()
        return len(values)

    def mergeRequirements(self, target_tablename, source_tablename):
        """
        SQLite3で bid_requirements に新しいレコードを挿入

        announcement_no で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）

        Returns:
            int: 挿入された行数
        """
        sql = f"""
        INSERT INTO {target_tablename} (document_id, announcement_no, requirement_no,
                                         requirement_type, requirement_text, is_ocr_failed, done_judgement, createdDate, updatedDate)
        SELECT document_id, announcement_no, requirement_no,
               requirement_type, requirement_text, is_ocr_failed, done_judgement, createdDate, updatedDate
        FROM {source_tablename} AS S
        WHERE NOT EXISTS (
            SELECT 1
            FROM {target_tablename} AS T
            WHERE T.announcement_no = S.announcement_no
        )
        """

        self.cur.execute(sql)
        return self.cur.rowcount

    def mergeBidAnnouncements(self, target_tablename, source_tablename):
        """
        SQLite3で bid_announcements に新しいレコードを挿入

        announcement_no で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）

        Returns:
            int: 挿入された行数
        """
        sql = f"""
        INSERT INTO {target_tablename} (
            announcement_no, workName, topAgencyName, orderer_id,
            workPlace, zipcode, address, department, assigneeName,
            telephone, fax, mail, publishDate, docDistStart, docDistEnd,
            submissionStart, submissionEnd, bidStartDate, bidEndDate,
            bidType, category, is_ocr_failed, doneOCR, createdDate, updatedDate
        )
        SELECT
            announcement_no, workName, topAgencyName, orderer_id,
            workPlace, zipcode, address, department, assigneeName,
            telephone, fax, mail, publishDate, docDistStart, docDistEnd,
            submissionStart, submissionEnd, bidStartDate, bidEndDate,
            bidType, category, is_ocr_failed, doneOCR, createdDate, updatedDate
        FROM {source_tablename} AS S
        WHERE NOT EXISTS (
            SELECT 1
            FROM {target_tablename} AS T
            WHERE T.announcement_no = S.announcement_no
        )
        """

        self.cur.execute(sql)
        return self.cur.rowcount

    def checkRequirementsExist(self, tmp_check_table, requirements_table):
        """
        SQLite3 で一時テーブルの announcement_id について requirements の存在をチェック

        Args:
            tmp_check_table: チェック対象の announcement_id を含む一時テーブル
            requirements_table: チェック先の requirements テーブル

        Returns:
            DataFrame: announcement_id と req_exists (bool) の列を持つ DataFrame
        """
        query = f"""
        SELECT
            t.announcement_id,
            CASE WHEN r.announcement_no IS NOT NULL THEN 1 ELSE 0 END as req_exists
        FROM {tmp_check_table} t
        LEFT JOIN (
            SELECT DISTINCT announcement_no
            FROM {requirements_table}
        ) r ON t.announcement_id = r.announcement_no
        """
        return pd.read_sql_query(query, self.conn)

    def getDistinctDocumentIds(self, tablename):
        """
        SQLite3 でテーブルから DISTINCT な document_id を取得

        Args:
            tablename: テーブル名

        Returns:
            DataFrame: document_id 列を持つ DataFrame
        """
        query = f"""
        SELECT DISTINCT document_id
        FROM {tablename}
        """
        return pd.read_sql_query(query, self.conn)

    def build_new_documents_query(self, tmp_table, existing_table):
        """
        DBOperatorSQLITE3: 一時テーブルと既存テーブルを document_id で比較し、新規レコードを取得するクエリを生成
        """
        query = f"""
        SELECT n.*
        FROM {tmp_table} n
        LEFT JOIN {existing_table} e ON n.document_id = e.document_id
        WHERE e.document_id IS NULL
        """
        return query

    def build_max_announcement_id_query(self, existing_table, divisor):
        """
        DBOperatorSQLITE3: 既存テーブルからグループごとの最大 announcement_id を取得するクエリを生成
        """
        query = f"""
        SELECT
          announcement_group,
          MAX(announcement_id) as max_id
        FROM (
          SELECT
            announcement_id,
            CAST(announcement_id / {divisor} AS INTEGER) as announcement_group
          FROM {existing_table}
        )
        GROUP BY announcement_group
        """
        return query

    def selectUnprocessedAnnouncementDocuments(self, announcements_document_tablename, requirements_tablename, requirements_exists):
        """
        SQLite3 で未処理の announcement-document ペアを取得する

        Args:
            announcements_document_tablename: announcements_document_table のテーブル名
            requirements_tablename: requirements テーブル名
            requirements_exists: requirements テーブルが存在するか（True/False）

        Returns:
            DataFrame: announcement_no, document_id の列を持つ DataFrame
        """
        if requirements_exists:
            # 既存の announcement_no を除外
            query = f"""
            SELECT ad.announcement_id AS announcement_no, ad.document_id
            FROM {announcements_document_tablename} AS ad
            LEFT JOIN (
                SELECT DISTINCT announcement_no
                FROM {requirements_tablename}
            ) AS r ON ad.announcement_id = r.announcement_no
            WHERE r.announcement_no IS NULL
            ORDER BY ad.announcement_id, ad.document_id
            """
        else:
            # 全ての announcement-document ペアを取得
            query = f"""
            SELECT announcement_id AS announcement_no, document_id
            FROM {announcements_document_tablename}
            ORDER BY announcement_id, document_id
            """

        return self.any_query(query)

    def createBackendCompanies(self, tablename):
        raise NotImplementedError

    def createBackendPartners(self, tablename):
        raise NotImplementedError


class DBOperatorPOSTGRES(DBOperator):
    """
    PostgreSQL を操作するクラス。
    """

    def __init__(self, *args, **kwargs):
        """
        PostgreSQL への接続を初期化する
        """
        super().__init__(*args, **kwargs)

        # PostgreSQL への接続を確立
        try:
            self.conn = psycopg2.connect(
                host=self.postgres_host,
                port=self.postgres_port,
                database=self.postgres_database,
                user=self.postgres_user,
                password=self.postgres_password
            )
            self.conn.autocommit = True  # autocommit モード
            self.cur = self.conn.cursor()
        except Exception as e:
            print(fr"    PostgreSQLConnector: {str(e)}")

        # SQLAlchemy エンジンを作成（pandas.to_sql用）
        try:
            connection_string = f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_database}"
            self.engine = create_engine(connection_string)
        except Exception as e:
            print(fr"    SQLAlchemy Engine: {str(e)}")

    def any_query(self, sql):
        df = pd.read_sql_query(sql, self.engine)
        return df

    def ifTableExists(self, tablename):
        sql = """
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        """
        df = pd.read_sql_query(sql, self.engine)
        df = df[df["tablename"] == tablename]

        if df.shape[0] == 1:
            return True
        return False

    def showAllTables(self):
        """
        PostgreSQL データベース内の全テーブル一覧を DataFrame で返す

        Returns:
            DataFrame: tablename 列を持つ DataFrame
        """
        sql = """
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
        """
        df = pd.read_sql_query(sql, self.engine)
        return df

    def dropTable(self, tablename):
        self.cur.execute(fr"DROP TABLE IF EXISTS {tablename}")

    def uploadDataToTable(self, data, tablename, chunksize=1):
        # SQLAlchemy エンジンを使用して pandas DataFrame を PostgreSQL にアップロード
        data.to_sql(tablename, self.engine, if_exists="replace", index=False, chunksize=chunksize)

    def selectToTable(self, tablename, where_clause=""):
        sql = fr"SELECT * FROM {tablename} {where_clause}"
        ret = pd.read_sql_query(sql, self.engine)
        return ret

    def createIndex(self, index_name, table_name, columns):
        """
        PostgreSQL にインデックスを作成する

        Args:
            index_name (str): インデックス名
            table_name (str): テーブル名
            columns (str or list): カラム指定
                - 文字列: 単一カラムまたは式 (例: '"evaluatedAt"' or '((company->>\'priority\')::integer)')
                - リスト: 複数カラム (例: ['status', '"evaluatedAt" DESC'])
        """
        if isinstance(columns, list):
            columns_clause = ", ".join(columns)
        else:
            columns_clause = columns

        sql = f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns_clause})"

        try:
            self.cur.execute(sql)
            print(f"✓ Index '{index_name}' created successfully")
        except Exception as e:
            print(f"✗ Index '{index_name}' failed: {str(e)}")

    def ensure_column(self, tablename, column_name, column_type):
        if not self.ifTableExists(tablename):
            return
        sql = f'ALTER TABLE {tablename} ADD COLUMN IF NOT EXISTS "{column_name}" {column_type}'
        self.cur.execute(sql)

    def createBidAnnouncements(self, bid_announcements_tablename):
        sql = fr"""
        CREATE TABLE {bid_announcements_tablename} (
        announcement_no INTEGER PRIMARY KEY,
        "workName" TEXT,
        "userAnnNo" INTEGER,
        "topAgencyNo" INTEGER,
        "topAgencyName" TEXT,
        "subAgencyNo" INTEGER,
        "subAgencyName" TEXT,
        "workPlace" TEXT,
        "pdfUrl" TEXT,
        zipcode TEXT,
        address TEXT,
        department TEXT,
        "assigneeName" TEXT,
        telephone TEXT,
        fax TEXT,
        mail TEXT,
        "publishDate" TEXT,
        "docDistStart" TEXT,
        "docDistEnd" TEXT,
        "submissionStart" TEXT,
        "submissionEnd" TEXT,
        "bidStartDate" TEXT,
        "bidEndDate" TEXT,
        "doneOCR" BOOLEAN,
        remarks TEXT,
        "createdDate" TEXT,
        "updatedDate" TEXT
        )
        """
        self.cur.execute(sql)

    def createBidAnnouncementsV2(self, bid_announcements_tablename):
        sql = fr"""
        CREATE TABLE {bid_announcements_tablename} (
        announcement_no INTEGER PRIMARY KEY,
        "workName" TEXT,
        "userAnnNo" INTEGER,
        "topAgencyNo" INTEGER,
        "topAgencyName" TEXT,
        "subAgencyNo" INTEGER,
        "subAgencyName" TEXT,
        "workPlace" TEXT,

        zipcode TEXT,
        address TEXT,
        department TEXT,
        "assigneeName" TEXT,
        telephone TEXT,
        fax TEXT,
        mail TEXT,

        "publishDate" TEXT,
        "docDistStart" TEXT,
        "docDistEnd" TEXT,
        "submissionStart" TEXT,
        "submissionEnd" TEXT,
        "bidStartDate" TEXT,
        "bidEndDate" TEXT,

        "doneOCR" BOOLEAN,
        remarks TEXT,
        "createdDate" TEXT,
        "updatedDate" TEXT,

        orderer_id TEXT,
        category TEXT,
        "bidType" TEXT,
        is_ocr_failed BOOLEAN
        )
        """
        self.cur.execute(sql)


    def createBidOrderersFromAnnouncements(self, bid_orderer_tablename, bid_announcements_tablename):
        sql = fr"""
        CREATE TABLE {bid_orderer_tablename} AS
        SELECT
        a.orderer_id,
        ROW_NUMBER() OVER() AS "no",
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
        FROM (
            SELECT
            orderer_id,
            orderer_id AS name,
            'national' AS category,
            'unknown' AS address,
            'unknown' AS phone,
            'unknown' AS fax,
            'unknown' AS email,
            'unknown' AS departments,
            COUNT(*) AS announcementCount,
            0 AS awardCount,
            0 AS averageAmount,
            MIN("updatedDate") AS lastAnnouncementDate
            FROM {bid_announcements_tablename}
            GROUP BY
            orderer_id
        ) a
        """
        self.cur.execute(sql)


    def createBidRequirements(self, bid_requirements_tablename):
        sql = fr"""
        CREATE TABLE {bid_requirements_tablename} (
        document_id TEXT,
        announcement_no INTEGER,
        requirement_no INTEGER,
        requirement_type TEXT,
        requirement_text TEXT,
        done_judgement BOOLEAN,
        "createdDate" TEXT,
        "updatedDate" TEXT,
        is_ocr_failed BOOLEAN,
        UNIQUE(requirement_no)
        )
        """
        self.cur.execute(sql)

    def updateAnnouncements(self, bid_announcements_tablename, bid_announcements_tablename_for_update):
        sql = fr"""INSERT INTO {bid_announcements_tablename} (
            announcement_no,
            "workName",
            "userAnnNo",
            "topAgencyNo",
            "topAgencyName",
            "subAgencyNo",
            "subAgencyName",
            "workPlace",
            zipcode,
            address,
            department,
            "assigneeName",
            telephone,
            fax,
            mail,
            "publishDate",
            "docDistStart",
            "docDistEnd",
            "submissionStart",
            "submissionEnd",
            "bidStartDate",
            "bidEndDate",
            "doneOCR",
            remarks,
            "createdDate",
            "updatedDate"
        )
        SELECT
        announcement_no,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        "workPlace",
        zipcode,
        address,
        department,
        "assigneeName",
        telephone,
        fax,
        mail,
        "publishDate",
        "docDistStart",
        "docDistEnd",
        "submissionStart",
        "submissionEnd",
        "bidStartDate",
        "bidEndDate",
        NULL,
        NULL,
        NULL,
        NULL
        FROM {bid_announcements_tablename_for_update} source WHERE true
        ON CONFLICT(announcement_no) DO UPDATE SET
            announcement_no = {bid_announcements_tablename}.announcement_no,
            "workName" = {bid_announcements_tablename}."workName",
            "userAnnNo" = {bid_announcements_tablename}."userAnnNo",
            "topAgencyNo" = {bid_announcements_tablename}."topAgencyNo",
            "topAgencyName" = {bid_announcements_tablename}."topAgencyName",
            "subAgencyNo" = {bid_announcements_tablename}."subAgencyNo",
            "subAgencyName" = {bid_announcements_tablename}."subAgencyName",
            "workPlace" = EXCLUDED."workPlace",
            zipcode = EXCLUDED.zipcode,
            address = EXCLUDED.address,
            department = EXCLUDED.department,
            "assigneeName" = EXCLUDED."assigneeName",
            telephone = EXCLUDED.telephone,
            fax = EXCLUDED.fax,
            mail = EXCLUDED.mail,
            "publishDate" = EXCLUDED."publishDate",
            "docDistStart" = EXCLUDED."docDistStart",
            "docDistEnd" = EXCLUDED."docDistEnd",
            "submissionStart" = EXCLUDED."submissionStart",
            "submissionEnd" = EXCLUDED."submissionEnd",
            "bidStartDate" = EXCLUDED."bidStartDate",
            "bidEndDate" = EXCLUDED."bidEndDate",
            "doneOCR" = TRUE,
            remarks = {bid_announcements_tablename}.remarks,
            "createdDate" = {bid_announcements_tablename}."createdDate",
            "updatedDate" = {bid_announcements_tablename}."updatedDate"
        """
        self.cur.execute(sql)

    def getMaxOfColumn(self, tablename, column_name):
        sql = fr"SELECT MAX({column_name}) FROM {tablename}"
        ret = pd.read_sql_query(sql, self.engine)
        return ret

    def createCompanyBidJudgements(self, company_bid_judgement_tablename):
        sql = fr"""
        CREATE TABLE {company_bid_judgement_tablename} (
            evaluation_no TEXT,
            announcement_no INTEGER,
            company_no INTEGER,
            office_no INTEGER,
            requirement_ineligibility BOOLEAN,
            requirement_grade_item BOOLEAN,
            requirement_location BOOLEAN,
            requirement_experience BOOLEAN,
            requirement_technician BOOLEAN,
            requirement_other BOOLEAN,
            deficit_requirement_message TEXT,
            final_status BOOLEAN,
            message TEXT,
            remarks TEXT,
            "createdDate" TEXT,
            "updatedDate" TEXT,
            UNIQUE(evaluation_no, announcement_no, company_no, office_no)
        )
        """
        self.cur.execute(sql)

    def createSufficientRequirements(self, sufficient_requirements_tablename):
        sql = fr"""
        CREATE TABLE {sufficient_requirements_tablename} (
            sufficiency_detail_no TEXT,
            evaluation_no TEXT,
            announcement_no INTEGER,
            requirement_no INTEGER,
            company_no INTEGER,
            office_no INTEGER,
            requirement_type TEXT,
            requirement_description TEXT,
            "createdDate" TEXT,
            "updatedDate" TEXT,
            UNIQUE(sufficiency_detail_no, evaluation_no, announcement_no, requirement_no, company_no, office_no, requirement_type)
        )
        """
        self.cur.execute(sql)

    def createInsufficientRequirements(self, insufficient_requirements_tablename):
        sql = fr"""
        CREATE TABLE {insufficient_requirements_tablename} (
            shortage_detail_no TEXT,
            evaluation_no TEXT,
            announcement_no INTEGER,
            requirement_no INTEGER,
            company_no INTEGER,
            office_no INTEGER,
            requirement_type TEXT,
            requirement_description TEXT,
            suggestions_for_improvement TEXT,
            final_comment TEXT,
            "createdDate" TEXT,
            "updatedDate" TEXT,
            UNIQUE(shortage_detail_no, evaluation_no, announcement_no, requirement_no, company_no, office_no, requirement_type)
        )
        """
        self.cur.execute(sql)

    def createWorkflowContacts(self, workflow_contacts_tablename):
        # gen_random_uuid を使用できるように拡張機能を有効化
        self.cur.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
        sql = fr"""
        CREATE TABLE {workflow_contacts_tablename} (
            contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT,
            role TEXT,
            department TEXT,
            email TEXT,
            phone TEXT,
            notes TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
        self.cur.execute(sql)

    def createEvaluationAssignees(self, evaluation_assignees_tablename, workflow_contacts_tablename="workflow_contacts"):
        sql = fr"""
        CREATE TABLE {evaluation_assignees_tablename} (
            evaluation_no TEXT NOT NULL,
            step_id TEXT NOT NULL,
            contact_id UUID NOT NULL,
            assigned_role TEXT,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            assigned_by TEXT,
            PRIMARY KEY (evaluation_no, step_id),
            FOREIGN KEY (contact_id) REFERENCES {workflow_contacts_tablename}(contact_id)
        )
        """
        self.cur.execute(sql)

    def ensureBackendEvaluationStatusesTable(self, tablename="backend_evaluation_statuses"):
        """
        Ensure the table for persisting workflow states exists.
        """
        sql = fr"""
        CREATE TABLE IF NOT EXISTS {tablename} (
            "evaluationNo" TEXT PRIMARY KEY,
            "workStatus" TEXT NOT NULL DEFAULT 'not_started',
            "currentStep" TEXT NOT NULL DEFAULT 'judgment',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
        self.cur.execute(sql)

    def preupdateCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        sql = fr"""INSERT INTO {company_bid_judgement_tablename} (
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
            "createdDate",
            "updatedDate"
        )
        SELECT
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
        FROM {bid_announcements_tablename} AS a
        CROSS JOIN
        {office_master_tablename} AS b
        WHERE true
        ON CONFLICT(evaluation_no, announcement_no, company_no, office_no) DO NOTHING
        """
        self.cur.execute(sql)

    def preselectCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        sql = fr"""
        SELECT
        x.announcement_no,
        x.company_no,
        x.office_no
        FROM
        (
            SELECT
            a.announcement_no,
            b.company_no,
            b.office_no
            FROM {bid_announcements_tablename} AS a
            CROSS JOIN
            {office_master_tablename} AS b
        ) x
        LEFT OUTER JOIN {company_bid_judgement_tablename} y
        ON
        x.announcement_no = y.announcement_no
        AND x.company_no = y.company_no
        AND x.office_no = y.office_no
        WHERE y.announcement_no IS NULL
        """
        ret = pd.read_sql_query(sql, self.engine)
        return ret

    def updateCompanyBidJudgement(self, company_bid_judgement_tablename, company_bid_judgement_tablename_for_update):
        # preselectCompanyBidJudgementで未判定のみ取得済み、かつUUID使用のため単純INSERTでOK
        sql = f"""
        INSERT INTO {company_bid_judgement_tablename} (
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
            "createdDate",
            "updatedDate"
        )
        SELECT
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
            "createdDate",
            "updatedDate"
        FROM {company_bid_judgement_tablename_for_update}
        """
        self.cur.execute(sql)

    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        # UUID使用のため単純INSERTでOK
        sql = fr"""INSERT INTO {sufficient_requirements_tablename} (
            sufficiency_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            "createdDate",
            "updatedDate"
        )
        SELECT
            sufficiency_detail_no,
            evaluation_no,
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            "createdDate",
            "updatedDate"
        FROM {sufficient_requirements_tablename_for_update} WHERE true
        """
        self.cur.execute(sql)

    def updateInsufficientRequirements(self, insufficient_requirements_tablename, insufficient_requirements_tablename_for_update):
        # UUID使用のため単純INSERTでOK
        sql = fr"""INSERT INTO {insufficient_requirements_tablename} (
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
            "createdDate",
            "updatedDate"
        )
        SELECT
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
            "createdDate",
            "updatedDate"
        FROM {insufficient_requirements_tablename_for_update} WHERE true
        """
        self.cur.execute(sql)

    def mergeAnnouncementsDocumentTable(self, target_tablename, source_tablename, columns):
        """
        PostgreSQL で announcements_document_table に新しいレコードを挿入

        document_id で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）
            columns: 挿入する列のリスト

        Returns:
            int: 挿入された行数
        """
        # 列名を引用符で囲んでカンマ区切りで結合（PostgreSQL の CamelCase 対策）
        quoted_columns = [f'"{col}"' if any(c.isupper() for c in col) else col for col in columns]
        columns_str = ", ".join(quoted_columns)

        # INSERT ... SELECT ... WHERE NOT EXISTS を使用して重複を避ける（document_id のみで重複チェック）
        sql = f"""
        INSERT INTO {target_tablename} ({columns_str})
        SELECT {columns_str}
        FROM {source_tablename} AS S
        WHERE NOT EXISTS (
            SELECT 1
            FROM {target_tablename} AS T
            WHERE T.document_id = S.document_id
        )
        """

        self.cur.execute(sql)
        # PostgreSQL では affected rows を取得
        return self.cur.rowcount

    def updateMarkdownPaths(self, tablename, df_markdown):
        df_tmp = df_markdown[["document_id", "fileFormat", "markdown_path"]].dropna()
        if df_tmp.empty:
            return 0
        records = [(row["document_id"], row["fileFormat"], row["markdown_path"]) for _, row in df_tmp.iterrows()]
        sql = f"""
        UPDATE {tablename} AS t SET markdown_path = v.markdown_path
        FROM (VALUES %s) AS v(document_id, "fileFormat", markdown_path)
        WHERE t.document_id = v.document_id AND t."fileFormat" = v."fileFormat"
        """
        execute_values(self.cur, sql, records)
        return len(records)

    def updateOcrJsonPaths(self, tablename, df_json):
        df_tmp = df_json[["document_id", "fileFormat", "ocr_json_path"]].dropna()
        if df_tmp.empty:
            return 0
        records = [(row["document_id"], row["fileFormat"], row["ocr_json_path"]) for _, row in df_tmp.iterrows()]
        sql = f"""
        UPDATE {tablename} AS t SET ocr_json_path = v.ocr_json_path
        FROM (VALUES %s) AS v(document_id, "fileFormat", ocr_json_path)
        WHERE t.document_id = v.document_id AND t."fileFormat" = v."fileFormat"
        """
        execute_values(self.cur, sql, records)
        return len(records)

    def mergeRequirements(self, target_tablename, source_tablename):
        """
        PostgreSQL で bid_requirements に新しいレコードを挿入

        announcement_no で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）

        Returns:
            int: 挿入された行数
        """
        sql = f"""
        INSERT INTO {target_tablename} (document_id, announcement_no, requirement_no,
                                         requirement_type, requirement_text, is_ocr_failed, done_judgement, "createdDate", "updatedDate")
        SELECT document_id, announcement_no, requirement_no,
               requirement_type, requirement_text, is_ocr_failed, done_judgement, "createdDate", "updatedDate"
        FROM {source_tablename} AS S
        WHERE NOT EXISTS (
            SELECT 1
            FROM {target_tablename} AS T
            WHERE T.announcement_no = S.announcement_no
        )
        """

        self.cur.execute(sql)
        return self.cur.rowcount

    def mergeBidAnnouncements(self, target_tablename, source_tablename):
        """
        PostgreSQL で bid_announcements に新しいレコードを挿入

        announcement_no で重複チェックを行い、重複しないレコードのみをターゲットテーブルに挿入する。

        Args:
            target_tablename: マージ先のテーブル名
            source_tablename: マージ元のテーブル名（一時テーブル）

        Returns:
            int: 挿入された行数
        """
        sql = f"""
        INSERT INTO {target_tablename} (
            announcement_no, "workName", "topAgencyName", orderer_id,
            "workPlace", zipcode, address, department, "assigneeName",
            telephone, fax, mail, "publishDate", "docDistStart", "docDistEnd",
            "submissionStart", "submissionEnd", "bidStartDate", "bidEndDate",
            "bidType", category, is_ocr_failed, "doneOCR", "createdDate", "updatedDate"
        )
        SELECT
            announcement_no, "workName", "topAgencyName", orderer_id,
            "workPlace", zipcode, address, department, "assigneeName",
            telephone, fax, mail, "publishDate", "docDistStart", "docDistEnd",
            "submissionStart", "submissionEnd", "bidStartDate", "bidEndDate",
            "bidType", category, is_ocr_failed, "doneOCR", "createdDate", "updatedDate"
        FROM {source_tablename} AS S
        WHERE NOT EXISTS (
            SELECT 1
            FROM {target_tablename} AS T
            WHERE T.announcement_no = S.announcement_no
        )
        """

        self.cur.execute(sql)
        return self.cur.rowcount

    def checkRequirementsExist(self, tmp_check_table, requirements_table):
        """
        PostgreSQL で一時テーブルの announcement_id について requirements の存在をチェック

        Args:
            tmp_check_table: チェック対象の announcement_id を含む一時テーブル
            requirements_table: チェック先の requirements テーブル

        Returns:
            DataFrame: announcement_id と req_exists (bool) の列を持つ DataFrame
        """
        query = f"""
        SELECT
            t.announcement_id,
            CASE WHEN r.announcement_no IS NOT NULL THEN 1 ELSE 0 END AS req_exists
        FROM {tmp_check_table} t
        LEFT JOIN (
            SELECT DISTINCT announcement_no
            FROM {requirements_table}
        ) r ON t.announcement_id = r.announcement_no
        """
        return pd.read_sql_query(query, self.engine)

    def getDistinctDocumentIds(self, tablename):
        """
        PostgreSQL でテーブルから DISTINCT な document_id を取得

        Args:
            tablename: テーブル名

        Returns:
            DataFrame: document_id 列を持つ DataFrame
        """
        query = f"""
        SELECT DISTINCT document_id
        FROM {tablename}
        """
        return pd.read_sql_query(query, self.engine)

    def build_new_documents_query(self, tmp_table, existing_table):
        """
        DBOperatorPOSTGRES: 一時テーブルと既存テーブルを document_id で比較し、新規レコードを取得するクエリを生成
        """
        query = f"""
        SELECT n.*
        FROM {tmp_table} n
        LEFT JOIN {existing_table} e ON n.document_id = e.document_id
        WHERE e.document_id IS NULL
        """
        return query

    def build_max_announcement_id_query(self, existing_table, divisor):
        """
        DBOperatorPOSTGRES: 既存テーブルからグループごとの最大 announcement_id を取得するクエリを生成
        """
        query = f"""
        SELECT
          announcement_group,
          MAX(announcement_id) AS max_id
        FROM (
          SELECT
            announcement_id,
            CAST(FLOOR(announcement_id / {divisor}) AS INTEGER) AS announcement_group
          FROM {existing_table}
        ) subquery
        GROUP BY announcement_group
        """
        return query

    def selectUnprocessedAnnouncementDocuments(self, announcements_document_tablename, requirements_tablename, requirements_exists):
        """
        PostgreSQL で未処理の announcement-document ペアを取得する

        Args:
            announcements_document_tablename: announcements_document_table のテーブル名
            requirements_tablename: requirements テーブル名
            requirements_exists: requirements テーブルが存在するか（True/False）

        Returns:
            DataFrame: announcement_no, document_id の列を持つ DataFrame
        """
        if requirements_exists:
            # 既存の announcement_no を除外
            query = f"""
            SELECT ad.announcement_id AS announcement_no, ad.document_id
            FROM {announcements_document_tablename} AS ad
            LEFT JOIN (
                SELECT DISTINCT announcement_no
                FROM {requirements_tablename}
            ) AS r ON ad.announcement_id = r.announcement_no
            WHERE r.announcement_no IS NULL
            ORDER BY ad.announcement_id, ad.document_id
            """
        else:
            # 全ての announcement-document ペアを取得
            query = f"""
            SELECT announcement_id AS announcement_no, document_id
            FROM {announcements_document_tablename}
            ORDER BY announcement_id, document_id
            """

        return self.any_query(query)

    def createBackendCompanies(self, tablename):
        raise NotImplementedError

    def createBackendPartners(self, tablename):
        raise NotImplementedError


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

    - tablenamesconfig:

      TablenamesConfig オブジェクト。

    - db_operator:

      データベースを操作するためのオブジェクト。

    """

    def __init__(self, tablenamesconfig=None, db_operator=None, gemini_model="gemini-2.5-flash"):
        self.tablenamesconfig = tablenamesconfig
        self.db_operator=db_operator
        self.gemini_model = gemini_model


    def step0_prepare_documents(
        self,
        input_list_file,
        output_base_dir="bid_announcement_judgement_tools/output",
        timestamp=None,
        topAgencyName="防衛省",
        extracted_at=None,
        base_digits=5,
        no_merge=False,
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
            use_gcs: GCS (gs://) を使用する場合 True（--use_postgres 指定時も自動で True 相当になる）
            do_fetch_html: HTML ページを取得する場合 True
            do_extract_links: ドキュメントリンクを抽出する場合 True
            do_format_documents: ドキュメント情報をフォーマットする場合 True
            do_download_pdfs: PDF をダウンロードする場合 True
            do_markdown: PDF 取得後に Gemini で Markdown を生成する場合 True
            do_ocr_json: Gemini OCR JSON を生成する場合 True
            do_count_pages: PDF のページ数をカウントする場合 True
            do_ocr: Gemini OCR を実行する場合 True
            google_api_key: Google AI Studio API キーファイルのパス
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
                max_api_calls_per_run=ocr_max_api_calls_per_run
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

        text_column_type = "STRING" if isinstance(self.db_operator, DBOperatorGCPVM) else "TEXT"

        if not self.db_operator.ifTableExists(tablename):
            # テーブルが存在しない場合は新規作成
            print(f"Creating new table: {tablename}")
            self.db_operator.uploadDataToTable(df, tablename, chunksize=5000)
            print(f"Created {tablename} with {len(df)} records")
        else:
            self.db_operator.ensure_column(tablename, "ocr_json_path", text_column_type)
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
        if google_api_key is None:
            raise ValueError("google_api_key is required for Markdown generation")

        key_path = Path(google_api_key)
        if not key_path.exists():
            raise FileNotFoundError(f"Google API key file not found: {google_api_key}")

        api_key = key_path.read_text().strip()
        if not api_key:
            raise ValueError("Google API key file is empty")

        client = genai.Client(api_key=api_key)
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

        # 行ごとに処理（PDFのみ）
        for idx, row in df_main.iterrows():
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

            if file_exists_gcs_or_local(md_path) and not force_regenerate:
                mask = (df_main["document_id"] == document_id) & (df_main["fileFormat"] == file_format)
                df_main.loc[mask, "markdown_path"] = md_path
                continue

            # ファイルパス存在チェック
            if pd.isna(save_path) or not file_exists_gcs_or_local(save_path):
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
        force_regenerate=False
    ):
        """
        Gemini を使って OCR JSON を生成し保存する
        """
        if google_api_key is None:
            raise ValueError("google_api_key is required for OCR JSON generation")

        key_path = Path(google_api_key)
        if not key_path.exists():
            raise FileNotFoundError(f"Google API key file not found: {google_api_key}")

        api_key = key_path.read_text().strip()
        if not api_key:
            raise ValueError("Google API key file is empty")

        client = genai.Client(api_key=api_key)
        df_main = df_main.copy()
        df_main["document_id"] = df_main["document_id"].astype(str).str.strip()

        doc_to_json_path = {}
        params = []
        skipped_docs = []

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

            if file_exists_gcs_or_local(json_path) and not force_regenerate:
                mask = (df_main["document_id"] == document_id) & (df_main["fileFormat"] == file_format)
                df_main.loc[mask, "ocr_json_path"] = json_path
                continue

            if pd.isna(save_path) or not file_exists_gcs_or_local(save_path):
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
                saved_count += 1
            except Exception as e:
                tqdm.write(f"Failed to save OCR JSON for {document_id}.{file_format}: {e}")

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
        overwrite_files=False
    ):
        """
        既存 announcements_documents_master から Markdown を再生成する
        """
        tablename = self.tablenamesconfig.bid_announcements_document_table
        where_clauses = []

        if only_missing:
            where_clauses.append("(markdown_path IS NULL OR markdown_path = '')")

        # DBごとのクォートルールに合わせて fileFormat 列を小文字化
        if isinstance(self.db_operator, DBOperatorGCPVM):
            where_clauses.append("LOWER(fileFormat) = 'pdf'")
        elif isinstance(self.db_operator, DBOperatorPOSTGRES):
            where_clauses.append("LOWER(\"fileFormat\") = 'pdf'")
        else:
            where_clauses.append("LOWER(fileFormat) = 'pdf'")

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
        overwrite_files=False
    ):
        """
        既存 announcements_documents_master から OCR JSON を再生成する
        """
        tablename = self.tablenamesconfig.bid_announcements_document_table
        json_type = "STRING" if isinstance(self.db_operator, DBOperatorGCPVM) else "TEXT"
        if self.db_operator.ifTableExists(tablename):
            self.db_operator.ensure_column(tablename, "ocr_json_path", json_type)
        else:
            print(f"Table {tablename} does not exist.")
            return

        where_clauses = []
        if only_missing:
            where_clauses.append("(ocr_json_path IS NULL OR ocr_json_path = '')")

        if isinstance(self.db_operator, DBOperatorGCPVM):
            where_clauses.append("LOWER(fileFormat) = 'pdf'")
        elif isinstance(self.db_operator, DBOperatorPOSTGRES):
            where_clauses.append("LOWER(\"fileFormat\") = 'pdf'")
        else:
            where_clauses.append("LOWER(fileFormat) = 'pdf'")

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
            print("No documents found for OCR JSON regeneration.")
            return

        print(f"Regenerating OCR JSON for {len(df_main)} documents...")
        df_main = self._step0_generate_ocr_json(
            df_main=df_main,
            use_gcs=use_gcs,
            google_api_key=google_api_key,
            max_concurrency=max_concurrency,
            max_api_calls_per_run=max_api_calls_per_run,
            force_regenerate=overwrite_files
        )

        df_updates = df_main[["document_id", "fileFormat", "ocr_json_path"]].dropna()
        df_updates = df_updates[df_updates["ocr_json_path"].astype(str).str.len() > 0]
        if df_updates.empty:
            print("No OCR JSON paths to update.")
            return

        updated = self.db_operator.updateOcrJsonPaths(tablename, df_updates)
        print(f"Updated ocr_json_path for {updated} documents.")


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
            google_api_key: Google AI Studio API key filepath
            max_concurrency: 並列実行数
            max_api_calls_per_run: 1回の実行での最大API呼び出し数（デフォルト: 1000）

        Returns:
            pd.DataFrame: 更新されたメインDataFrame
        """
        print("=" * 60)
        print("Step0-6: OCR with Gemini")
        print("=" * 60)

        # API key読み込み
        if google_api_key is None:
            raise ValueError("google_api_key is required for OCR processing")

        with open(google_api_key, "r") as f:
            api_key = f.read().strip()

        client = genai.Client(api_key=api_key)

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

        # 要件文抽出用に処理済みdocument_idを記録（同じPDFを複数回APIに送らないため）
        processed_docs = set()

        for i, row in tqdm(df_main.iterrows(), total=len(df_main), desc="Checking documents"):
            document_id = row["document_id"]
            announcement_id = row["announcement_id"]
            ann_done = bool(row.get("done"))
            req_done = bool(req_done_lookup.get(announcement_id, False))

            if ann_done and req_done:
                continue

            # PDFファイルパス確認
            if use_gcs:
                pdf_path = f"gs://ann-files/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
                pdf_exists = True  # GCSの場合は存在チェックスキップ
            else:
                pdf_path = f"output/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
                pdf_exists = os.path.exists(pdf_path)

            if not pdf_exists:
                continue

            # 公告情報抽出用パラメータ
            if not ann_done:
                params.append([
                    self._PROMPT_ANN,
                    document_id,
                    "pdf",
                    self.gemini_model,
                    "ann",
                    use_gcs
                ])

            # 要件文抽出用パラメータ（同じPDFを複数回APIに送らないため、document_idごとに1回のみ）
            # ただし、結果は同じdocument_idを参照する全てのannouncement_idに保存される
            if not req_done and document_id not in processed_docs:
                params.append([
                    self._PROMPT_REQ,
                    document_id,
                    "pdf",
                    self.gemini_model,
                    "req",
                    use_gcs
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

                # paramsの形式: [prompt, document_id, data_type, model, type2, use_gcs, save_path(optional)]
                if len(item) == 7:
                    prompt, document_id, data_type, model, type2, use_gcs, save_path = item
                else:
                    prompt, document_id, data_type, model, type2, use_gcs = item
                    save_path = None

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
                            save_path
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


    def _call_gemini(self, client, prompt, document_id, data_type, model="gemini-2.5-flash", use_gcs=True, save_path=None):
        """
        Gemini APIを呼び出してファイルを解析

        Args:
            save_path: 実際のファイルパス。指定時はこれを優先使用
        """
        # ファイルデータ取得
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

        # MIME typeのマッピング（Gemini API対応形式のみ）
        # Geminiが対応: PDF, 画像, 動画, 音声, テキスト
        # 非対応: Office形式(xlsx, docx等), zip等のアーカイブ
        mime_types = {
            "pdf": "application/pdf"
        }

        mime_type = mime_types.get(data_type.lower(), "application/pdf")

        # Gemini API呼び出し
        response = client.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(
                    data=data,
                    mime_type=mime_type,
                ),
                prompt
            ]
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


    def step1_transfer_v2(self, remove_table=False):
        """
        step1 : 転写処理

        公告マスターが無ければ公告マスターを作成する。

        引数 remove_table に応じて、事前に公告マスターを削除する。

        announcements_document_table (DB) から announcements (DB) に転記する。

        注意: bid_requirements は step0 で作成済みのため、このステップでは処理しません。

        Args:
            remove_table (bool): 処理前に公告マスターを削除するかどうか（デフォルト: False）
        """

        tablename_announcements = self.tablenamesconfig.bid_announcements
        tablename_bid_announcements_document_table = self.tablenamesconfig.bid_announcements_document_table

        db_operator = self.db_operator

        # announcements_document_table の存在確認
        if not db_operator.ifTableExists(tablename=tablename_bid_announcements_document_table):
            print(f"Error: {tablename_bid_announcements_document_table} does not exist.")
            print("Please run step0_prepare_documents first to create announcements_document_table.")
            return

        # NOTE: bid_announcements は step0 の OCR 処理で作成・更新されるため、
        #       step1 では何も処理しません。
        print(f"\n[INFO] {tablename_announcements} is managed in step0 (no step1 processing needed)")

        # 旧実装（コメントアウト）:
        # テーブル 'bid_announcements' の存在確認・作成
        # tmpcheck = db_operator.ifTableExists(tablename=tablename_announcements)
        # if tmpcheck:
        #     if remove_table:
        #         db_operator.dropTable(tablename=tablename_announcements)
        #         print(fr"DELETE existing table: {tablename_announcements}.")
        #         tmpcheck = False
        # if not tmpcheck:
        #     db_operator.createBidAnnouncementsV2(bid_announcements_tablename=tablename_announcements)
        #     print(fr"NEWLY CREATED: {tablename_announcements}.")
        # else:
        #     print(fr"ALREADY EXISTS: {tablename_announcements}.")

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



if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="")
    parser.add_argument("--use_gcp_vm", action="store_true")
    parser.add_argument("--use_postgres", action="store_true")
    parser.add_argument("--stop_processing", action="store_true")

    parser.add_argument("--sqlite3_db_file_path", default=None)

    parser.add_argument("--bigquery_location", default=None)
    parser.add_argument("--bigquery_project_id", default=None)
    parser.add_argument("--bigquery_dataset_name", default=None)

    parser.add_argument("--postgres_host", default=None)
    parser.add_argument("--postgres_port", default=5432, type=int)
    parser.add_argument("--postgres_database", default=None)
    parser.add_argument("--postgres_user", default=None)
    parser.add_argument("--postgres_password", default=None)

    # Step0 関連の引数
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
    parser.add_argument("--step0_do_markdown", action="store_true",
                       help="PDFからMarkdown要約を生成")
    parser.add_argument("--step0_do_ocr_json", action="store_true",
                       help="PDFからOCR JSONを生成")
    parser.add_argument("--step0_do_count_pages", action="store_true",
                       help="ページ数カウント処理を実行")
    parser.add_argument("--step0_do_ocr", action="store_true",
                       help="Gemini OCR処理を実行")
    parser.add_argument("--step0_google_api_key", default="data/sec/google_ai_studio_api_key_mizu.txt",
                       help="Google AI Studio API キーファイルのパス")
    parser.add_argument("--gemini_model", default="gemini-2.5-flash",
                       help="Gemini APIで使用するモデル名")
    parser.add_argument("--step0_ocr_max_concurrency", type=int, default=5,
                       help="OCR並列実行数")
    parser.add_argument("--step0_ocr_max_api_calls_per_run", type=int, default=1000,
                       help="1回の実行での最大API呼び出し数")

    parser.add_argument("--step1_transfer_remove_table", action="store_true")
    parser.add_argument("--step3_remove_table", action="store_true")

    try:
        args = parser.parse_args()
        use_gcp_vm = args.use_gcp_vm
        use_postgres = args.use_postgres
        stop_processing = args.stop_processing
        sqlite3_db_file_path = args.sqlite3_db_file_path

        bigquery_location = args.bigquery_location
        bigquery_project_id = args.bigquery_project_id
        bigquery_dataset_name = args.bigquery_dataset_name

        postgres_host = args.postgres_host
        postgres_port = args.postgres_port
        postgres_database = args.postgres_database
        postgres_user = args.postgres_user
        postgres_password = args.postgres_password

        # Step0 関連の引数
        input_list_file = args.input_list_file
        run_step0_prepare_documents = args.run_step0_prepare_documents
        run_step0_only = args.run_step0_only
        run_markdown_from_db = args.run_markdown_from_db
        markdown_document_ids_arg = args.markdown_document_ids
        markdown_document_ids_file = args.markdown_document_ids_file
        markdown_include_existing = args.markdown_include_existing
        markdown_overwrite_files = args.markdown_overwrite_files
        run_ocr_json_from_db = args.run_ocr_json_from_db
        ocr_json_document_ids_arg = args.ocr_json_document_ids
        ocr_json_document_ids_file = args.ocr_json_document_ids_file
        ocr_json_include_existing = args.ocr_json_include_existing
        ocr_json_overwrite_files = args.ocr_json_overwrite_files
        stop_after_step1 = args.stop_after_step1
        step0_output_base_dir = args.step0_output_base_dir
        step0_topAgencyName = args.step0_topAgencyName
        step0_no_merge = args.step0_no_merge
        step0_timestamp = args.step0_timestamp
        step0_do_fetch_html = args.step0_do_fetch_html
        step0_do_extract_links = args.step0_do_extract_links
        step0_do_format_documents = args.step0_do_format_documents
        step0_do_download_pdfs = args.step0_do_download_pdfs
        step0_do_markdown = args.step0_do_markdown
        step0_do_ocr_json = args.step0_do_ocr_json
        step0_do_count_pages = args.step0_do_count_pages
        step0_do_ocr = args.step0_do_ocr
        step0_google_api_key = args.step0_google_api_key
        gemini_model = args.gemini_model
        step0_ocr_max_concurrency = args.step0_ocr_max_concurrency
        step0_ocr_max_api_calls_per_run = args.step0_ocr_max_api_calls_per_run

        step1_transfer_remove_table = args.step1_transfer_remove_table
        step3_remove_table = args.step3_remove_table
    except:
        use_bigquery = False
        use_postgres = False
        stop_processing = True

        postgres_host = None
        postgres_port = 5432
        postgres_database = None
        postgres_user = None
        postgres_password = None

        input_list_file = None
        run_step0_prepare_documents = False
        run_step0_only = False
        stop_after_step1 = False
        step0_output_base_dir = "output"
        step0_topAgencyName = "防衛省"
        step0_no_merge = False
        step0_timestamp = None
        step0_do_fetch_html = False
        step0_do_extract_links = False
        step0_do_format_documents = False
        step0_do_download_pdfs = False
        step0_do_markdown = False
        step0_do_ocr_json = False
        step0_do_count_pages = False
        step0_do_ocr = False
        gemini_model = "gemini-2.5-flash"
        run_markdown_from_db = False
        markdown_document_ids_arg = None
        markdown_document_ids_file = None
        markdown_include_existing = False
        markdown_overwrite_files = False
        run_ocr_json_from_db = False
        ocr_json_document_ids_arg = None
        ocr_json_document_ids_file = None
        ocr_json_include_existing = False
        ocr_json_overwrite_files = False

        step1_transfer_remove_table = False
        step3_remove_table = False

    # データベースオペレーターの作成（共通）
    if use_gcp_vm:
        db_operator = DBOperatorGCPVM(
            bigquery_location=bigquery_location,
            bigquery_project_id=bigquery_project_id,
            bigquery_dataset_name=bigquery_dataset_name
        )
    elif use_postgres:
        db_operator = DBOperatorPOSTGRES(
            postgres_host=postgres_host,
            postgres_port=postgres_port,
            postgres_database=postgres_database,
            postgres_user=postgres_user,
            postgres_password=postgres_password
        )
        db_operator.ensureBackendEvaluationStatusesTable()
    else:
        db_operator = DBOperatorSQLITE3(
            sqlite3_db_file_path=sqlite3_db_file_path
        )

    # BidJudgementSan オブジェクト作成（共通）
    obj = BidJudgementSan(
        tablenamesconfig=TablenamesConfig,
        db_operator=db_operator,
        gemini_model=gemini_model
    )

    if stop_processing:
        exit(1)

    # Step0のみ実行モード
    def _normalize_document_ids(raw_ids):
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

    markdown_document_ids = None
    if run_markdown_from_db:
        if markdown_document_ids_arg:
            normalized = _normalize_document_ids(markdown_document_ids_arg.split(","))
            if not normalized:
                print("Error: --markdown_document_ids is specified but no valid IDs were provided.")
                exit(1)
            markdown_document_ids = normalized

        if markdown_document_ids_file:
            path = Path(markdown_document_ids_file)
            if not path.exists():
                print(f"Error: --markdown_document_ids_file not found: {markdown_document_ids_file}")
                exit(1)
            content = path.read_text().strip()
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
                        exit(1)
                else:
                    file_ids = content.splitlines()

            normalized_file_ids = _normalize_document_ids(file_ids)
            if not normalized_file_ids:
                print("Error: --markdown_document_ids_file does not contain valid IDs.")
                exit(1)
            if markdown_document_ids is None:
                markdown_document_ids = normalized_file_ids
            else:
                combined = markdown_document_ids + normalized_file_ids
            markdown_document_ids = list(dict.fromkeys(combined))

    ocr_json_document_ids = None
    if run_ocr_json_from_db:
        if ocr_json_document_ids_arg:
            normalized = _normalize_document_ids(ocr_json_document_ids_arg.split(","))
            if not normalized:
                print("Error: --ocr_json_document_ids is specified but no valid IDs were provided.")
                exit(1)
            ocr_json_document_ids = normalized

        if ocr_json_document_ids_file:
            path = Path(ocr_json_document_ids_file)
            if not path.exists():
                print(f"Error: --ocr_json_document_ids_file not found: {ocr_json_document_ids_file}")
                exit(1)
            file_ids = []
            if path.suffix.lower() == ".json":
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    print("Error: --ocr_json_document_ids_file must contain valid JSON.")
                    exit(1)
                if isinstance(data, list):
                    file_ids = _normalize_document_ids(data)
                else:
                    print("Error: --ocr_json_document_ids_file must contain a JSON array when using JSON format.")
                    exit(1)
            else:
                file_ids = _normalize_document_ids(path.read_text(encoding="utf-8").splitlines())

            if not file_ids:
                print("Error: --ocr_json_document_ids_file does not contain valid IDs.")
                exit(1)

            if ocr_json_document_ids is None:
                ocr_json_document_ids = file_ids
            else:
                combined = ocr_json_document_ids + file_ids
                ocr_json_document_ids = list(dict.fromkeys(combined))

    if run_step0_only:
        if input_list_file is None:
            print("Error: --input_list_file is required when --run_step0_only is specified")
            exit(1)

        obj.step0_prepare_documents(
            input_list_file=input_list_file,
            output_base_dir=step0_output_base_dir,
            timestamp=step0_timestamp,
            topAgencyName=step0_topAgencyName,
            no_merge=step0_no_merge,
            use_gcs=(use_gcp_vm or use_postgres),
            do_fetch_html=step0_do_fetch_html,
            do_extract_links=step0_do_extract_links,
            do_format_documents=step0_do_format_documents,
            do_download_pdfs=step0_do_download_pdfs,
            do_markdown=step0_do_markdown,
            do_ocr_json=step0_do_ocr_json,
            do_count_pages=step0_do_count_pages,
            do_ocr=step0_do_ocr,
            google_api_key=step0_google_api_key,
            ocr_max_concurrency=step0_ocr_max_concurrency,
            ocr_max_api_calls_per_run=step0_ocr_max_api_calls_per_run
        )
        print("\n--run_step0_only specified. Exiting after step0.")
        exit(0)

    # Markdown再生成モード
    if run_markdown_from_db:
        obj.regenerate_markdown_from_database(
            use_gcs=(use_gcp_vm or use_postgres),
            google_api_key=step0_google_api_key,
            max_concurrency=step0_ocr_max_concurrency,
            max_api_calls_per_run=step0_ocr_max_api_calls_per_run,
            document_ids=markdown_document_ids,
            only_missing=(not markdown_include_existing),
            overwrite_files=markdown_overwrite_files
        )
        exit(0)

    if run_ocr_json_from_db:
        obj.regenerate_ocr_json_from_database(
            use_gcs=(use_gcp_vm or use_postgres),
            google_api_key=step0_google_api_key,
            max_concurrency=step0_ocr_max_concurrency,
            max_api_calls_per_run=step0_ocr_max_api_calls_per_run,
            document_ids=ocr_json_document_ids,
            only_missing=(not ocr_json_include_existing),
            overwrite_files=ocr_json_overwrite_files
        )
        exit(0)

    # Step0: 公告ドキュメント準備処理（オプション）
    if run_step0_prepare_documents:
        if input_list_file is None:
            print("Error: --input_list_file is required when --run_step0_prepare_documents is specified")
            exit(1)

        obj.step0_prepare_documents(
            input_list_file=input_list_file,
            output_base_dir=step0_output_base_dir,
            timestamp=step0_timestamp,
            topAgencyName=step0_topAgencyName,
            no_merge=step0_no_merge,
            use_gcs=(use_gcp_vm or use_postgres),
            do_fetch_html=step0_do_fetch_html,
            do_extract_links=step0_do_extract_links,
            do_format_documents=step0_do_format_documents,
            do_download_pdfs=step0_do_download_pdfs,
            do_markdown=step0_do_markdown,
            do_ocr_json=step0_do_ocr_json,
            do_count_pages=step0_do_count_pages,
            do_ocr=step0_do_ocr,
            google_api_key=step0_google_api_key,
            ocr_max_concurrency=step0_ocr_max_concurrency,
            ocr_max_api_calls_per_run=step0_ocr_max_api_calls_per_run
        )

    obj.step1_transfer_v2(remove_table=step1_transfer_remove_table)

    # step1で止まる場合
    if stop_after_step1:
        print("\n--stop_after_step1 specified. Exiting after step1.")
        exit(0)

    obj.step3(remove_table=step3_remove_table)
    print("Ended step3.")
    exit(0)

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
    announcements_estimated_amounts = master.getAnnouncementsEstimatedAmounts()
    similar_cases_master = master.getSimilarCasesMaster()
    similar_cases_competitors = master.getSimilarCasesCompetitors()

    db_operator.uploadDataToTable(data=announcements_competing_companies_master, tablename="announcements_competing_companies_master", chunksize=5000)
    db_operator.uploadDataToTable(data=announcements_competing_company_bids_master, tablename="announcements_competing_company_bids_master", chunksize=5000)
    db_operator.uploadDataToTable(data=announcements_estimated_amounts, tablename="announcements_estimated_amounts", chunksize=5000)
    if not db_operator.ifTableExists(tablename="similar_cases_master"):
        db_operator.uploadDataToTable(data=similar_cases_master, tablename="similar_cases_master", chunksize=5000)
    if not db_operator.ifTableExists(tablename="similar_cases_competitors"):
        db_operator.uploadDataToTable(data=similar_cases_competitors, tablename="similar_cases_competitors", chunksize=5000)


    # db_operator.selectToTable(tablename="bid_announcements_pre")
    # db_operator.selectToTable(tablename="bid_announcements")
    # db_operator.selectToTable(tablename="bid_requirements")
    # db_operator.any_query(sql=fr"select requirement_type, count(*) as N from bid_requirements group by requirement_type order by N desc")
    # db_operator.selectToTable(tablename="sufficient_requirements")
    # db_operator.selectToTable(tablename="insufficient_requirements")
    # db_operator.selectToTable(tablename="company_bid_judgement")
    # db_operator.selectToTable(tablename="bid_orderers")
    # db_operator.any_query(sql = "SELECT name FROM sqlite_master WHERE type='table'")

    # db_operator.any_query(sql = fr"SELECT table_name FROM `{bigquery_project_id}.{bigquery_dataset_name}.INFORMATION_SCHEMA.TABLES`")
    # db_operator.any_query(sql=fr"select requirement_type, count(*) as N from `{bigquery_project_id}.{bigquery_dataset_name}.bid_requirements` group by requirement_type order by N desc")

    # backend 用意する用
    if False:
        if not db_operator.ifTableExists(tablename="bid_orderers"):
            db_operator.createBidOrderersFromAnnouncements(bid_orderer_tablename="bid_orderers", bid_announcements_tablename="bid_announcements")
        else:
            db_operator.dropTable("bid_orderers")
            db_operator.createBidOrderersFromAnnouncements(bid_orderer_tablename="bid_orderers", bid_announcements_tablename="bid_announcements")


        db_operator.dropTable("workflow_contacts")
        db_operator.dropTable("evaluation_assignees")
        db_operator.createWorkflowContacts("workflow_contacts")
        db_operator.createEvaluationAssignees("evaluation_assignees", workflow_contacts_tablename="workflow_contacts")
        
        db_operator.createBackendCompanies(tablename="backend_companies_pre")
        db_operator.createBackendPartners(tablename="backend_partners_pre")

        db_operator.createBackendCompanies(tablename="backend_companies")
        db_operator.createBackendPartners(tablename="backend_partners")

        df_backend_companies = db_operator.selectToTable(tablename="backend_companies")
        df_backend_partners = db_operator.selectToTable(tablename="backend_partners")

        df_backend_companies.shape
        df_backend_partners.shape


