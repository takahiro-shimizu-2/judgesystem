#coding: utf-8

import sqlite3

import pandas as pd

from packages.engine.repository.base import DBOperator, TablenamesConfig


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
