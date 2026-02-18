#coding: utf-8

"""
処理概要：

- 判定前公告一覧表を入力として受け取る。
- 公告マスターや要件マスターを作成する。
- 公告pdfから公告・要件情報を抽出する。
- 企業 x 拠点 x 要件の組み合わせごとに要件判定を行い、判定結果を企業公告マスターにまとめる。

処理のステップ：

- step0 : 判定前公告一覧表アップロード  
- step1 : 転写処理
- step2 : OCR処理
- step3 : 要件判定

Usage example:

    python source/bid_announcement_judgement_tools/main.py --bid_announcements_pre_file data/bid_announcements_pre/all.txt --google_ai_studio_api_key_filepath data/sec/google_ai_studio_api_key.txt --bigquery_location "LOCATION" --bigquery_project_id PROJECT_ID --bigquery_dataset_name DATASET_NAME --use_gcp_vm  --step1_transfer_remove_table --step3_remove_table

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

- --step1_transfer_remove_table: (フラグ引数) 

  step1の転写処理で、公告マスターと要件マスターを削除するかどうか。

- --step3_remove_table: (フラグ引数) 

  step3の要件判定処理で、企業公告マスター・充足要件マスター・不足要件マスターを削除するかどうか。
"""

import sqlite3  # sqlite3使わない想定でもimport
import os
import argparse
import re
import json
import time
from datetime import datetime
from dataclasses import dataclass
from abc import ABC, abstractmethod

import pandas as pd
import numpy as np
from google import genai # For OCR
from google.genai.errors import ClientError
from google.genai import types
# import google.generativeai as genai

import httpx
import requests
import ast

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

        def _modifyDate(datestr, handle_same_year=None):
            try:
                datestr = datestr.replace("令和元年", "令和1年")
                if "同年" in datestr:
                    datestr = datestr.replace("同年", fr"{handle_same_year}年")

                m = re.search(r"令和\s*(\d+)年\s*(\d+)月\s*(\d+)日", datestr)
                if m:
                    return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"
                
                m = re.search(r"(\d{4})年\s*(\d+)月\s*(\d+)日", datestr)
                if m:
                    return fr"{int(m.group(1))}-{int(m.group(2)):02}-{int(m.group(3)):02}"
                return datestr
            except Exception as e:
                print(e)
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

        orderer_id string
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
            pdfUrl, pdfUrl_type, document_id,
            pdfUrl2, pdfUrl2_type, document_id2,
            pdfUrl3, pdfUrl3_type, document_id3,
            pdfUrl4, pdfUrl4_type, document_id4,
            pdfUrl5, pdfUrl5_type, document_id5,
            doneOCR,
            createdDate,
            updatedDate,

            orderer_id
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

            FALSE AS doneOCR,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP()) AS createdDate,
            FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', CURRENT_TIMESTAMP()) AS updatedDate,

            MAX(CASE WHEN o.rn = 1 THEN o.orderer_id END) AS orderer_id
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
            evaluation_no int64,
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
            sufficiency_detail_no int64,
            evaluation_no int64,
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
            shortage_detail_no int64,
            evaluation_no int64,
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
                a.workPlace,

                a.pdfUrl,

                STRUCT(
                    COALESCE(a.zipcode, 'dummy') AS postalCode,
                    COALESCE(a.address, 'dummy') AS address,
                    COALESCE(a.department, 'dummy') AS name,
                    COALESCE(a.assigneeName, 'dummy') AS contactPerson,
                    COALESCE(a.telephone, 'dummy') AS phone,
                    COALESCE(a.fax, 'dummy') AS fax,
                    COALESCE(a.mail, 'dummy') AS email
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
        COALESCE(b.workName, 'dummytitle') AS title,

        COALESCE(b.topAgencyName, 'dummy') AS organization,
        'dummy_cat' AS category,
        COALESCE(b.workPlace, 'dummy') AS workLocation,

        b.department,

        COALESCE(b.publishDate, 'dummy') AS publishDate,
        COALESCE(b.docDistStart, 'dummy') AS explanationStartDate,
        COALESCE(b.docDistEnd, 'dummy') AS explanationEndDate,
        COALESCE(b.submissionStart, 'dummy') AS applicationStartDate,
        COALESCE(b.submissionEnd, 'dummy') AS applicationEndDate,
        COALESCE(b.bidStartDate, 'dummy') AS bidStartDate,
        COALESCE(b.bidEndDate, 'dummy') AS bidEndDate,
        'dummy_deadline' AS deadline,
        1 AS estimatedAmountMin,
        1000 AS estimatedAmountMax,
        'closed' AS status,
        10 AS actualAmount,

        concat('com-', 1) AS winningCompanyId,
        'dummy_wincomp' AS winningCompanyName,
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
        id, `no`, ordererId, title, category, organization, workLocation,
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
            
            coalesce(anno.workName, 'dummytitle') AS workName,
            coalesce(anno.topAgencyName, 'dummy_org') AS topAgencyName,
            coalesce(anno.workPlace, 'workloc') AS workPlace,
            coalesce(anno.department, 'department') AS department,
            coalesce(anno.publishDate, 'publishDate') AS publishDate,
            coalesce(anno.docDistStart, 'expStartDate') AS docDistStart,
            coalesce(anno.docDistEnd, 'expEndDate') AS docDistEnd,
            coalesce(anno.submissionStart, 'appStartDate') AS submissionStart,
            coalesce(anno.submissionEnd, 'appEndDate') AS submissionEnd,
            coalesce(anno.bidStartDate, 'dummy') AS bidStartDate,
            coalesce(anno.bidEndDate, 'dummy') AS bidEndDate,
            coalesce(anno.pdfUrl, 'https://example.com/') AS pdfUrl,
            coalesce(anno.orderer_id, 'unknown') AS orderer_id,
            
            1 as documents_id,
            'bid_documents' as documents_type,
            '入札関連書' as documents_title,
            'pdf' as documents_fileFormat,
            25 as documents_pageCount,
            'dummy' as documents_extractedAt,
            'https://example.com/docs/ann-1/bid_documents.pdf' as documents_url,
            '入札関連書...' as documents_content,
            
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
            'dummycat' AS category,
            topAgencyName AS organization,
            workPlace AS workLocation,
            
            struct(
                '999-9999' as postalCode,
                '北極' as address,
                department as name,
                'あいうえお' as contactPerson,
                '99-9999-9999' as phone,
                '99-9999-9999' as fax,
                'kikaku@example.go.jp' as email
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
            struct(
                concat('doc-',documents_id) as id,
                documents_type as type,
                documents_title as title,
                documents_fileFormat as fileFormat,
                documents_pageCount as pageCount,
                documents_extractedAt as extractedAt,
                documents_url as url,
                documents_content as content
            ) as documents
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
        topAgencyName,
        workPlace,
        department,
        publishDate,
        docDistStart,
        docDistEnd,
        submissionStart,
        submissionEnd,
        bidStartDate,
        bidEndDate,
        pdfUrl,
        
        documents_id,
        documents_type,
        documents_title,
        documents_fileFormat,
        documents_pageCount,
        documents_extractedAt,
        documents_url,
        documents_content,
        
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
        sql = fr"""
        CREATE OR REPLACE TABLE {self.project_id}.{self.dataset_name}.{tablename} AS
        with base as (
            select 
            orderer_id as id,
            `no`,
            name,
            category, 
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

        orderer_id string
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

            pdfUrl, pdfUrl_type, document_id,
            pdfUrl2, pdfUrl2_type, document_id2,
            pdfUrl3, pdfUrl3_type, document_id3,
            pdfUrl4, pdfUrl4_type, document_id4,
            pdfUrl5, pdfUrl5_type, document_id5,

            doneOCR,
            createdDate,
            updatedDate,

            orderer_id
        )
        SELECT
            o.announcement_id,
            MAX(CASE WHEN o.rn = 1 THEN o.title END) AS workName,

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

            MAX(CASE WHEN o.rn = 1 THEN o.orderer_id END) AS orderer_id
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

    def getMaxOfColumn(self, tablename, column_name):
        sql = fr"SELECT max({column_name}) FROM {tablename}"
        ret = pd.read_sql_query(sql, self.conn)
        return ret

    def createCompanyBidJudgements(self, company_bid_judgement_tablename):
        sql = fr"""
        create table {company_bid_judgement_tablename} (
            evaluation_no integer,
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
            sufficiency_detail_no integer,
            evaluation_no integer,
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
            shortage_detail_no integer,
            evaluation_no integer,
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


    def step1_transfer_v2(self, announcements_documents_file="source/check_html/use_claude/3_source_formatting/output/announcements_document_202602162218_updated.txt.zip", remove_table=False):
        """
        step1 : 転写処理

        公告マスターが無ければ公告マスターを作成する。要件マスターが無ければ要件マスターを作成する。

        引数 remove_table に応じて、事前に公告マスター・要件マスターを削除する。
        
        判定前公告を公告マスターにコピーする。

        Args:

        - remove_table=False: 
        
          処理前に、公告マスター・要件マスターを削除するかどうか。
        """

        tablename_announcements = self.tablenamesconfig.bid_announcements
        tablename_requirements = self.tablenamesconfig.bid_requirements
        tablename_bid_announcements_document_table = self.tablenamesconfig.bid_announcements_document_table

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



        df_new = pd.read_csv(announcements_documents_file,sep="\t")
        df_new.head(6)
        col = "announcement_id"
        df_new = df_new[df_new[col] <= 300000]
        # df_new = df_new[df_new[col] >= 300143]
        df_new.head(6)
        db_operator.uploadDataToTable(data=df_new, tablename=tablename_bid_announcements_document_table, chunksize=5000)


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
        for index, row in df1.iterrows():
            # row = df1.loc[index]
            announcement_no = row["announcement_no"]
            print(f"Processing OCR for announcement_no={announcement_no}...")

            pdfurl = row["pdfUrl"]
            document_id = row["document_id"]

            time.sleep(1)

            try:
                # announcements
                doc_data = None
                if not document_id in df_ann["document_id"].values:
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
                        "入札説明書の交付期間___開始日" : dict1["入札説明書の交付期間"]["開始日"],
                        "入札説明書の交付期間___終了日" : dict1["入札説明書の交付期間"]["終了日"],
                        "申請書及び競争参加資格確認資料の提出期限___開始日" : dict1["申請書及び競争参加資格確認資料の提出期限"]["開始日"],
                        "申請書及び競争参加資格確認資料の提出期限___終了日" : dict1["申請書及び競争参加資格確認資料の提出期限"]["終了日"],
                        "入札書の提出期間___開始日" : dict1["入札書の提出期間"]["開始日"],
                        "入札書の提出期間___終了日" : dict1["入札書の提出期間"]["終了日"]
                    }
                    tmpdict2 = pd.DataFrame(dict2, index=[0])
                    df_ann = pd.concat([df_ann, tmpdict2], axis=0, ignore_index=True)
                    df_ann.to_csv(output_path_ann, sep="\t", index=False)
                    df_ann.to_csv(output_path_ann_zip, sep="\t", compression="zip", index=False)
                else:
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
                dict1["announcement_no"] = announcement_no
                new_json = ocr_utils.convertJson(json_value=dict1)


                # requirements
                if not document_id in df_req["document_id"].values:
                    print(document_id)
                    if doc_data is None:
                        doc_data = ocr_utils.getPDFDataFromUrl(pdfurl)

                    time.sleep(0.5)
                    requirement_texts = ocr_utils.getRequirementText(doc_data=doc_data)
                    dict2 = {
                        "document_id" : document_id,
                        "資格・条件" : requirement_texts["資格・条件"]
                    }
                    # tmpdict2 = pd.DataFrame(dict2, index=[0])
                    tmpdict2 = pd.DataFrame([dict2])
                    df_req = pd.concat([df_req, tmpdict2], axis=0, ignore_index=True)
                    df_req.to_csv(output_path_req, sep="\t", index=False)
                    df_req.to_csv(output_path_req_zip, sep="\t", compression="zip", index=False)
                else:
                    dict2 = df_req[df_req["document_id"]==document_id]
                    requirement_texts = {
                        "資格・条件": dict2["資格・条件"].apply(ast.literal_eval).values[0]
                    }
                requirement_texts["announcement_no"] = announcement_no
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
            df1["fax"] = df1["fax"].astype("string")
            print(fr"Upload {tmp_tablename_announcements}")
            db_operator.uploadDataToTable(data=df1, tablename=tmp_tablename_announcements, chunksize=5000)

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
        db_operator.uploadDataToTable(data=tmp_office_master, tablename=tablename_office_master, chunksize=5000)

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

        max_evaluation_no = db_operator.getMaxOfColumn(tablename=tablename_company_bid_judgement,column_name="evaluation_no")
        if max_evaluation_no.iloc[0,0] is None or pd.isna(max_evaluation_no.iloc[0,0]):
            max_evaluation_no = 0
        else:
            max_evaluation_no = max_evaluation_no.iloc[0,0]
        current_evaluation_no = max_evaluation_no + 1

        max_sufficiency_detail_no = db_operator.getMaxOfColumn(tablename=tablename_sufficient_requirement_master,column_name="sufficiency_detail_no")
        if max_sufficiency_detail_no.iloc[0,0] is None or pd.isna(max_sufficiency_detail_no.iloc[0,0]):
            max_sufficiency_detail_no = 0
        else:
            max_sufficiency_detail_no = max_sufficiency_detail_no.iloc[0,0]
        current_sufficiency_detail_no = max_sufficiency_detail_no + 1

        max_shortage_detail_no = db_operator.getMaxOfColumn(tablename=tablename_insufficient_requirement_master,column_name="shortage_detail_no")
        if max_shortage_detail_no.iloc[0,0] is None or pd.isna(max_shortage_detail_no.iloc[0,0]):
            max_shortage_detail_no = 0
        else:
            max_shortage_detail_no = max_shortage_detail_no.iloc[0,0]
        current_shortage_detail_no = max_shortage_detail_no + 1
        
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
                        "evaluation_no":current_evaluation_no,
                        "requirement_no":requirement_no,
                        "company_no":company_no,
                        "office_no":office_no,
                        "requirementType":requirement_type,
                        "is_ok":val["is_ok"],
                        "result":val["reason"]
                    })

                    if val["is_ok"]:
                        result_sufficient_requirements_list.append({
                            "sufficiency_detail_no":current_sufficiency_detail_no,
                            "evaluation_no":current_evaluation_no,
                            "announcement_no":announcement_no,
                            "requirement_no":requirement_no,
                            "company_no":company_no,
                            "office_no":office_no,
                            "requirement_type":requirement_type,
                            "requirement_description":val["reason"],
                            "createdDate":datetime.now(),
                            "updatedDate":datetime.now()
                        })
                        current_sufficiency_detail_no += 1
                    else:
                        result_insufficient_requirements_list.append({
                            "shortage_detail_no":current_shortage_detail_no,
                            "evaluation_no":current_evaluation_no,
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
                        current_shortage_detail_no += 1

                tmp_result_judgement_df = pd.DataFrame(tmp_result_judgement_list)
                def summarize_result(evaluation_no, announcement_no, company_no, office_no, tmp_result_df):
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

                result_judgement_list.append(summarize_result(evaluation_no=current_evaluation_no, announcement_no=announcement_no, company_no=company_no, office_no=office_no, tmp_result_df=tmp_result_judgement_df))
                current_evaluation_no += 1

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

        step1_transfer_remove_table = args.step1_transfer_remove_table
        step3_remove_table = args.step3_remove_table

        condition_doneOCR = args.condition_doneOCR
    except:
        bid_announcements_pre_file = "data/bid_announcements_pre/bid_announcements_pre_1.txt"
        use_bigquery = False
        stop_processing = True

        step1_transfer_remove_table = False
        step3_remove_table = False

        condition_doneOCR = "FALSE"
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

    # obj.step0_create_bid_announcements_pre(bid_announcements_pre_file=bid_announcements_pre_file)
    # obj.step1_transfer(remove_table=step1_transfer_remove_table)
    obj.step1_transfer_v2(remove_table=step1_transfer_remove_table)
    obj.step2_ocr(
        ocr_utils = OCRutils(google_ai_studio_api_key_filepath=google_ai_studio_api_key_filepath), 
        condition_doneOCR=condition_doneOCR
    )
    obj.step3(remove_table=step3_remove_table)

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






