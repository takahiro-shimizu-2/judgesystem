#coding: utf-8

import sqlite3  # sqlite3使わない想定でもimport
import os
import argparse
import re
import json
import time
from dataclasses import dataclass
from abc import ABC, abstractmethod

import pandas as pd
import numpy as np
from google import genai # For OCR
from google.genai.errors import ClientError
from google.genai import types
import httpx

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

    def __init__(self):

        master_dict = {
            "agency_master":"data/master/agency_master.txt",
            "company_master":"data/master/company_master.txt",
            "construction_master":"data/master/construction_master.txt",
            "employee_master":"data/master/employee_master.txt",
            "employee_qualification_master":"data/master/employee_qualification_master.txt",
            "employee_experience_master":"data/master/employee_experience_master.txt",
            "office_master":"data/master/office_master.txt",
            "office_registration_authorization_master":"data/master/office_registration_authorization_master.txt",
            "office_work_achivements_master":"data/master/office_work_achivements_master.txt",
            "technician_qualification_master":"data/master/technician_qualification_master.txt"
        }

        for key, val in master_dict.items():
            setattr(self, key, val)

    def getAgencyMaster(self):
        return pd.read_csv(self.agency_master, sep="\t")
    
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
    bid_announcements_pre: str = "bid_announcements_pre"
    bid_announcements: str = "bid_announcements"
    bid_requirements: str = "bid_requirements"
    company_bid_judgement: str = "company_bid_judgement"
    sufficient_requirements: str = "sufficient_requirements"
    insufficient_requirements: str = "insufficient_requirements"
    office_master: str = "office_master"


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

    def getPDFDataFromUrl(self, pdfurl):
        # Retrieve and encode the PDF byte
        doc_data = httpx.get(pdfurl).content
        return doc_data

    def getJsonFromDocData(self, doc_data):
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
        return dict1

    def convertJson(self, json_value):
        def _modifyDate(datestr):
            m = re.search(r"令和\s*(\d+)年\s*(\d+)月\s*(\d+)日", datestr)
            if m:
                return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"
            return datestr

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


    def getRequirementText(self, doc_data):
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
        ])
        # print(response.text)
        text=response.text
        #json_text = extract_json(text=response.text)
        text2 = text.replace('\n', '').replace('```json', '').replace("```","")
        dict1 = json.loads(text2)
        return dict1

    def convertRequirementTextDict(self, requirement_texts):
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
                    createdDate_list.append("")
                    updatedDate_list.append("")
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
    def uploadDataToTable(self, data, tablename):
        raise NotImplementedError

    @abstractmethod
    def selectToTable(self, tablename, where_clause=""):
        raise NotImplementedError

    @abstractmethod
    def createBidAnnouncements(self, bid_announcements_tablename):
        raise NotImplementedError
    
    @abstractmethod
    def createBidRequirements(self, bid_requirements_tablename):
        raise NotImplementedError

    @abstractmethod
    def transferAnnouncements(self, bid_announcements_tablename, bid_announcements_pre_tablename):
        raise NotImplementedError

    @abstractmethod
    def updateAnnouncements(self, bid_announcements_tablename, bid_announcements_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def updateRequirements(self, bid_requirements_tablename, bid_requirements_tablename_for_update):
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
    def updateCompanyBidJudgement(self, company_bid_judgement_tablename, company_bid_judgement_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        raise NotImplementedError

    @abstractmethod
    def updateInsufficientRequirements(self, insufficient_requirements_tablename, insufficient_requirements_tablename_for_update):
        raise NotImplementedError

class DBOperatorGCPVM(DBOperator):

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

    def uploadDataToTable(self, data, tablename):
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
            target.docdiststart = source.docdiststart,
            target.docdistend = source.docdistend,
            target.submissionstart = source.submissionstart,
            target.submissionend = source.submissionend,
            target.bidstartdate = source.bidstartdate,
            target.doneocr = TRUE
        """        
        self.client.query(sql).result()

    def updateRequirements(self, bid_requirements_tablename, bid_requirements_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{bid_requirements_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{bid_requirements_tablename_for_update}` AS source
        ON target.announcement_no = source.announcement_no
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
            source.createdDate,
            source.updatedDate
        )
        """
        self.client.query(sql).result()

    def createCompanyBidJudgements(self, company_bid_judgement_tablename):
        sql = fr"""
        create table `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename}` (
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

    def updateCompanyBidJudgement(self, company_bid_judgement_tablename, company_bid_judgement_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{company_bid_judgement_tablename_for_update}` AS source
        ON 
        target.announcement_no = source.announcement_no and
        target.company_no = source.company_no and
        target.office_no = source.office_no
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
        self.client.query(sql).result()

    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{sufficient_requirements_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{sufficient_requirements_tablename_for_update}` AS source
        ON 
        target.announcement_no = source.announcement_no and
        target.requirement_no = source.requirement_no and
        target.company_no = source.company_no and
        target.office_no = source.office_no and
        target.requirement_type = source.requirement_type
        when not matched then
        insert (
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
            source.announcement_no,
            source.requirement_no,
            source.company_no,
            source.office_no,
            source.requirement_type,
            source.requirement_description,
            source.createdDate,
            source.updatedDate
        )
        """
        self.client.query(sql).result()

    def updateInsufficientRequirements(self, insufficient_requirements_tablename, insufficient_requirements_tablename_for_update):
        sql = fr"""MERGE `{self.project_id}.{self.dataset_name}.{insufficient_requirements_tablename}` AS target
        USING `{self.project_id}.{self.dataset_name}.{insufficient_requirements_tablename_for_update}` AS source
        ON 
        target.announcement_no = source.announcement_no and
        target.requirement_no = source.requirement_no and
        target.company_no = source.company_no and
        target.office_no = source.office_no and
        target.requirement_type = source.requirement_type
        WHEN NOT MATCHED THEN
        INSERT (
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
            source.announcement_no,
            source.requirement_no,
            source.company_no,
            source.office_no,
            source.requirement_type,
            source.requirement_description,
            source.suggestions_for_improvement,
            source.final_comment,
            source.createdDate,
            source.updatedDate
        )
        """
        self.client.query(sql).result()

class DBOperatorSQLITE3(DBOperator):

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

    def uploadDataToTable(self, data, tablename):
        data.to_sql(tablename, self.conn, if_exists="replace", index=False)

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
            publishDate = {bid_announcements_tablename}.publishDate,
            docdiststart = excluded.docdiststart,
            docdistend = excluded.docdistend,
            submissionstart = excluded.submissionstart,
            submissionend = excluded.submissionend,
            bidstartdate = excluded.bidstartdate,
            bidEndDate = {bid_announcements_tablename}.bidenddate,
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


    def createCompanyBidJudgements(self, company_bid_judgement_tablename):
        sql = fr"""
        create table {company_bid_judgement_tablename} (
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
            unique(announcement_no, company_no, office_no)
        )
        """
        self.cur.execute(sql)

    def createSufficientRequirements(self, sufficient_requirements_tablename):
        sql = fr"""
        create table {sufficient_requirements_tablename} (
            announcement_no integer,
            requirement_no integer,
            company_no integer,
            office_no integer,
            requirement_type string,
            requirement_description string,
            createdDate string,
            updatedDate string,
            unique(announcement_no, requirement_no, company_no, office_no, requirement_type)
        )
        """
        self.cur.execute(sql)

    def createInsufficientRequirements(self, insufficient_requirements_tablename):
        sql = fr"""
        create table {insufficient_requirements_tablename} (
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
            unique(announcement_no, requirement_no, company_no, office_no, requirement_type)
        )
        """                
        self.cur.execute(sql)

    def preupdateCompanyBidJudgement(self, company_bid_judgement_tablename, office_master_tablename, bid_announcements_tablename):
        sql = fr"""insert into {company_bid_judgement_tablename} (
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
        ON CONFLICT(announcement_no, company_no, office_no) DO NOTHING
        """
        self.cur.execute(sql)

    def updateCompanyBidJudgement(self, company_bid_judgement_tablename, company_bid_judgement_tablename_for_update):
        sql = fr"""insert into {company_bid_judgement_tablename} (
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
        ON CONFLICT(announcement_no, company_no, office_no) DO UPDATE SET
            announcement_no = {company_bid_judgement_tablename}.announcement_no,
            company_no = {company_bid_judgement_tablename}.company_no,
            office_no = {company_bid_judgement_tablename}.office_no,
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
        self.cur.execute(sql)

    def updateSufficientRequirements(self, sufficient_requirements_tablename, sufficient_requirements_tablename_for_update):
        sql = fr"""insert into {sufficient_requirements_tablename} (
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
            announcement_no,
            requirement_no,
            company_no,
            office_no,
            requirement_type,
            requirement_description,
            createdDate,
            updatedDate                    
        from {sufficient_requirements_tablename_for_update} where true
        ON CONFLICT(announcement_no, requirement_no, company_no, office_no, requirement_type) DO UPDATE SET
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
        ON CONFLICT(announcement_no, requirement_no, company_no, office_no, requirement_type) DO UPDATE SET
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


class BidJudgementSan:
    def __init__(self, bid_announcements_pre_file, tablenamesconfig=None, db_operator=None):
        self.bid_announcements_pre_file = bid_announcements_pre_file
        self.tablenamesconfig = tablenamesconfig
        self.db_operator=db_operator


    def step0_create_bid_announcements_pre(self, bid_announcements_pre_file=None):
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
        db_operator.transferAnnouncements(bid_announcements_tablename=tablename_announcements, bid_announcements_pre_tablename=tablename_pre)
        # check
        # val = db_operator.selectToTable(tablename=tablename)


    def step2_ocr(self, ocr_utils):

        tablename_announcements = self.tablenamesconfig.bid_announcements
        tmp_tablename_announcements = fr"tmp_{tablename_announcements}"
        tablename_requirements = self.tablenamesconfig.bid_requirements
        tmp_tablename_requirements = fr"tmp_{tablename_requirements}"
        db_operator = self.db_operator

        # OCR
        # doneOCRがFalseのものを対象にする。
        df1 = db_operator.selectToTable(tablename=fr"{tablename_announcements}", where_clause="where doneOCR = FALSE order by announcement_no")
        if False:
            df1 = db_operator.selectToTable(tablename=fr"{tablename_announcements}")

        all_announcements = []
        all_requirement_texts = []
        for index, row in df1.iterrows():
            announcement_no = row["announcement_no"]
            print(f"Processing OCR for announcement_no={announcement_no}...")

            pdfurl = row["pdfUrl"]
            if False:
                announcement_no = int(df1["announcement_no"][11])
                pdfurl = df1["pdfUrl"][11]

            if not os.path.exists("data/ocr"):
                os.makedirs("data/ocr", exist_ok=True)

            if not os.path.exists("data/pdf"):
                os.makedirs("data/pdf", exist_ok=True)

            time.sleep(1)
            doc_data = ocr_utils.getPDFDataFromUrl(pdfurl)
            if not os.path.exists(fr"data/pdf/{announcement_no}.pdf"):
                # 基本的には元の pdf と同じものを保存できる。
                print(fr"   Save data/pdf/{announcement_no}.pdf.")
                with open(fr"data/pdf/{announcement_no}.pdf", "wb") as f:
                    f.write(doc_data)

            try:
                # ocr for announcements
                ocr_announcements_file = fr"ocr_announcements_{announcement_no}.json"
                ocr_announcements_filepath = fr"data/ocr/{ocr_announcements_file}"
                if not os.path.exists(ocr_announcements_filepath):
                    print("   Trying ocr(announcements).")
                    json_value = ocr_utils.getJsonFromDocData(doc_data=doc_data)
                    json_value["announcement_no"] = announcement_no
                    with open(ocr_announcements_filepath, "w", encoding="utf-8") as f:
                        json.dump(json_value, f, ensure_ascii=False, indent=2)
                else:
                    print("   Already getting announcements.")
                    with open(ocr_announcements_filepath, "r", encoding="utf-8") as f:
                        json_value = json.load(f)
                new_json = ocr_utils.convertJson(json_value=json_value)

                # ocr for requirements
                ocr_requirements_file = fr"ocr_requirements_{announcement_no}.json"
                ocr_requirements_filepath = fr"data/ocr/{ocr_requirements_file}"
                if not os.path.exists(ocr_requirements_filepath):
                    print("   Trying ocr(requirements).")
                    requirement_texts = ocr_utils.getRequirementText(doc_data=doc_data)
                    requirement_texts["announcement_no"] = announcement_no
                    with open(ocr_requirements_filepath, "w", encoding="utf-8") as f:
                        json.dump(requirement_texts, f, ensure_ascii=False, indent=2)
                else:
                    print("   Already getting requirements.")
                    with open(ocr_requirements_filepath, "r", encoding="utf-8") as f:
                        requirement_texts = json.load(f)
                dic = ocr_utils.convertRequirementTextDict(requirement_texts=requirement_texts)

                all_announcements.append(new_json)
                all_requirement_texts.append(pd.DataFrame(dic))
            except ClientError as e:
                print(e)
                break


        ######################################
        # まずは bid_announcements を更新。   #
        ######################################

        df1 = pd.DataFrame(all_announcements)
        if df1.shape[0] > 0:
            print(fr"Upload {tmp_tablename_announcements}")
            db_operator.uploadDataToTable(data=df1, tablename=tmp_tablename_announcements)

            if False:
                val = db_operator.selectToTable(tablename=tmp_tablename_announcements)
                print(val)
            if False:
                val_pre = db_operator.selectToTable(tablename=tablename_announcements)
                print(val_pre)

            db_operator.updateAnnouncements(bid_announcements_tablename=tablename_announcements, bid_announcements_tablename_for_update=tmp_tablename_announcements)

        # 中間テーブル削除
        db_operator.dropTable(tablename=tmp_tablename_announcements)

        ######################################
        # bid_requirements を更新。           #
        ######################################

        if all_requirement_texts != []:
            df2 = pd.concat(all_requirement_texts, ignore_index=True)
            print(fr"Upload {tmp_tablename_requirements}")
            db_operator.uploadDataToTable(data=df2, tablename=tmp_tablename_requirements)
            db_operator.updateRequirements(bid_requirements_tablename=tablename_requirements, bid_requirements_tablename_for_update=tmp_tablename_requirements)

        # 中間テーブル削除
        db_operator.dropTable(tablename=tmp_tablename_requirements)

    def step3(self, remove_table=False):

        tablename_announcements = self.tablenamesconfig.bid_announcements
        tablename_requirements = self.tablenamesconfig.bid_requirements
        tablename_company_bid_judgement = self.tablenamesconfig.company_bid_judgement

        tablename_office_master = self.tablenamesconfig.office_master

        tablename_sufficient_requirement_master = self.tablenamesconfig.sufficient_requirements
        tablename_insufficient_requirement_master = self.tablenamesconfig.insufficient_requirements

        db_operator = self.db_operator





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


        # office_master テーブルを作成
        tmp_office_master = pd.read_csv("data/master/office_master.txt",sep="\t")
        print(fr"Upload {tablename_office_master}")
        db_operator.uploadDataToTable(data=tmp_office_master, tablename=tablename_office_master)


        db_operator.preupdateCompanyBidJudgement(
            company_bid_judgement_tablename=tablename_company_bid_judgement, 
            office_master_tablename=tablename_office_master, 
            bid_announcements_tablename=tablename_announcements
        )

        # check
        df0 = db_operator.selectToTable(tablename=fr"{tablename_company_bid_judgement}", where_clause="where final_status is NULL")
        print(fr"Target of checking requirement : {df0.shape[0]}")

        # 部分的に(chunk_sizeごとに)実行。
        chunk_size = 1000
        for start in range(0, len(df0), chunk_size):
            df = df0.iloc[start:start+chunk_size]
            result_judgement_list = []
            result_sufficient_requirements_list = []
            result_insufficient_requirements_list = []
            for index, row1 in df.iterrows():
                announcement_no = row1["announcement_no"]
                company_no = row1["company_no"]
                office_no = row1["office_no"]
                tmp_result_judgement_list = []
                if False:
                    announcement_no = int(df["announcement_no"][0])
                    company_no = int(df["company_no"][0])
                    office_no = int(df["office_no"][0])

                req_df = db_operator.selectToTable(tablename=fr"{tablename_requirements}", where_clause=fr"where announcement_no = {announcement_no}")
                if req_df.shape[0] == 0:
                    print(fr"announcement_no={announcement_no}: No requirement found. Skip anyway.")
                    continue

                for jndex, row2 in req_df.iterrows():
                    if False:
                        i = 0
                        row2 = req_df.iloc[i]

                    requirement_type = row2["requirement_type"]
                    requirement_text = row2["requirement_text"]
                    requirement_no = row2["requirement_no"]

                    requirementText = requirement_text
                    companyNo = company_no
                    officeNo = office_no
                    
                    if requirement_type == "欠格要件":
                        val = checkIneligibilityDynamic(
                            requirementText=requirement_text, 
                            companyNo=company_no, 
                            officeNo=office_no,
                            company_data = pd.read_csv("data/master/company_master.txt",sep="\t"), 
                            office_registration_authorization_data=pd.read_csv("data/master/office_registration_authorization_master.txt",sep="\t")
                        )
                    elif requirement_type == "業種・等級要件":
                        val = checkGradeAndItemRequirement(
                            requirementText=requirement_text, 
                            officeNo=office_no,
                            licenseData = pd.read_csv("data/master/office_registration_authorization_master.txt",sep="\t", converters={"construction_no": lambda x: str(x)}),
                            agencyData = pd.read_csv("data/master/agency_master.txt",sep="\t"),
                            constructionData = pd.read_csv("data/master/construction_master.txt",sep="\t")
                        )
                    elif requirement_type == "所在地要件":
                        val = checkLocationRequirement(
                            requirementText=requirement_text, 
                            officeNo=office_no,
                            agencyData=pd.read_csv("data/master/agency_master.txt",sep="\t"),
                            officeData = pd.read_csv("data/master/office_master.txt",sep="\t")
                        )

                    elif requirement_type == "実績要件":
                        val = checkExperienceRequirement(
                            requirementText=requirement_text, 
                            officeNo=office_no,
                            office_experience_data=pd.read_csv("data/master/office_work_achivements_master.txt",sep="\t"),
                            agency_data=pd.read_csv("data/master/agency_master.txt",sep="\t"), 
                            construction_data=pd.read_csv("data/master/construction_master.txt",sep="\t")
                        )
                    elif requirement_type == "技術者要件":
                        val = checkTechnicianRequirement(
                            requirementText=requirement_text, 
                            companyNo=company_no, 
                            officeNo=office_no,
                            employeeData=pd.read_csv("data/master/employee_master.txt", sep="\t"), 
                            qualData=pd.read_csv("data/master/employee_qualification_master.txt", sep="\t"), 
                            qualMasterData=pd.read_csv("data/master/technician_qualification_master.txt", sep="\t"),
                            expData = pd.read_csv("data/master/employee_experience_master.txt", sep="\t")
                        )
                    else:
                        val = {"is_ok":False, "reason":"その他要件があります。確認してください"}
                    
                    tmp_result_judgement_list.append({
                        "requirement_no":requirement_no,
                        "company_no":company_no,
                        "office_no":office_no,
                        "requirementType":requirement_type,
                        "is_ok":val["is_ok"],
                        "result":val["reason"]
                    })

                    if val["is_ok"]:
                        result_sufficient_requirements_list.append({
                            "announcement_no":announcement_no,
                            "requirement_no":requirement_no,
                            "company_no":company_no,
                            "office_no":office_no,
                            "requirement_type":requirement_type,
                            "requirement_description":val["reason"],
                            "createdDate":"",
                            "updatedDate":""
                        })
                    else:
                        result_insufficient_requirements_list.append({
                            "announcement_no":announcement_no,
                            "requirement_no":requirement_no,
                            "company_no":company_no,
                            "office_no":office_no,
                            "requirement_type":requirement_type,
                            "requirement_description":val["reason"],
                            "suggestions_for_improvement":"",
                            "final_comment":"",
                            "createdDate":"",
                            "updatedDate":""
                        })

                tmp_result_judgement_df = pd.DataFrame(tmp_result_judgement_list)

                def summarize_result(announcement_no, company_no, office_no, tmp_result_df):
                    checked_requirement = {
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

                result_judgement_list.append(summarize_result(announcement_no=announcement_no, company_no=company_no, office_no=office_no, tmp_result_df=tmp_result_judgement_df))

            result_judgement = pd.DataFrame(result_judgement_list)
            result_insufficient_requirements = pd.DataFrame(result_insufficient_requirements_list)
            result_sufficient_requirements = pd.DataFrame(result_sufficient_requirements_list)

            if result_judgement.shape[0] > 0:
                tmp_result_judgement_table = "tmp_result_judgement"
                print(fr"Upload {tmp_result_judgement_table}")
                db_operator.uploadDataToTable(data=result_judgement, tablename=tmp_result_judgement_table)
                db_operator.updateCompanyBidJudgement(
                    company_bid_judgement_tablename=tablename_company_bid_judgement, 
                    company_bid_judgement_tablename_for_update=tmp_result_judgement_table
                )
                db_operator.dropTable(tablename=tmp_result_judgement_table)

            if result_insufficient_requirements.shape[0] > 0:
                tmp_result_insufficient_requirements_master_table = "tmp_result_insufficient_requirements"
                print(fr"Upload {tmp_result_insufficient_requirements_master_table}")
                db_operator.uploadDataToTable(data=result_insufficient_requirements, tablename=tmp_result_insufficient_requirements_master_table)
                db_operator.updateInsufficientRequirements(
                    insufficient_requirements_tablename=tablename_insufficient_requirement_master, 
                    insufficient_requirements_tablename_for_update=tmp_result_insufficient_requirements_master_table
                )
                db_operator.dropTable(tablename=tmp_result_insufficient_requirements_master_table)

            if result_sufficient_requirements.shape[0] > 0:
                tmp_result_sufficient_requirements_master_table = "tmp_result_sufficient_requirements"
                print(fr"Upload {tmp_result_sufficient_requirements_master_table}")
                db_operator.uploadDataToTable(data=result_sufficient_requirements, tablename=tmp_result_sufficient_requirements_master_table)
                db_operator.updateSufficientRequirements(
                    sufficient_requirements_tablename=tablename_sufficient_requirement_master, 
                    sufficient_requirements_tablename_for_update=tmp_result_sufficient_requirements_master_table
                )
                db_operator.dropTable(tablename=tmp_result_sufficient_requirements_master_table)



if __name__ == "__main__":
    # GCP bigquery想定
    # google ai studio に接続しなくてよいなら  --google_ai_studio_api_key_filepath 無しでよい。
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --bigquery_location SPECIFY_LOCATION --bigquery_project_id SPECIFY_PROJECT_ID --bigquery_dataset_name SPECIFY_DATASET_NAME --use_gcp_vm
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --bigquery_location "asia-northeast1" --bigquery_project_id vocal-raceway-473509-f1 --bigquery_dataset_name October_20251004 --use_gcp_vm
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/all.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --bigquery_location "asia-northeast1" --bigquery_project_id vocal-raceway-473509-f1 --bigquery_dataset_name October_20251004 --use_gcp_vm
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/all.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --bigquery_location "asia-northeast1" --bigquery_project_id vocal-raceway-473509-f1 --bigquery_dataset_name October_20251004 --use_gcp_vm  --step1_transfer_remove_table --step3_remove_table
    # 
    # sqlite3想定
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/bid_announcements_pre_1.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --sqlite3_db_file_path data/example.db
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/all.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --sqlite3_db_file_path data/example.db
    # python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/all.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --sqlite3_db_file_path data/example.db --step1_transfer_remove_table --step3_remove_table
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

    parser.add_argument("--step1_transfer_remove_table", action="store_true")
    parser.add_argument("--step3_remove_table", action="store_true")

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

        step1_transfer_remove_table = args.step1_transfer_remove_table
        step3_remove_table = args.step3_remove_table
    except:
        bid_announcements_pre_file = "data/bid_announcements_pre/bid_announcements_pre_1.txt"
        use_bigquery = False
        stop_processing = True

        step1_transfer_remove_table = False
        step3_remove_table = False

    if bid_announcements_pre_file is None:
        bid_announcements_pre_file = "data/bid_announcements_pre/bid_announcements_pre_1.txt"
        print(fr"Set bid_announcements_pre_file = {bid_announcements_pre_file}")

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

    obj.step0_create_bid_announcements_pre(bid_announcements_pre_file=bid_announcements_pre_file)
    obj.step1_transfer(remove_table=step1_transfer_remove_table)
    obj.step2_ocr(ocr_utils = OCRutils(google_ai_studio_api_key_filepath=google_ai_studio_api_key_filepath))
    obj.step3(remove_table=step3_remove_table)


    # db_operator.selectToTable(tablename="bid_announcements_pre")
    # db_operator.selectToTable(tablename="bid_announcements")
    # db_operator.selectToTable(tablename="bid_requirements")
    # db_operator.any_query(sql=fr"select requirement_type, count(*) as N from bid_requirements group by requirement_type order by N desc")
    # db_operator.selectToTable(tablename="sufficient_requirements")
    # db_operator.selectToTable(tablename="insufficient_requirements")
    # db_operator.selectToTable(tablename="company_bid_judgement")
    # db_operator.any_query(sql = "SELECT name FROM sqlite_master WHERE type='table'")

    # db_operator.any_query(sql = fr"SELECT table_name FROM `{bigquery_project_id}.{bigquery_dataset_name}.INFORMATION_SCHEMA.TABLES`")
    # db_operator.any_query(sql=fr"select requirement_type, count(*) as N from `{bigquery_project_id}.{bigquery_dataset_name}.bid_requirements` group by requirement_type order by N desc")
