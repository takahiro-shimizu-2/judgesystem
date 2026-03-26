#coding: utf-8

import pandas as pd
from pandas_gbq import to_gbq

try:
    from google.cloud import bigquery
except Exception as e:
    print(e)

from packages.engine.repository.base import DBOperator, TablenamesConfig


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

    def ensure_source_pages_table(self):
        sql = fr"""
        CREATE TABLE IF NOT EXISTS `{self.project_id}.{self.dataset_name}.source_pages` (
            id STRING,
            agency_id STRING,
            agency_name STRING,
            top_agency_name STRING,
            sub_agency_name STRING,
            page_code STRING,
            page_name STRING,
            source_url STRING,
            submitted_source_url STRING,
            extractor_name STRING,
            page_behavior_json STRING,
            matrix_header_keywords STRING,
            force_matrix BOOL,
            is_active BOOL,
            created_at STRING,
            updated_at STRING
        )
        """
        self.client.query(sql).result()

    def fetch_source_page(self, page_code=None, top_agency=None, sub_agency=None, source_url=None):
        self.ensure_source_pages_table()
        normalized_page_code = (page_code or "").strip()
        if normalized_page_code:
            sql = fr"""
            SELECT *
            FROM `{self.project_id}.{self.dataset_name}.source_pages`
            WHERE page_code = @page_code
            LIMIT 1
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("page_code", "STRING", normalized_page_code)]
            )
            df = self.client.query(sql, job_config=job_config).result().to_dataframe()
            if not df.empty:
                return df.iloc[0].to_dict()

        normalized_source = (source_url or "").strip().rstrip("/")
        if normalized_source:
            sql = fr"""
            SELECT *
            FROM `{self.project_id}.{self.dataset_name}.source_pages`
            WHERE TRIM(COALESCE(source_url, '')) = @src
               OR TRIM(COALESCE(submitted_source_url, '')) = @src
            LIMIT 1
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("src", "STRING", normalized_source)]
            )
            df = self.client.query(sql, job_config=job_config).result().to_dataframe()
            if not df.empty:
                return df.iloc[0].to_dict()

        conditions = []
        query_parameters = []

        normalized_top = (top_agency or "").strip()
        if normalized_top:
            conditions.append("top_agency_name = @top_agency")
            query_parameters.append(bigquery.ScalarQueryParameter("top_agency", "STRING", normalized_top))

        normalized_sub = (sub_agency or "").strip()
        if normalized_sub:
            conditions.append("sub_agency_name = @sub_agency")
            query_parameters.append(bigquery.ScalarQueryParameter("sub_agency", "STRING", normalized_sub))

        if not conditions:
            return None

        where_clause = " AND ".join(conditions)
        sql = fr"""
        SELECT *
        FROM `{self.project_id}.{self.dataset_name}.source_pages`
        WHERE (is_active IS NULL OR is_active = TRUE)
          AND {where_clause}
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
        """
        job_config = bigquery.QueryJobConfig(query_parameters=query_parameters)
        df = self.client.query(sql, job_config=job_config).result().to_dataframe()
        if df.empty:
            return None
        return df.iloc[0].to_dict()

    def sync_source_pages(self, rows):
        if not rows:
            return
        self.ensure_source_pages_table()
        delete_sql = fr"DELETE FROM `{self.project_id}.{self.dataset_name}.source_pages` WHERE TRUE"
        self.client.query(delete_sql).result()
        df = pd.DataFrame(rows)
        if df.empty:
            return
        if "force_matrix" not in df:
            df["force_matrix"] = False
        df["force_matrix"] = df["force_matrix"].fillna(False).astype(bool)
        if "is_active" not in df:
            df["is_active"] = True
        df["is_active"] = df["is_active"].fillna(True).astype(bool)
        to_gbq(
            dataframe=df,
            destination_table=f"{self.dataset_name}.source_pages",
            project_id=self.project_id,
            if_exists="append",
        )


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
