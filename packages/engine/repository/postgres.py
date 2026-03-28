#coding: utf-8

import pandas as pd

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

from packages.engine.repository.base import DBOperator, TablenamesConfig


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
            print(f"Index '{index_name}' created successfully")
        except Exception as e:
            print(f"Index '{index_name}' failed: {str(e)}")

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
        "updatedDate" TEXT,
        orderer_id TEXT,
        category TEXT,
        "bidType" TEXT,
        is_ocr_failed BOOLEAN,
        notice_category_name TEXT,
        notice_category_code TEXT,
        notice_procurement_method TEXT,
        category_segment TEXT,
        category_detail TEXT
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
        is_ocr_failed BOOLEAN,
        notice_category_name TEXT,
        notice_category_code TEXT,
        notice_procurement_method TEXT,
        category_segment TEXT,
        category_detail TEXT
        )
        """
        self.cur.execute(sql)

    def createBidAnnouncementDates(self, tablename):
        sql = fr"""
        CREATE TABLE {tablename} (
        announcement_no INTEGER NOT NULL,
        document_id TEXT,
        submission_document_name TEXT,
        date_value DATE,
        date_raw TEXT,
        date_meaning TEXT,
        timepoint_type TEXT,
        "createdDate" TEXT,
        "updatedDate" TEXT
        )
        """
        self.cur.execute(sql)
        self.cur.execute(fr"CREATE INDEX IF NOT EXISTS idx_{tablename}_announcement_no ON {tablename} (announcement_no)")


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

    def ensure_source_pages_table(self):
        sql = """
        CREATE TABLE IF NOT EXISTS source_pages (
            id TEXT PRIMARY KEY,
            agency_id TEXT,
            agency_name TEXT,
            top_agency_name TEXT,
            sub_agency_name TEXT,
            page_code TEXT UNIQUE,
            page_name TEXT,
            source_url TEXT,
            submitted_source_url TEXT,
            extractor_name TEXT,
            page_behavior_json TEXT,
            matrix_header_keywords TEXT,
            force_matrix BOOLEAN,
            is_active BOOLEAN,
            created_at TEXT,
            updated_at TEXT
        )
        """
        self.cur.execute(sql)
        self.cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_source_pages_code ON source_pages(page_code)")

    def fetch_source_page(self, page_code=None, top_agency=None, sub_agency=None, source_url=None):
        self.ensure_source_pages_table()
        normalized_page_code = (page_code or "").strip()
        if normalized_page_code:
            sql_query = """
            SELECT *
            FROM source_pages
            WHERE page_code = %s
            LIMIT 1
            """
            self.cur.execute(sql_query, [normalized_page_code])
            row = self.cur.fetchone()
            if row:
                columns = [desc[0] for desc in self.cur.description]
                return dict(zip(columns, row))

        normalized_source = (source_url or "").strip().rstrip("/")
        if normalized_source:
            sql_query = """
            SELECT *
            FROM source_pages
            WHERE TRIM(COALESCE(source_url, '')) = %s
               OR TRIM(COALESCE(submitted_source_url, '')) = %s
            LIMIT 1
            """
            self.cur.execute(sql_query, [normalized_source, normalized_source])
            row = self.cur.fetchone()
            if row:
                columns = [desc[0] for desc in self.cur.description]
                return dict(zip(columns, row))

        conditions = []
        params = []

        normalized_top = (top_agency or "").strip()
        if normalized_top:
            conditions.append("top_agency_name = %s")
            params.append(normalized_top)

        normalized_sub = (sub_agency or "").strip()
        if normalized_sub:
            conditions.append("sub_agency_name = %s")
            params.append(normalized_sub)

        if not conditions:
            return None

        where_clause = " AND ".join(conditions)
        sql_query = f"""
        SELECT *
        FROM source_pages
        WHERE (is_active IS NULL OR is_active = TRUE)
          AND {where_clause}
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1
        """
        self.cur.execute(sql_query, params)
        row = self.cur.fetchone()
        if not row:
            return None
        columns = [desc[0] for desc in self.cur.description]
        return dict(zip(columns, row))

    def sync_source_pages(self, rows):
        if not rows:
            return
        self.ensure_source_pages_table()
        insert_columns = [
            "id",
            "agency_id",
            "agency_name",
            "top_agency_name",
            "sub_agency_name",
            "page_code",
            "page_name",
            "source_url",
            "submitted_source_url",
            "extractor_name",
            "page_behavior_json",
            "matrix_header_keywords",
            "force_matrix",
            "is_active",
            "created_at",
            "updated_at",
        ]
        values = []
        for row in rows:
            values.append(
                [
                    row.get("id"),
                    row.get("agency_id"),
                    row.get("agency_name"),
                    row.get("top_agency_name"),
                    row.get("sub_agency_name"),
                    row.get("page_code"),
                    row.get("page_name"),
                    row.get("source_url"),
                    row.get("submitted_source_url"),
                    row.get("extractor_name"),
                    row.get("page_behavior_json"),
                    row.get("matrix_header_keywords"),
                    bool(row.get("force_matrix")),
                    True if row.get("is_active", True) else False,
                    row.get("created_at"),
                    row.get("updated_at"),
                ]
            )
        insert_sql = sql.SQL("""
            INSERT INTO source_pages (
                {columns}
            ) VALUES %s
            ON CONFLICT (page_code) DO UPDATE SET
                agency_id = EXCLUDED.agency_id,
                agency_name = EXCLUDED.agency_name,
                top_agency_name = EXCLUDED.top_agency_name,
                sub_agency_name = EXCLUDED.sub_agency_name,
                page_name = EXCLUDED.page_name,
                source_url = EXCLUDED.source_url,
                submitted_source_url = EXCLUDED.submitted_source_url,
                extractor_name = EXCLUDED.extractor_name,
                page_behavior_json = EXCLUDED.page_behavior_json,
                matrix_header_keywords = EXCLUDED.matrix_header_keywords,
                force_matrix = EXCLUDED.force_matrix,
                is_active = EXCLUDED.is_active,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at
        """).format(
            columns=sql.SQL(", ").join(sql.Identifier(col) for col in insert_columns)
        )
        execute_values(self.cur, insert_sql, values)


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
            "bidType", category, is_ocr_failed, "doneOCR", "createdDate", "updatedDate",
            notice_category_name, notice_category_code, notice_procurement_method,
            category_segment, category_detail
        )
        SELECT
            announcement_no, "workName", "topAgencyName", orderer_id,
            "workPlace", zipcode, address, department, "assigneeName",
            telephone, fax, mail, "publishDate", "docDistStart", "docDistEnd",
            "submissionStart", "submissionEnd", "bidStartDate", "bidEndDate",
            "bidType", category, is_ocr_failed, "doneOCR", "createdDate", "updatedDate",
            notice_category_name, notice_category_code, notice_procurement_method,
            category_segment, category_detail
        FROM {source_tablename} AS S
        WHERE NOT EXISTS (
            SELECT 1
            FROM {target_tablename} AS T
            WHERE T.announcement_no = S.announcement_no
        )
        """

        self.cur.execute(sql)
        return self.cur.rowcount

    def replaceBidAnnouncementDates(self, target_tablename, source_tablename):
        delete_sql = f"""
        DELETE FROM {target_tablename}
        WHERE announcement_no IN (
            SELECT DISTINCT announcement_no FROM {source_tablename}
        )
        """
        self.cur.execute(delete_sql)

        insert_sql = f"""
        INSERT INTO {target_tablename} (
            announcement_no, document_id, submission_document_name,
            date_value, date_raw, date_meaning, timepoint_type,
            "createdDate", "updatedDate"
        )
        SELECT
            announcement_no, document_id, submission_document_name,
            CASE
                WHEN date_value ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
                    THEN date_value::DATE
                ELSE NULL
            END AS date_value,
            date_raw, date_meaning, timepoint_type,
            "createdDate", "updatedDate"
        FROM {source_tablename}
        """
        self.cur.execute(insert_sql)
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
