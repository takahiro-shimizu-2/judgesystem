#coding: utf-8
"""
JudgementMixin: step3 判定処理と要件分類メソッド。
"""

import re
import uuid
from datetime import datetime
from multiprocessing import Pool, cpu_count

import pandas as pd
import numpy as np
from tqdm import tqdm

from packages.engine.domain.master import _process_judgement_chunk


class JudgementMixin:
    """step3 要件判定関連メソッドを提供する Mixin。"""

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

        tablename_bid_announcements_document_table = self.tablenamesconfig.bid_announcements_document_table

        db_operator = self.db_operator

        required_tables = [
            tablename_bid_announcements_document_table,
            tablename_announcements,
            tablename_requirements
        ]
        missing_tables = [
            name for name in required_tables
            if not db_operator.ifTableExists(tablename=name)
        ]
        if missing_tables:
            print("Error: 必要な基礎テーブルが存在しません。")
            print(f"Missing tables: {', '.join(missing_tables)}")
            print("step0_prepare_documents を実行してデータを作成してください。")
            return

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
