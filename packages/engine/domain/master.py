#coding: utf-8
"""
Master クラスとヘルパー関数。

GCS 操作、PDF ページカウント、要件テキスト変換、判定チャンク処理のグローバル関数を含む。
"""

import os
import re
import json
import uuid
import warnings
from datetime import datetime
from multiprocessing import Pool, cpu_count

import pandas as pd
import numpy as np
import fitz  # PyMuPDF for page counting

# Suppress FutureWarning for cleaner output
warnings.simplefilter(action="ignore", category=FutureWarning)

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
        master = Master()
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
