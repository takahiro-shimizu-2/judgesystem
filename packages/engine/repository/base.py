#coding: utf-8

import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass

import pandas as pd

try:
    from google.cloud import bigquery
except Exception as e:
    print(e)


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


class DBOperator(ABC):
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

    def get_text_column_type(self):
        return "TEXT"

    def get_bool_column_type(self):
        return "BOOLEAN"

    def lower_column_expr(self, column_name):
        return f"LOWER({column_name})"

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
    def updateFile404Flags(self, tablename, df_flags):
        """
        announcements_documents_master の file_404_flag を更新する

        Args:
            tablename: 対象テーブル名
            df_flags: document_id / fileFormat / file_404_flag を含む DataFrame
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
