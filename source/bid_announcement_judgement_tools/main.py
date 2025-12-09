#coding: utf-8


import pandas as pd
import numpy as np
import sqlite3  # sqlite3使わない想定でもimport
import os
import argparse
from google import genai # For OCR
import httpx
import re
import json

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

try:
    from google.genai import types  # いらないかも。(vertex ai?)
except Exception as e:
    print(e)


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


class Master:
    # 状態を持ってないので、master を集めたクラスを作る必要は無い？
    # アップロードする際に DB 接続情報を保持させるからクラスが必要？

    def __init__(self, sql_connector):

        master_dict = {
            "agency_master":"data/master/agency_master.txt",
            "company_master":"data/master/company_master.txt",
            "construction_master":"data/master/construction_master.txt",
            "employee_master":"data/master/employee_master.txt",
            "employee_qualification_master":"data/master/employee_qualification_master.txt",
            "office_master":"data/master/office_master.txt",
            "office_registration_authorization_master":"data/master/office_registration_authorization_master.txt",
            "office_work_achivements_master":"data/master/office_work_achivements_master.txt",
            "technician_experience_master":"data/master/technician_experience_master.txt",
            "technician_qualification_master":"data/master/technician_qualification_master.txt"
        }

        for key, val in master_dict.items():
            setattr(self, key, val)

        try:
            self.client = sql_connector.client
            self.project_id = sql_connector.project_id
            self.dataset_name = sql_connector.dataset_name
        except Exception as e:
            print(fr"    class Master: {str(e)}")

        try:
            self.conn = sql_connector.conn
            self.cur = sql_connector.cur
        except Exception as e:
            print(fr"    class Master: {str(e)}")


    def getAgencyMaster(self):
        return pd.read_csv(self.agency_master, sep="\t")
    
    def getCompanyMaster(self):
        return pd.read_csv(self.company_master, sep="\t")
    
    def getConstructionMaster(self):
        return pd.read_csv(self.construction_master, sep="\t")
    
    def getEmployeeMaster(self):
        return pd.read_csv(self.employee_master, sep="\t")
    
    def getEmployeeQualificationMaster(self):
        return pd.read_csv(self.employee_qualification_master, sep="\t")
    
    def getOfficeMaster(self):
        return pd.read_csv(self.office_master, sep="\t")
    
    def getOfficeRegistrationAuthorizationMaster(self):
        return pd.read_csv(self.office_registration_authorization_master, sep="\t")

    def getOfficeWorkAchivementsMaster(self):
        return pd.read_csv(self.office_work_achivements_master, sep="\t")

    def getTechnicianExperienceMaster(self):
        return pd.read_csv(self.technician_experience_master, sep="\t")
    
    def getTechnicianQualificationMaster(self):
        return pd.read_csv(self.technician_qualification_master, sep="\t")


    def uploadOfficeMaster(self, tablename="office_master", dbtype=None):
        office_master = self.getOfficeMaster()
        if dbtype is None:
            print("Please specify dbtype.")
        elif dbtype == "bigquery":
            to_gbq(
                dataframe=office_master, 
                destination_table=fr"{self.dataset_name}.{tablename}",  # dataset.table 形式
                project_id=fr"{self.project_id}", 
                if_exists='replace'
            )
        elif dbtype == "sqlite3":
            office_master.to_sql(
                name=tablename, 
                con = self.conn, 
                if_exists="replace", 
                index=False
            )
        else:
            print(fr"Unknown dbtype={dbtype}.")


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
        print(master.getTechnicianExperienceMaster())
        print(master.getTechnicianQualificationMaster())





class SQLConnector:

    def __init__(self, sqlite3_db_file_path=None, bigquery_location=None, bigquery_project_id=None, bigquery_dataset_name=None):
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


class OCRutils:
    def __init__(self, google_ai_studio_api_key_filepath=None):

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

    def getJsonFrompdfurl(self, pdfurl, preID):
        client = self.client

        # Retrieve and encode the PDF byte
        doc_data = httpx.get(pdfurl).content

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
            "郵便番号\": "",
            "住所": "",
            "担当部署名": "",
            "担当者名": "",
            "電話番号": "",
            "FAX番号": "",
            "メールアドレス": ""
        },
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
        ])
        # print(response.text)

        text=response.text
        #json_text = extract_json(text=response.text)
        text2 = text.replace('\n', '').replace('```json', '').replace("```","")
        dict1 = json.loads(text2)
        dict1["preID"] = preID
        return dict1

    def convertJson(self, json_value):
        def _modifyDate(datestr):
            m = re.search(r"令和\s*(\d+)年\s*(\d+)月\s*(\d+)日", datestr)
            if m:
                return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"
            return datestr

        new_json = {}
        new_json["preID"] = json_value.get("preID")
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

        tmp_json = json_value.get("入札説明書の交付期間", None)
        if isinstance(tmp_json, dict):
            new_json["docdiststart"] = _modifyDate(tmp_json.get("開始日", None))
            new_json["docdistend"] = _modifyDate(tmp_json.get("終了日", None))

        tmp_json = json_value.get("申請書及び競争参加資格確認資料の提出期限", None)
        if isinstance(tmp_json, dict):
            new_json["submissionstart"] = _modifyDate(tmp_json.get("開始日", None))
            new_json["submissionend"] = _modifyDate(tmp_json.get("終了日", None))

        tmp_json = json_value.get("入札書の提出期間", None)
        if isinstance(tmp_json, dict):
            new_json["bidstartdate"] = _modifyDate(tmp_json.get("開始日", None))
            new_json["bidenddate"] = _modifyDate(tmp_json.get("終了日", None))

        return new_json


    def getRequirementText(self, pdfurl, preID):
        client = self.client

        # Retrieve and encode the PDF byte
        doc_data = httpx.get(pdfurl).content

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
        ])
        # print(response.text)
        text=response.text
        #json_text = extract_json(text=response.text)
        text2 = text.replace('\n', '').replace('```json', '').replace("```","")
        dict1 = json.loads(text2)
        dict1["preID"] = preID
        return dict1

    def convertRequirementTextDict(self, requirement_texts):
        preID = requirement_texts["preID"]
        preid_list = []
        seqid_list = []
        requirement_type_list = []
        requirement_text_list = []
        createdDate_list = []
        updatedDate_list = []
        req_type_list = ["欠格要件","業種・等級要件","所在地要件","技術者要件","実績要件","その他"]
        for i, text in enumerate(requirement_texts["資格・条件"]):
            # TODO
            # text は、"改行分割" が必要？
            # 未処理。

            text_lower = text.lower()
            for req_type in req_type_list:
                if req_type == "欠格要件":
                    search_list = [
                        "70条","71条","会社更生法","民事再生法","更生手続",
                        "再生手続","情報保全","資本関係","人的関係","滞納",
                        "外国法","取引停止","破産","暴力団","指名停止",
                        "後見人","法人格取消"
                    ]
                elif req_type == "業種・等級要件":
                    search_list = ["競争参加資格","一般競争","指名競争","等級","総合審査"]
                elif req_type == "所在地要件":
                    search_list = ["所在","県内","市内","防衛局管内","本店が","支店が"]
                elif req_type == "技術者要件":
                    search_list = [
                        "施工管理技士","技術士","資格者証","電気工事士","建築士",
                        "基幹技能者","監理技術者","主任技術者","監理技術者資格者証","監理技術者講習修了証"
                    ]
                elif req_type == "実績要件":
                    search_list = [
                        "実績","工事成績","元請けとして","元請として","点以上",
                        "jv比率","過去実績"
                    ]            

                search_str = "|".join(search_list)
                if re.search(search_str, text_lower):
                    preid_list.append(preID)
                    seqid_list.append(i)
                    requirement_type_list.append(req_type)
                    requirement_text_list.append(text)
                    createdDate_list.append("")
                    updatedDate_list.append("")

        new_dict = {
            "preID":preid_list,
            "seqid":seqid_list,
            "requirement_type":requirement_type_list,
            "requirement_text":requirement_text_list,
            "createdDate":createdDate_list,
            "updatedDate":updatedDate_list
        }
        return new_dict




class GCPVM:
    def __init__(self, bid_announcements_pre_file, google_ai_studio_api_key_filepath=None, sql_connector=None):
        self.bid_announcements_pre_file = bid_announcements_pre_file
        self.google_ai_studio_api_key_filepath = google_ai_studio_api_key_filepath

        self.client = sql_connector.client
        self.project_id = sql_connector.project_id
        self.dataset_name = sql_connector.dataset_name

    def select_to_table(self, tablename):
        client = self.client

        sql = fr"select * from {tablename}"
        df = client.query(sql).result().to_dataframe()
        return df
    
    def any_query(self, sql):
        client = self.client

        df = client.query(sql).result().to_dataframe()
        return df


    def step0_table_creation(self, bid_announcements_pre_file=None):
        if bid_announcements_pre_file is None:
            bid_announcements_pre_file = self.bid_announcements_pre_file

        client = self.client

        project_id = self.project_id
        dataset_name = self.dataset_name
        tablename = "bid_announcements_pre"


        # テーブル 'bid_announcements_pre' の存在確認
        sql = fr"""
        SELECT table_name FROM `{project_id}.{dataset_name}.INFORMATION_SCHEMA.TABLES`
        WHERE table_name = '{tablename}'
        """
        df = client.query(sql).result().to_dataframe()
        # .result() は、BigQuery のクエリジョブが 完了するまで待機し、結果を取得する処理
        # DML クエリ（INSERT, UPDATE, DELETE）を実行する場合 (必須)
        # → クエリが完了しないと変更が反映されないため、必ず .result() を呼ぶべき。
        # SELECT クエリの結果を使いたい場合
        # → .result() を使って結果をイテレートできる。
            
        if df.shape[0] == 1:
            # テーブル名があれば、いったん削除。
            sql = fr"""
            drop table `{project_id}.{dataset_name}.{tablename}`
            """
            client.query(sql).result()
            print(fr"TABLE DELETED: {project_id}.{dataset_name}.{tablename}")
        else:
            print(fr"TABLE Not exists: {project_id}.{dataset_name}.{tablename}")

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
        to_gbq(
            dataframe=df, 
            destination_table=fr"{dataset_name}.{tablename}",  # dataset.table 形式
            project_id=project_id, 
            if_exists='replace'
        )

        # check
        sql = fr"""
        SELECT * FROM `{project_id}.{dataset_name}.INFORMATION_SCHEMA.TABLES`
        """
        val = client.query(sql).result().to_dataframe()
        print(val)




    def step1_transfer(self, remove_table=False):

        client = self.client

        project_id = self.project_id
        dataset_name = self.dataset_name
        tablename_pre = "bid_announcements_pre"
        tablename_announcements = "bid_announcements"
        tablename_requirements = "bid_requirements"

        # まずは、bid_announcements テーブルの存在を確認。名前取得で検証。
        # (bq コマンドの方法もあるらしいが)
        sql = fr"""
        SELECT table_name FROM `{project_id}.{dataset_name}.INFORMATION_SCHEMA.TABLES`
        WHERE table_name = '{tablename_announcements}'
        """
        tablename = client.query(sql).result().to_dataframe()

        # テーブルが存在するなら、引数に応じて削除
        if tablename.shape[0] == 1:
            if remove_table:
                client.delete_table(fr"{project_id}.{dataset_name}.{tablename_announcements}", not_found_ok=True)
                print(fr"DELETE existing table: {project_id}.{dataset_name}.{tablename_announcements}")
                tablename = tablename.iloc[0:0]

        # テーブルが無いなら作成
        if tablename.shape[0] == 0:
            sql = fr"""
            create table `{project_id}.{dataset_name}.{tablename_announcements}` (
            preID int64,
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
            client.query(sql).result()
            print(fr"NEWLY CREATED: {project_id}.{dataset_name}.{tablename_announcements}.")
        else:
            print(fr"ALREADY EXISTS: {project_id}.{dataset_name}.{tablename_announcements}.")



        # 同様に、bid_requirements にも行う。
        sql = fr"""
        SELECT table_name FROM `{project_id}.{dataset_name}.INFORMATION_SCHEMA.TABLES`
        WHERE table_name = '{tablename_requirements}'
        """
        tablename = client.query(sql).result().to_dataframe()

        # テーブルが存在するなら、削除オプションに応じて削除
        if tablename.shape[0] == 1:
            if remove_table:
                client.delete_table(fr"{project_id}.{dataset_name}.{tablename_requirements}", not_found_ok=True)
                print(fr"DELETE existing table: {project_id}.{dataset_name}.{tablename_requirements}.")
                tablename = tablename.iloc[0:0]

        # テーブルが無いなら作成
        if tablename.shape[0] == 0:
            # テーブルが無いなら作成
            sql = fr"""
            create table `{project_id}.{dataset_name}.{tablename_requirements}` (
            preID int64,
            seqid int64,
            requirement_type string,
            requirement_text string,
            done_judgement bool,
            createdDate string,
            updatedDate string
            )
            """
            client.query(sql).result()
            print(fr"NEWLY CREATED: {project_id}.{dataset_name}.{tablename_requirements}.")
        else:
            print(fr"ALREADY EXISTS: {project_id}.{dataset_name}.{tablename_requirements}.")


        # 転写処理
        # BigQueryのような分析基盤は OLAP寄り。
        # ID管理や逐次更新はOLTP型DB（RDBMS）が得意
        #
        # ID ... GENERATE_UUID() で UUID を作る方法はある。
        # バッチ処理なら連番採番で問題なさそう。同時実行が想定される(例：近い時刻に異なる注文をinsert)場合は問題あるかもしれない。
        # TODO: 要テスト
        # 疑問:row_number付与の order by 列は pdf_urlがよいのか？
        sql = fr"""
        INSERT INTO `{project_id}.{dataset_name}.{tablename_announcements}` (
            preID,
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
            SELECT IFNULL(MAX(preID), 0) AS maxid FROM `{project_id}.{dataset_name}.{tablename_announcements}`
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
        FROM `{project_id}.{dataset_name}.{tablename_pre}` AS tbl_pre
        LEFT JOIN `{project_id}.{dataset_name}.{tablename_announcements}` AS tbl
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

        client.query(sql).result()

        # check
        sql = fr"""
        SELECT * FROM `{project_id}.{dataset_name}.{tablename_announcements}`
        """
        val = client.query(sql).result().to_dataframe()
        print(val)


    def step2_ocr(self, ocr_utils):

        client = self.client

        project_id = self.project_id
        dataset_name = self.dataset_name

        tablename_pre = "bid_announcements_pre"
        tablename_announcements = "bid_announcements"
        tmp_tablename_announcements = fr"tmp_{tablename_announcements}"
        tablename_requirements = "bid_requirements"
        tmp_tablename_requirements = fr"tmp_{tablename_requirements}"
        

        # OCR
        # doneOCRがFalseのものを対象にする。
        sql = fr"""
        SELECT * FROM `{project_id}.{dataset_name}.{tablename_announcements}`
        where doneOCR = FALSE
        """
        df1 = client.query(sql).result().to_dataframe()



        all_announcements = []
        all_requirement_texts = []
        for index, row in df1.iterrows():
            preID = row["preID"]
            print(f"Processing OCR for preID={preID}...")

            pdfurl = row["pdfUrl"]

            if not os.path.exists("data/ocr"):
                os.makedirs("data/ocr", exist_ok=True)

            ocr_announcements_file = fr"ocr_announcements_{preID}.json"
            ocr_announcements_filepath = fr"data/ocr/{ocr_announcements_file}"
            if not os.path.exists(ocr_announcements_filepath):
                print("   Trying ocr(announcements).")
                json_value = ocr_utils.getJsonFrompdfurl(pdfurl, preID=preID)
                new_json = ocr_utils.convertJson(json_value=json_value)
                with open(ocr_announcements_filepath, "w", encoding="utf-8") as f:
                    json.dump(new_json, f, ensure_ascii=False, indent=2)
            else:
                print("   Already getting announcements.")
                with open(ocr_announcements_filepath, "r", encoding="utf-8") as f:
                    new_json = json.load(f)


            ocr_requirements_file = fr"ocr_requirements_{preID}.json"
            ocr_requirements_filepath = fr"data/ocr/{ocr_requirements_file}"
            if not os.path.exists(ocr_requirements_filepath):
                print("   Trying ocr(requirements).")
                requirement_texts = ocr_utils.getRequirementText(pdfurl, preID=preID)
                dic = ocr_utils.convertRequirementTextDict(requirement_texts=requirement_texts)
                with open(ocr_requirements_filepath, "w", encoding="utf-8") as f:
                    json.dump(dic, f, ensure_ascii=False, indent=2)
            else:
                print("   Already getting requirements.")
                with open(ocr_requirements_filepath, "r", encoding="utf-8") as f:
                    dic = json.load(f)

            all_announcements.append(new_json)
            all_requirement_texts.append(pd.DataFrame(dic))



        ######################################
        # まずは bid_announcements を更新。   #
        ######################################

        df1 = pd.DataFrame(all_announcements)
        if df1.shape[0] > 0:
            to_gbq(
                dataframe=df1, 
                destination_table=fr"{dataset_name}.{tmp_tablename_announcements}",  # dataset.table 形式
                project_id=project_id, 
                if_exists='replace'
            )
        
            sql = fr"""MERGE `{project_id}.{dataset_name}.{tablename_announcements}` AS target
            USING `{project_id}.{dataset_name}.{tmp_tablename_announcements}` AS source
            ON target.preid = source.preid
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
                target.docdiststart = source.docdiststart,
                target.docdistend = source.docdistend,
                target.submissionstart = source.submissionstart,
                target.submissionend = source.submissionend,
                target.bidstartdate = source.bidstartdate,
                target.doneocr = TRUE
            """        
            client.query(sql).result()

        # 中間テーブル削除
        try:
            client.get_table(fr"{project_id}.{dataset_name}.{tmp_tablename_announcements}")
            client.delete_table(fr"{project_id}.{dataset_name}.{tmp_tablename_announcements}", not_found_ok=True)
        except NotFound:
            print(fr"Not Found: {project_id}.{dataset_name}.{tmp_tablename_announcements}")



        ######################################
        # bid_requirements を更新。           #
        ######################################

        if all_requirement_texts != []:
            df2 = pd.concat(all_requirement_texts, ignore_index=True)
            to_gbq(
                dataframe=df2, 
                destination_table=fr"{dataset_name}.{tmp_tablename_requirements}",  # dataset.table 形式
                project_id=project_id, 
                if_exists='replace'
            )

            to_gbq(df2, fr'{dataset_name}.{tmp_tablename_requirements}', project_id=fr'{project_id}', if_exists='replace')

            sql = fr"""MERGE `{project_id}.{dataset_name}.{tablename_requirements}` AS target
            USING `{project_id}.{dataset_name}.{tmp_tablename_requirements}` AS source
            ON target.preid = source.preid
            when not matched then
            insert (
                preID,
                seqid,
                requirement_type,
                requirement_text,
                done_judgement,
                createdDate,
                updatedDate
            )
            values (
                source.preid,
                source.seqid,
                source.requirement_type,
                source.requirement_text,
                FALSE,
                source.createdDate,
                source.updatedDate
            )
            """
            client.query(sql).result()

        # 中間テーブル削除
        try:
            client.get_table(fr"{project_id}.{dataset_name}.{tmp_tablename_requirements}")
            client.delete_table(fr"{project_id}.{dataset_name}.{tmp_tablename_requirements}", not_found_ok=True)
        except NotFound:
            print(fr"Not Found: {project_id}.{dataset_name}.{tmp_tablename_requirements}")




    def step3(self, remove_table=False):
        client = self.client

        project_id = self.project_id
        dataset_name = self.dataset_name

        tablename_pre = "bid_announcements_pre"
        tablename_announcements = "bid_announcements"
        tmp_tablename_announcements = fr"tmp_{tablename_announcements}"
        tablename_requirements = "bid_requirements"
        tmp_tablename_requirements = fr"tmp_{tablename_requirements}"
        tablename_company_bid_judgement = "company_bid_judgement"

        tablename_office_master = "office_master"


        tablename_sufficient_requirement_master = "sufficient_requirements"
        tablename_insufficient_requirement_master = "insufficient_requirements"






        tablenames = [
            tablename_company_bid_judgement, 
            tablename_sufficient_requirement_master,
            tablename_insufficient_requirement_master
        ]
        target_tablename = tablenames[0]
        for i, target_tablename in enumerate(tablenames):

            sql = fr"""
            SELECT table_name FROM `{project_id}.{dataset_name}.INFORMATION_SCHEMA.TABLES`
            WHERE table_name = '{target_tablename}'
            """
            tablename = client.query(sql).result().to_dataframe()

            if tablename.shape[0] == 1:
                if remove_table:
                    sql = fr"""
                    drop table {target_tablename}
                    """
                    client.delete_table(fr"{project_id}.{dataset_name}.{target_tablename}", not_found_ok=True)
                    print(fr"DELETE existing table: {target_tablename}.")
                    tablename = tablename.iloc[0:0]

            if tablename.shape[0] == 0:
                if target_tablename == tablename_company_bid_judgement:
                    sql = fr"""
                    create table `{project_id}.{dataset_name}.{tablename_company_bid_judgement}` (
                        preID int64,
                        company_id int64,
                        office_id int64,
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

                elif target_tablename == tablename_sufficient_requirement_master:
                    sql = fr"""
                    create table `{project_id}.{dataset_name}.{tablename_sufficient_requirement_master}` (
                        preID int64,
                        seqid int64,
                        company_id int64,
                        office_id int64,
                        requirement_type string,
                        requirement_description string,
                        createdDate string,
                        updatedDate string
                    )
                    """
                elif target_tablename == tablename_insufficient_requirement_master:
                    sql = fr"""
                    create table `{project_id}.{dataset_name}.{tablename_insufficient_requirement_master}` (
                        preID int64,
                        seqid int64,
                        company_id int64,
                        office_id int64,
                        requirement_type string,
                        requirement_description string,
                        suggestions_for_improvement string,
                        final_comment string,
                        createdDate string,
                        updatedDate string
                    )
                    """                
                else:
                    raise Exception(fr"Unknown target_tablename={target_tablename}.")
                
                client.query(sql).result()
                print(fr"NEWLY CREATED: {target_tablename}.")
            else:
                print(fr"ALREADY EXISTS: {target_tablename}.")


        sql = fr"""MERGE `{project_id}.{dataset_name}.{tablename_company_bid_judgement}` AS target
        USING (
            select
            a.preid,
            b.company_id,
            b.office_id
            from 
            `{project_id}.{dataset_name}.{tablename_announcements}` a
            cross join
            `{project_id}.{dataset_name}.{tablename_office_master}` b
            group by a.preid, b.company_id, b.office_id
        ) AS source
        ON 
        target.preid = source.preid and
        target.company_id = source.company_id and
        target.office_id = source.office_id
        when not matched then
        insert (
            preID,
            company_id,
            office_id,
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
            source.preid,
            source.company_id,
            source.office_id,
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
        client.query(sql).result()


        # check
        sql = fr"""
        SELECT * FROM `{project_id}.{dataset_name}.{tablename_company_bid_judgement}`
        """
        df = client.query(sql).result().to_dataframe()


        for index, row1 in df.iterrows():
            preID = row1["preID"]
            company_id = row1["company_id"]
            office_id = row1["office_id"]
            tmp_result = []
            if False:
                preID = 1
                company_id = 1
                office_id = 1

            sql = fr"""
            SELECT * FROM `{project_id}.{dataset_name}.{tablename_requirements}` where preID = {preID}
            """
            req_df = client.query(sql).result().to_dataframe()
            for jndex, row2 in req_df.iterrows():
                if False:
                    i = 0
                    row2 = req_df.iloc[i]

                requirement_type = row2["requirement_type"]
                requirement_text = row2["requirement_text"]
                seqid = row2["seqid"]

                requirementText = requirement_text
                companyNo = company_id
                officeNo = office_id
                

                if requirement_type == "欠格要件":
                    val = checkIneligibilityDynamic(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        company_data = pd.read_csv("data/master/company_master.txt",sep="\t"), 
                        office_registration_authorization_data=pd.read_csv("data/master/office_registration_authorization_master.txt",sep="\t")
                    )
                elif requirement_type == "業種・等級要件":
                    val = checkGradeAndItemRequirement(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        licenseData = pd.read_csv("data/master/office_registration_authorization_master.txt",sep="\t", converters={"construction_id": lambda x: str(x)}),
                        agencyData = pd.read_csv("data/master/agency_master.txt",sep="\t"),
                        constructionData = pd.read_csv("data/master/construction_master.txt",sep="\t")
                    )
                elif requirement_type == "所在地要件":
                    val = checkLocationRequirement(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        agencyData=pd.read_csv("data/master/agency_master.txt",sep="\t"),
                        officeData = pd.read_csv("data/master/office_master.txt",sep="\t")
                    )

                elif requirement_type == "実績要件":
                    val = checkExperienceRequirement(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        office_experience_data=pd.read_csv("data/master/office_work_achivements_master.txt",sep="\t"),
                        agency_data=pd.read_csv("data/master/agency_master.txt",sep="\t"), 
                        construction_data=pd.read_csv("data/master/construction_master.txt",sep="\t")
                    )
                elif requirement_type == "技術者要件":
                    val = checkTechnicianRequirement(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        employeeData=pd.read_csv("data/master/employee_master.txt", sep="\t"), 
                        qualData=pd.read_csv("data/master/employee_qualification_master.txt", sep="\t"), 
                        qualMasterData=pd.read_csv("data/master/technician_qualification_master.txt", sep="\t"),
                        expData = pd.read_csv("data/master/technician_experience_master.txt", sep="\t")
                    )
                else:
                    val = {"is_ok":False, "reason":"その他要件があります。確認してください"}

                
                tmp_result.append({
                    "announcement_id":preID,
                    "seqid":seqid,
                    "company_id":company_id,
                    "office_id":office_id,
                    "requirementType":requirement_type,
                    "is_ok":val["is_ok"],
                    "result":val["reason"]
                })

                if val["is_ok"]:
                    sql = fr"""MERGE `{project_id}.{dataset_name}.{tablename_sufficient_requirement_master}` AS target
                    USING (
                        select
                        {preID} as preid,
                        {seqid} as seqid,
                        {company_id} as company_id,
                        {office_id} as office_id,
                        '{requirement_type}' as requirement_type,
                        '{val["reason"]}' as requirement_description,
                        '' as createdDate,
                        '' as updatedDate
                    ) AS source
                    ON 
                    target.preid = source.preid and
                    target.seqid = source.seqid and
                    target.company_id = source.company_id and
                    target.office_id = source.office_id and
                    target.requirement_type = source.requirement_type
                    when not matched then
                    insert (
                        preID,
                        seqid,
                        company_id,
                        office_id,
                        requirement_type,
                        requirement_description,
                        createdDate,
                        updatedDate
                    )
                    values (
                        source.preID,
                        source.seqid,
                        source.company_id,
                        source.office_id,
                        source.requirement_type,
                        source.requirement_description,
                        source.createdDate,
                        source.updatedDate
                    )
                    """
                    
                else:
                    sql = fr"""MERGE `{project_id}.{dataset_name}.{tablename_insufficient_requirement_master}` AS target
                    USING (
                        select
                        {preID} as preid,
                        {seqid} as seqid,
                        {company_id} as company_id,
                        {office_id} as office_id,
                        '{requirement_type}' as requirement_type,
                        '{val["reason"]}' as requirement_description,
                        '' as suggestions_for_improvement,
                        '' as final_comment,
                        '' as createdDate,
                        '' as updatedDate
                    ) AS source
                    ON 
                    target.preid = source.preid and
                    target.seqid = source.seqid and
                    target.company_id = source.company_id and
                    target.office_id = source.office_id and
                    target.requirement_type = source.requirement_type
                    when not matched then
                    insert (
                        preID,
                        seqid,
                        company_id,
                        office_id,
                        requirement_type,
                        requirement_description,
                        suggestions_for_improvement,
                        final_comment,
                        createdDate,
                        updatedDate
                    )
                    values (
                        source.preID,
                        source.seqid,
                        source.company_id,
                        source.office_id,
                        source.requirement_type,
                        source.requirement_description,
                        source.suggestions_for_improvement,
                        source.final_comment,
                        source.createdDate,
                        source.updatedDate
                    )
                    """

                client.query(sql).result()


            tmp_result_df = pd.DataFrame(tmp_result)

            def summarize_result(tmp_result_df):
                checked_requirement = {
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
                    "createdDate":"",
                    "updatedDate":""
                }
                requirement_type_map = {
                    "欠格要件":"requirement_ineligibility",
                    "業種・等級要件":"requirement_grade_item",
                    "所在地要件":"requirement_location",
                    "実績要件":"requirement_experience",
                    "技術者要件":"requirement_technician"
                }

                is_ok_false = tmp_result_df[~tmp_result_df["is_ok"]]

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

                return checked_requirement

            checked_requirement = summarize_result(tmp_result_df=tmp_result_df)

            sql = fr"""MERGE `{project_id}.{dataset_name}.{tablename_company_bid_judgement}` AS target
            USING (
                select
                {preID} as preid,
                {company_id} as company_id,
                {office_id} as office_id,
                {checked_requirement["requirement_ineligibility"]} as requirement_ineligibility,
                {checked_requirement["requirement_grade_item"]} as requirement_grade_item,
                {checked_requirement["requirement_location"]} as requirement_location,
                {checked_requirement["requirement_experience"]} as requirement_experience,
                {checked_requirement["requirement_technician"]} as requirement_technician,
                {checked_requirement["requirement_other"]} as requirement_other,
                '{checked_requirement["deficit_requirement_message"]}' as deficit_requirement_message,
                {checked_requirement["final_status"]} as final_status,
                '{checked_requirement["message"]}' as message,
                '{checked_requirement["remarks"]}' as remarks,
                '{checked_requirement["createdDate"]}' as createdDate,
                '{checked_requirement["updatedDate"]}' as updatedDate
            ) AS source
            ON 
            target.preid = source.preid and
            target.company_id = source.company_id and
            target.office_id = source.office_id
            when matched then
            UPDATE SET
                target.requirement_ineligibility = source.requirement_ineligibility,
                target.requirement_grade_item = source.requirement_grade_item,
                target.requirement_location = source.requirement_location,
                target.requirement_experience = source.requirement_experience,
                target.requirement_technician = source.requirement_technician,
                target.requirement_other = source.requirement_other,
                target.deficit_requirement_message = source.deficit_requirement_message,
                target.final_status = source.final_status,
                target.message = source.message,
                target.remarks = source.remarks,
                target.createdDate = source.createdDate,
                target.updatedDate = source.updatedDate
            """

            client.query(sql).result()




class SQLITE3:
    def __init__(self, bid_announcements_pre_file, google_ai_studio_api_key_filepath=None, sqlite3_db_file_path=None, sql_connector=None):
        self.bid_announcements_pre_file = bid_announcements_pre_file
        self.google_ai_studio_api_key_filepath = google_ai_studio_api_key_filepath

        self.conn = sql_connector.conn
        self.cur = sql_connector.cur

    def select_to_table(self, tablename):
        conn = self.conn
        cur = self.cur
        sql = fr"select * from {tablename}"
        df = pd.read_sql_query(sql, conn)
        return df

    def any_query(self, sql):
        conn = self.conn
        cur = self.cur
        df = pd.read_sql_query(sql, conn)
        return df

    def step0_table_creation(self, bid_announcements_pre_file=None):
        if bid_announcements_pre_file is None:
            bid_announcements_pre_file = self.bid_announcements_pre_file

        conn = self.conn
        cur = self.cur

        tablename = "bid_announcements_pre"
            
        sql = """
        SELECT name FROM sqlite_master WHERE type='table'
        """
        df = pd.read_sql_query(sql, conn)
        df = df[df["name"] == tablename]
            
        if df.shape[0] == 1:
            sql = fr"""
            drop table {tablename}
            """
            cur.execute(sql)
        else:
            print(fr"TABLE Not exists: {tablename}")


        # データ用意
        df = pd.read_csv(bid_announcements_pre_file, sep="\t")
        df.to_sql(tablename, conn, if_exists="replace", index=False)

        # check
        sql = fr"""
        SELECT * FROM {tablename}
        """
        #val = client.query(sql).result().to_dataframe()
        val = pd.read_sql_query(sql, conn)

        print(val)



    def step1_transfer(self, remove_table=False):

        conn = self.conn
        cur = self.cur

        tablename_pre = "bid_announcements_pre"
        tablename_announcements = "bid_announcements"
        tablename_requirements = "bid_requirements"


        # テーブル 'bid_announcements' の存在確認。名前取得で検証。
        sql = """
        SELECT name FROM sqlite_master WHERE type='table'
        """
        tablename = pd.read_sql_query(sql, conn)
        tablename = tablename[tablename["name"] == tablename_announcements]

        # テーブルが存在するなら、削除オプションに応じて削除
        if tablename.shape[0] == 1:
            if remove_table:
                sql = fr"""
                drop table {tablename_announcements}
                """
                cur.execute(sql)
                print(fr"DELETE existing table: {tablename_announcements}.")
                # テーブル削除したので 0 行になるように変数更新
                tablename = tablename.iloc[0:0]

        if tablename.shape[0] == 0:
            # テーブルが無いなら作成
            sql = fr"""
            create table {tablename_announcements} (
            preID integer PRIMARY KEY,
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
            cur.execute(sql)
            # client.query(sql).result()
            print(fr"NEWLY CREATED: {tablename_announcements}.")
        else:
            print(fr"ALREADY EXISTS: {tablename_announcements}.")


        # 同様に bid_requirements 
        # テーブル 'bid_requirements' の存在確認。名前取得で検証。
        sql = """
        SELECT name FROM sqlite_master WHERE type='table'
        """
        tablename = pd.read_sql_query(sql, conn)
        tablename = tablename[tablename["name"] == tablename_requirements]

        # テーブルが存在するなら、削除オプションに応じて削除
        if tablename.shape[0] == 1:
            if remove_table:
                sql = fr"""
                drop table {tablename_requirements}
                """
                cur.execute(sql)
                print(fr"DELETE existing table: {tablename_requirements}.")
                # テーブル削除したので 0 行になるように変数更新
                tablename = tablename.iloc[0:0]

        if tablename.shape[0] == 0:
            # テーブルが無いなら作成
            sql = fr"""
            create table {tablename_requirements} (
            preID integer,
            seqid integer,
            requirement_type string,
            requirement_text string,
            done_judgement bool,
            createdDate string,
            updatedDate string,
            UNIQUE(preid, seqid, requirement_type)
            )
            """
            cur.execute(sql)
            # client.query(sql).result()
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
        sql = fr"""
        INSERT INTO {tablename_announcements} (
            preID,
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
            SELECT IFNULL(MAX(preID), 0) AS maxid FROM {tablename_announcements}
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
        FROM {tablename_pre} AS tbl_pre
        LEFT JOIN {tablename_announcements} AS tbl
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

        # FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP())
        # -> strftime('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP)
        cur.execute(sql)
        #client.query(sql).result()

        # check
        sql = fr"""
        SELECT * FROM {tablename_announcements}
        """
        #val = client.query(sql).result().to_dataframe()
        val = pd.read_sql_query(sql, conn)
        #print(val)


    def step2_ocr(self, ocr_utils):

        conn = self.conn
        cur = self.cur

        tablename_pre = "bid_announcements_pre"
        tablename_announcements = "bid_announcements"
        tmp_tablename_announcements = fr"tmp_{tablename_announcements}"
        tablename_requirements = "bid_requirements"
        tmp_tablename_requirements = fr"tmp_{tablename_requirements}"

        # OCR
        # doneOCRがFalseのものを対象にする。
        sql = fr"""
        SELECT * FROM {tablename_announcements}
        where doneOCR = FALSE
        """
        df1 = pd.read_sql_query(sql, conn)
        if False:
            sql = fr"""
            SELECT * FROM {tablename_announcements}
            """
            df1 = pd.read_sql_query(sql, conn)

        all_announcements = []
        all_requirement_texts = []
        for index, row in df1.iterrows():
            preID = row["preID"]
            print(f"Processing OCR for preID={preID}...")

            pdfurl = row["pdfUrl"]

            if not os.path.exists("data/ocr"):
                os.makedirs("data/ocr", exist_ok=True)

            ocr_announcements_file = fr"ocr_announcements_{preID}.json"
            ocr_announcements_filepath = fr"data/ocr/{ocr_announcements_file}"
            if not os.path.exists(ocr_announcements_filepath):
                print("   Trying ocr(announcements).")
                json_value = ocr_utils.getJsonFrompdfurl(pdfurl, preID=preID)
                new_json = ocr_utils.convertJson(json_value=json_value)
                with open(ocr_announcements_filepath, "w", encoding="utf-8") as f:
                    json.dump(new_json, f, ensure_ascii=False, indent=2)
            else:
                print("   Already getting announcements.")
                with open(ocr_announcements_filepath, "r", encoding="utf-8") as f:
                    new_json = json.load(f)


            ocr_requirements_file = fr"ocr_requirements_{preID}.json"
            ocr_requirements_filepath = fr"data/ocr/{ocr_requirements_file}"
            if not os.path.exists(ocr_requirements_filepath):
                print("   Trying ocr(requirements).")
                requirement_texts = ocr_utils.getRequirementText(pdfurl, preID=preID)
                dic = ocr_utils.convertRequirementTextDict(requirement_texts=requirement_texts)
                with open(ocr_requirements_filepath, "w", encoding="utf-8") as f:
                    json.dump(dic, f, ensure_ascii=False, indent=2)
            else:
                print("   Already getting requirements.")
                with open(ocr_requirements_filepath, "r", encoding="utf-8") as f:
                    dic = json.load(f)

            all_announcements.append(new_json)
            all_requirement_texts.append(pd.DataFrame(dic))


        ######################################
        # まずは bid_announcements を更新。   #
        ######################################

        df1 = pd.DataFrame(all_announcements)
        if df1.shape[0] > 0:
            df1.to_sql(tmp_tablename_announcements, conn, if_exists="replace", index=False)
            if False:
                sql = fr"""
                SELECT * FROM {tmp_tablename_announcements}
                """
                val = pd.read_sql_query(sql, conn)
                print(val)
            if False:
                sql = """
                SELECT * FROM bid_announcements
                """
                val_pre = pd.read_sql_query(sql, conn)
                print(val_pre)

            sql = fr"""insert into {tablename_announcements} (
                preID,
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
            preID,
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
            NULL,
            docdiststart,
            docdistend,
            submissionstart,
            submissionend,
            bidstartdate,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL
            from {tmp_tablename_announcements} source where true
            ON CONFLICT(preid) DO UPDATE SET
                preid = bid_announcements.preid,
                workname = bid_announcements.workname,
                userAnnNo = bid_announcements.userannno,
                topAgencyNo = bid_announcements.topagencyno,
                topAgencyName = bid_announcements.topagencyname,
                subAgencyNo = bid_announcements.subagencyno,
                subAgencyName = bid_announcements.subagencyname,
                workplace = excluded.workplace,
                pdfUrl = bid_announcements.pdfurl,
                zipcode = excluded.zipcode,
                address = excluded.address,
                department = excluded.department,
                assigneename = excluded.assigneename,
                telephone = excluded.telephone,
                fax = excluded.fax,
                mail = excluded.mail,
                publishDate = bid_announcements.publishDate,
                docdiststart = excluded.docdiststart,
                docdistend = excluded.docdistend,
                submissionstart = excluded.submissionstart,
                submissionend = excluded.submissionend,
                bidstartdate = excluded.bidstartdate,
                bidEndDate = bid_announcements.bidenddate,
                doneocr = TRUE,
                remarks = bid_announcements.remarks, 
                createdDate = bid_announcements.createddate,
                updatedDate = bid_announcements.updateddate
            """
            cur.execute(sql)

        # 中間テーブル削除
        cur.execute(fr"DROP TABLE IF EXISTS {tmp_tablename_announcements}")


        ######################################
        # bid_requirements を更新。           #
        ######################################

        if all_requirement_texts != []:
            df2 = pd.concat(all_requirement_texts, ignore_index=True)
            df2.to_sql(tmp_tablename_requirements, conn, if_exists="replace", index=False)


            sql = fr"""insert into {tablename_requirements} (
                preID,
                seqid,
                requirement_type,
                requirement_text,
                done_judgement,
                createdDate,
                updatedDate
            )
            select 
            preID,
            seqid,
            requirement_type,
            requirement_text,
            0,
            createdDate,
            updatedDate
            from {tmp_tablename_requirements} source where true
            ON CONFLICT(preid, seqid, requirement_type) DO UPDATE SET
                preid = excluded.preid,
                seqid = excluded.seqid,
                requirement_type = excluded.requirement_type,
                requirement_text = excluded.requirement_text,
                createdDate = excluded.createddate,
                updatedDate = excluded.updateddate
            """
            cur.execute(sql)

        cur.execute(fr"DROP TABLE IF EXISTS {tmp_tablename_requirements}")

    def step3(self, remove_table=False):
        conn = self.conn
        cur = self.cur

        tablename_pre = "bid_announcements_pre"
        tablename_announcements = "bid_announcements"
        tmp_tablename_announcements = fr"tmp_{tablename_announcements}"
        tablename_requirements = "bid_requirements"
        tmp_tablename_requirements = fr"tmp_{tablename_requirements}"
        tablename_company_bid_judgement = "company_bid_judgement"

        tablename_office_master = "office_master"


        tablename_sufficient_requirement_master = "sufficient_requirements"
        tablename_insufficient_requirement_master = "insufficient_requirements"






        tablenames = [
            tablename_company_bid_judgement, 
            tablename_sufficient_requirement_master,
            tablename_insufficient_requirement_master
        ]
        target_tablename = tablenames[0]
        for i, target_tablename in enumerate(tablenames):

            sql = """
            SELECT name FROM sqlite_master WHERE type='table'
            """
            tablename = pd.read_sql_query(sql, conn)
            tablename = tablename[tablename["name"] == target_tablename]

            if tablename.shape[0] == 1:
                if remove_table:
                    sql = fr"""
                    drop table {target_tablename}
                    """
                    cur.execute(sql)
                    print(fr"DELETE existing table: {target_tablename}.")
                    tablename = tablename.iloc[0:0]

            if tablename.shape[0] == 0:
                if target_tablename == tablename_company_bid_judgement:
                    sql = fr"""
                    create table {target_tablename} (
                        preID int64,
                        company_id int64,
                        office_id int64,
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
                        unique(preID, company_id, office_id)
                    )
                    """
                elif target_tablename == tablename_sufficient_requirement_master:
                    sql = fr"""
                    create table {target_tablename} (
                        preID int64,
                        seqid int64,
                        company_id int64,
                        office_id int64,
                        requirement_type string,
                        requirement_description string,
                        createdDate string,
                        updatedDate string,
                        unique(preID, seqid, company_id, office_id, requirement_type)
                    )
                    """
                elif target_tablename == tablename_insufficient_requirement_master:
                    sql = fr"""
                    create table {target_tablename} (
                        preID int64,
                        seqid int64,
                        company_id int64,
                        office_id int64,
                        requirement_type string,
                        requirement_description string,
                        suggestions_for_improvement string,
                        final_comment string,
                        createdDate string,
                        updatedDate string,
                        unique(preID, seqid, company_id, office_id, requirement_type)
                    )
                    """                
                else:
                    raise Exception(fr"Unknown target_tablename={target_tablename}.")
                
                cur.execute(sql)
                print(fr"NEWLY CREATED: {target_tablename}.")
            else:
                print(fr"ALREADY EXISTS: {target_tablename}.")




        sql = fr"""insert into {tablename_company_bid_judgement} (
            preID,
            company_id,
            office_id,
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
        a.preID,
        b.company_id,
        b.office_id,
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
        from {tablename_announcements} as a 
        cross join 
        {tablename_office_master} as b
        where true
        ON CONFLICT(preID, company_id, office_id) DO NOTHING
        """
        cur.execute(sql)


        # check
        sql = fr"""
        SELECT * FROM {tablename_company_bid_judgement}
        """
        #val = client.query(sql).result().to_dataframe()
        df = pd.read_sql_query(sql, conn)


        for index, row1 in df.iterrows():
            preID = row1["preID"]
            company_id = row1["company_id"]
            office_id = row1["office_id"]
            tmp_result = []
            if False:
                preID = 1
                company_id = 1
                office_id = 1

            sql = fr"""
            SELECT * FROM {tablename_requirements} where preID = {preID}
            """


            req_df = pd.read_sql_query(sql, conn)
            for jndex, row2 in req_df.iterrows():
                if False:
                    i = 0
                    row2 = req_df.iloc[i]

                requirement_type = row2["requirement_type"]
                requirement_text = row2["requirement_text"]
                seqid = row2["seqid"]

                requirementText = requirement_text
                companyNo = company_id
                officeNo = office_id
                    
                if requirement_type == "欠格要件":
                    val = checkIneligibilityDynamic(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        company_data = pd.read_csv("data/master/company_master.txt",sep="\t"), 
                        office_registration_authorization_data=pd.read_csv("data/master/office_registration_authorization_master.txt",sep="\t")
                    )
                elif requirement_type == "業種・等級要件":
                    val = checkGradeAndItemRequirement(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        licenseData = pd.read_csv("data/master/office_registration_authorization_master.txt",sep="\t", converters={"construction_id": lambda x: str(x)}),
                        agencyData = pd.read_csv("data/master/agency_master.txt",sep="\t"),
                        constructionData = pd.read_csv("data/master/construction_master.txt",sep="\t")
                    )
                elif requirement_type == "所在地要件":
                    val = checkLocationRequirement(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        agencyData=pd.read_csv("data/master/agency_master.txt",sep="\t"),
                        officeData = pd.read_csv("data/master/office_master.txt",sep="\t")
                    )

                elif requirement_type == "実績要件":
                    val = checkExperienceRequirement(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        office_experience_data=pd.read_csv("data/master/office_work_achivements_master.txt",sep="\t"),
                        agency_data=pd.read_csv("data/master/agency_master.txt",sep="\t"), 
                        construction_data=pd.read_csv("data/master/construction_master.txt",sep="\t")
                    )
                elif requirement_type == "技術者要件":
                    val = checkTechnicianRequirement(
                        requirementText=requirement_text, 
                        companyNo=company_id, 
                        officeNo=office_id,
                        employeeData=pd.read_csv("data/master/employee_master.txt", sep="\t"), 
                        qualData=pd.read_csv("data/master/employee_qualification_master.txt", sep="\t"), 
                        qualMasterData=pd.read_csv("data/master/technician_qualification_master.txt", sep="\t"),
                        expData = pd.read_csv("data/master/technician_experience_master.txt", sep="\t")
                    )
                else:
                    val = {"is_ok":False, "reason":"その他要件があります。確認してください"}
                
                tmp_result.append({
                    "announcement_id":preID,
                    "seqid":seqid,
                    "company_id":company_id,
                    "office_id":office_id,
                    "requirementType":requirement_type,
                    "is_ok":val["is_ok"],
                    "result":val["reason"]
                })


                if val["is_ok"]:
                    sql = fr"""insert into {tablename_sufficient_requirement_master} (
                        preID,
                        seqid,
                        company_id,
                        office_id,
                        requirement_type,
                        requirement_description,
                        createdDate,
                        updatedDate
                    ) values (
                        {preID},
                        {seqid},
                        {company_id},
                        {office_id},
                        '{requirement_type}',
                        '{val["reason"]}',
                        '',
                        ''
                    )
                    ON CONFLICT(preID, seqid, company_id, office_id, requirement_type) DO UPDATE SET
                        preid = preid,
                        seqid = seqid,
                        company_id = company_id,
                        office_id = office_id,
                        requirement_type = excluded.requirement_type,
                        requirement_description = excluded.requirement_description,
                        createdDate = excluded.createdDate,
                        updatedDate = excluded.updatedDate
                    """
                else:
                    sql = fr"""insert into {tablename_insufficient_requirement_master} (
                        preID,
                        seqid,
                        company_id,
                        office_id,
                        requirement_type,
                        requirement_description,
                        suggestions_for_improvement,
                        final_comment,
                        createdDate,
                        updatedDate
                    ) values (
                        {preID},
                        {seqid},
                        {company_id},
                        {office_id},
                        '{requirement_type}',
                        '{val["reason"]}',
                        '',
                        '',
                        '',
                        ''
                    )
                    ON CONFLICT(preID, seqid, company_id, office_id, requirement_type) DO UPDATE SET
                        preid = preid,
                        seqid = seqid,
                        company_id = company_id,
                        office_id = office_id,
                        requirement_type = excluded.requirement_type,
                        requirement_description = excluded.requirement_description,
                        suggestions_for_improvement = excluded.suggestions_for_improvement,
                        final_comment = excluded.final_comment,
                        createdDate = excluded.createdDate,
                        updatedDate = excluded.updatedDate
                    """

                cur.execute(sql)


            tmp_result_df = pd.DataFrame(tmp_result)

            def summarize_result(tmp_result_df):
                checked_requirement = {
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
                    "createdDate":"",
                    "updatedDate":""
                }
                requirement_type_map = {
                    "欠格要件":"requirement_ineligibility",
                    "業種・等級要件":"requirement_grade_item",
                    "所在地要件":"requirement_location",
                    "実績要件":"requirement_experience",
                    "技術者要件":"requirement_technician"
                }

                is_ok_false = tmp_result_df[~tmp_result_df["is_ok"]]

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

                return checked_requirement

            checked_requirement = summarize_result(tmp_result_df=tmp_result_df)

            sql = fr"""insert into {tablename_company_bid_judgement} (
                preID,
                company_id,
                office_id,
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
            ) values (
                {preID},
                {company_id},
                {office_id},
                {checked_requirement["requirement_ineligibility"]},
                {checked_requirement["requirement_grade_item"]},
                {checked_requirement["requirement_location"]},
                {checked_requirement["requirement_experience"]},
                {checked_requirement["requirement_technician"]},
                {checked_requirement["requirement_other"]},
                '{checked_requirement["deficit_requirement_message"]}',
                {checked_requirement["final_status"]},
                '{checked_requirement["message"]}',
                '{checked_requirement["remarks"]}',
                '{checked_requirement["createdDate"]}',
                '{checked_requirement["updatedDate"]}'
            )
            ON CONFLICT(preID, company_id, office_id) DO UPDATE SET
                preid = preid,
                company_id = company_id,
                office_id = office_id,
                requirement_ineligibility = excluded.requirement_ineligibility,
                requirement_grade_item = excluded.requirement_grade_item,
                requirement_location = excluded.requirement_location,
                requirement_experience = excluded.requirement_experience,
                requirement_technician = excluded.requirement_technician,
                requirement_other = excluded.requirement_other,
                deficit_requirement_message = excluded.deficit_requirement_message,
                final_status = excluded.final_status,
                message = excluded.message,
                remarks = excluded.remarks,
                createdDate = excluded.createdDate,
                updatedDate = excluded.updatedDate
            """
            cur.execute(sql)






if __name__ == "__main__":
    # GCP bigquery想定
    # google ai studio に接続しなくてよいなら  --google_ai_studio_api_key_filepath 無しでよい。
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --bigquery_location SPECIFY_LOCATION --bigquery_project_id SPECIFY_PROJECT_ID --bigquery_dataset_name SPECIFY_DATASET_NAME --use_gcp_vm
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --bigquery_location "asia-northeast1" --bigquery_project_id vocal-raceway-473509-f1 --bigquery_dataset_name October_20251004 --use_gcp_vm
    # 
    # sqlite3想定
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --sqlite3_db_file_path data/example.db
    # python -i source/bid_announcement_judgement_tools/main.py --stop_processing

    parser = argparse.ArgumentParser(description="")
    parser.add_argument("--use_gcp_vm", action="store_true")
    parser.add_argument("--bid_announcements_pre_file")
    parser.add_argument("--google_ai_studio_api_key_filepath")
    parser.add_argument("--stop_processing", action="store_true")

    parser.add_argument("--sqlite3_db_file_path", default=None)

    parser.add_argument("--bigquery_location", default=None)
    parser.add_argument("--bigquery_project_id", default=None)
    parser.add_argument("--bigquery_dataset_name", default=None)

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
    except:
        bid_announcements_pre_file = "data/bid_announcements_pre/bid_announcements_pre_1.txt"
        use_bigquery = False
        stop_processing = True

    if bid_announcements_pre_file is None:
        bid_announcements_pre_file = "data/bid_announcements_pre/bid_announcements_pre_1.txt"
        print(fr"Set bid_announcements_pre_file = {bid_announcements_pre_file}")

    
    sql_connector = SQLConnector(
        sqlite3_db_file_path=sqlite3_db_file_path,
        bigquery_location=bigquery_location,
        bigquery_project_id=bigquery_project_id,
        bigquery_dataset_name=bigquery_dataset_name
    )

    master = Master(sql_connector=sql_connector)




    if use_gcp_vm:
        obj = GCPVM(
            bid_announcements_pre_file=bid_announcements_pre_file,
            google_ai_studio_api_key_filepath=google_ai_studio_api_key_filepath,
            sql_connector=sql_connector
        )
        master.uploadOfficeMaster(tablename="office_master",dbtype="bigquery")
        # obj.select_to_table(tablename="vocal-raceway-473509-f1.October_20251004.office_master")
    else:
        obj = SQLITE3(
            bid_announcements_pre_file=bid_announcements_pre_file,
            google_ai_studio_api_key_filepath=google_ai_studio_api_key_filepath,
            sql_connector=sql_connector
        )
        master.uploadOfficeMaster(tablename="office_master",dbtype="sqlite3")
        # obj.select_to_table(tablename="office_master")

    if stop_processing:
        exit(1)


    obj.step0_table_creation(bid_announcements_pre_file=bid_announcements_pre_file)
    obj.step1_transfer(remove_table=False)
    obj.step2_ocr(ocr_utils = OCRutils(google_ai_studio_api_key_filepath=google_ai_studio_api_key_filepath))
    obj.step3(remove_table=True)


    # obj.select_to_table(tablename="bid_announcements_pre")
    # obj.select_to_table(tablename="bid_announcements")
    # obj.select_to_table(tablename="bid_requirements")
    # obj.select_to_table(tablename="sufficient_requirements")
    # obj.select_to_table(tablename="insufficient_requirements")
    # obj.select_to_table(tablename="company_bid_judgement")
    # obj.any_query(sql = "SELECT name FROM sqlite_master WHERE type='table'")

    # obj.select_to_table(tablename="vocal-raceway-473509-f1.October_20251004.bid_announcements_pre")
    # obj.select_to_table(tablename="vocal-raceway-473509-f1.October_20251004.bid_announcements")
    # obj.select_to_table(tablename="vocal-raceway-473509-f1.October_20251004.bid_requirements")
    # obj.select_to_table(tablename="vocal-raceway-473509-f1.October_20251004.sufficient_requirements")
    # obj.select_to_table(tablename="vocal-raceway-473509-f1.October_20251004.insufficient_requirements")
    # obj.select_to_table(tablename="vocal-raceway-473509-f1.October_20251004.company_bid_judgement")
    # obj.any_query(sql = fr"SELECT table_name FROM `{bigquery_project_id}.{bigquery_dataset_name}.INFORMATION_SCHEMA.TABLES`")

