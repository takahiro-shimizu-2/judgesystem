#coding: utf-8

import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass

import pandas as pd
from pandas_gbq import to_gbq

try:
    from google.cloud import bigquery
except Exception as e:
    print(e)

try:
    from sqlalchemy import create_engine
except Exception as e:
    print(e)

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import execute_values
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

class DBOperatorGCPVM(DBOperator):
    """
    google bigquery を操作するクラス。
    """

    def get_text_column_type(self):
        return "STRING"

    def get_bool_column_type(self):
        return "BOOL"

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

    def updateFile404Flags(self, tablename, df_flags):
        if df_flags.empty:
            return 0

        tmp_table = "tmp_file_404_updates"
        df_tmp = df_flags[["document_id", "fileFormat", "file_404_flag"]].dropna(subset=["document_id", "fileFormat"])
        if df_tmp.empty:
            return 0

        self.uploadDataToTable(df_tmp, tmp_table, chunksize=5000)
        sql = f"""
        MERGE `{self.project_id}.{self.dataset_name}.{tablename}` AS T
        USING `{self.project_id}.{self.dataset_name}.{tmp_table}` AS S
        ON T.document_id = S.document_id AND T.fileFormat = S.fileFormat
        WHEN MATCHED THEN
          UPDATE SET T.file_404_flag = S.file_404_flag
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

    def updateFile404Flags(self, tablename, df_flags):
        df_tmp = df_flags[["document_id", "fileFormat", "file_404_flag"]].dropna(subset=["document_id", "fileFormat"])
        if df_tmp.empty:
            return 0
        sql = fr"UPDATE {tablename} SET file_404_flag = ? WHERE document_id = ? AND fileFormat = ?"
        values = [(bool(row["file_404_flag"]), row["document_id"], row["fileFormat"]) for _, row in df_tmp.iterrows()]
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

    def lower_column_expr(self, column_name):
        return f'LOWER("{column_name}")'

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

    def updateFile404Flags(self, tablename, df_flags):
        df_tmp = df_flags[["document_id", "fileFormat", "file_404_flag"]].dropna(subset=["document_id", "fileFormat"])
        if df_tmp.empty:
            return 0
        records = [(row["document_id"], row["fileFormat"], bool(row["file_404_flag"])) for _, row in df_tmp.iterrows()]
        sql = f"""
        UPDATE {tablename} AS t SET file_404_flag = v.file_404_flag
        FROM (VALUES %s) AS v(document_id, "fileFormat", file_404_flag)
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
