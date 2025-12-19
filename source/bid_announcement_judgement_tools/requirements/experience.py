# coding: utf-8 -*-

import re
import pandas as pd
from datetime import datetime, timezone, timedelta
import math
import pytz

#######################################
# 実績要件の判定を行う
# ※requirementType === "実績要件"の場合。
#######################################

def getConstructionInfo(constructionNo, construction_data=pd.read_csv("data/master/construction_master.txt",sep="\t")):
    # 営業品目マスター
    # construction_data

    data = construction_data[construction_data["construction_no"] == constructionNo]
    if data.shape[0] == 0:
        return None
    else:
        if data.shape[0] > 1:
            print(f"Warning: constructionNo={constructionNo} に対して複数行ヒット({data.shape[0]}行)")
        row_dict = data.iloc[0].to_dict()
        return {
            "construction_no": row_dict["construction_no"],      # 工事種別連番
            "construction_name": row_dict["construction_name"],  # 工事種別名称
            "category_segment": row_dict["category_segment"],    # カテゴリ区分
            "parent_construction_no": row_dict["parent_construction_no"]  # 上位工事種別
        }


def getAgencyInfo(agencyNo, agency_data = pd.read_csv("data/master/agency_master.txt",sep="\t")):
    # 発注者機関マスター
    # agency_data

    data = agency_data[agency_data["agency_no"] == agencyNo]
    if data.shape[0] == 0:
        return None
    
    if data.shape[0] > 1:
        print(f"Warning: agencyNo={agencyNo} に対して複数行ヒット({data.shape[0]}行)")
    row_dict = data.iloc[0].to_dict()

    # TODO
    # 親機関名取得は要検討。
    parentAgencyNo = row_dict["parent_agency_no"]
    parentName = None

    parentdata = agency_data[agency_data["agency_no"] == parentAgencyNo]
    if data.shape[0] >= 1:
        parentName = parentdata.iloc[0]["agency_name"]

    return {
        "agency_no": row_dict["agency_no"],
        "agency_name": row_dict["agency_name"],
        "parent_agency_no": parentAgencyNo,
        "parent_name": parentName,
        "agency_level": row_dict["agency_level"],
        "agency_area": row_dict["agency_area"]
    }


def getOfficeExperiences(officeNo, office_experience_data = pd.read_csv("data/master/office_work_achivements_master.txt",sep="\t")):
    # 拠点工事実績マスター  office_experience_data
        

    office_experience_data = office_experience_data[office_experience_data["office_no"] == officeNo]
    experiences = []
    for index, row in office_experience_data.iterrows():
        row_dict = row.to_dict()
        experiences.append({
            "office_experience_no": row_dict["office_experience_no"],
            "office_no": row_dict["office_no"],
            "agency_no": row_dict["agency_no"],
            "construction_no": row_dict["construction_no"],
            "project_name": row_dict["project_name"],
            "contractor_layer": row_dict["contractor_layer"],   # 請負階層
            "start_date": row_dict["start_date"],         # 着工日
            "completion_date": row_dict["completion_date"],    # 完成日
            "final_score": row_dict["final_score"],        # 工事成績点
            "total_amount": row_dict["total_amount"],       # 契約金額
            "is_jv_flg": row_dict["is_jv_flag"],         # JVフラグ
            "jv_ratio": row_dict["jv_ratio"],          # JV出資比率
            "remarks": row_dict["remarks"]            # 備考
        })
    return experiences



def extractExperienceConditions(text):
    # 小文字化して検索を容易に
    lowerText = text.lower()
    conditions = {
        # 期間条件
        "yearFrom": None,          #「平成XX年度以降」「令和XX年度以降」などから西暦を抽出
        # 元請条件（下位互換性のため残す）
        "requiresOriginalContractor": False,  # 「元請」キーワードがあるか
        # 立場（請負階層）条件を追加
        "requiredContractorLayer": None,     # 「元請け」「一次請」「二次請」「三次請」など
        # JV条件
        "minJvRatio": None,        # 「JV比率X%以上」などの値
        # 発注機関固有の点数条件（ここは条件ではなく条件適用の対象）
        "agencyScoreRequirements": {},
        # 工事成績条件
        "minScore": None,          # 「成績XX点以上」の値
        # 複数件の平均条件
        "requiresAverage": False,  # 「平均」の有無
        # 工事種別条件
        "constructionTypes": [],   # 工事種別キーワード
        # 構造・規模条件
        "structures": [],
        "minArea": None
    }
    # 1. 期間条件の抽出（既存のコード）
    # 平成年度
    # text = "平成 3 年度以降"
    # if yearMatch = text.match(/平成\s*(\d+)\s*年度以降/):
    if yearMatch := re.search(r"平成\s*(\d+)\s*年度以降", text):
        heisei = int(yearMatch[1])
        fiscalYear = 1988 + heisei
        conditions["yearFrom"] = fiscalYear
        #conditions["fiscalYearFrom"] = new Date(fiscalYear, 3, 1); # 4月1日開始
        conditions["fiscalYearFrom"] = pd.Timestamp(year=fiscalYear, month=4, day=1)

    # 令和年度
    # elif yearMatch = text.match(/令和\s*(\d+)\s*年度以降/):
    elif yearMatch := re.search(r"令和\s*(\d+)\s*年度以降", text):
        reiwa = int(yearMatch[1])
        # const fiscalYear = (reiwa === 1) ? 2019 : (2018 + reiwa)
        fiscalYear = 2018 + reiwa
        conditions["yearFrom"] = fiscalYear
        if reiwa == 1:
            # 令和元年度は5月1日開始
            conditions["fiscalYearFrom"] = pd.Timestamp(year=2019, month=5, day=1)
        else:
            # その他は4月1日開始
            conditions["fiscalYearFrom"] = pd.Timestamp(year=fiscalYear, month=4, day=1)
    # 西暦年度
    elif yearMatch := re.search(r"(\d{4})\s*年度以降", text):
        year = int(yearMatch[1])
        conditions["yearFrom"] = year
        # 4月1日開始
        conditions["fiscalYearFrom"] = pd.Timestamp(year=fiscalYear, month=4, day=1)
    

    # 2. 立場（請負階層）条件の抽出 - 改善部分
    if "元請" in lowerText or "元請け" in lowerText:
        conditions["requiresOriginalContractor"] = True # 下位互換性のため
        conditions["requiredContractorLayer"] = "元請け"
    elif "一次請" in lowerText or "一次下請" in lowerText:
        conditions["requiredContractorLayer"] = "一次請"
    elif "二次請" in lowerText or "二次下請" in lowerText:
        conditions["requiredContractorLayer"] = "二次請"
    elif "三次請" in lowerText or "三次下請" in lowerText:
        conditions["requiredContractorLayer"] = "三次請"

    # 3. JV条件の抽出（既存のコード）
    # jvMatch = lowerText.match(/(?:jv比率|出資比率|比率)\s*(\d+(?:\.\d+)?)\s*[%％]以上/)
    jvMatch = re.search(r"(?:jv比率|出資比率|比率)\s*(\d+(?:\.\d+)?)\s*[%％]以上", lowerText)
    # jvMatch = re.search(r"(?:jv比率|出資比率|比率)\s*(\d+(?:\.\d+)?)\s*[%％]以上", "この案件は出資比率 12.5％以上が条件です")
    if jvMatch:
        conditions["minJvRatio"] = float(jvMatch[1])
    elif "出資比率が20%以上" in lowerText:
        conditions.minJvRatio = 20
    elif "出資比率が" in lowerText and "%以上" in lowerText:
        # numMatch = lowerText.match(/出資比率が(\d+(?:\.\d+)?)%以上/)
        numMatch = re.search(r"出資比率が(\d+(?:\.\d+)?)%以上", lowerText)
        if numMatch:
            conditions.minJvRatio = float(numMatch[1])
        elif "共同企業体" in lowerText or "jv" in lowerText:
            conditions.minJvRatio = 20 # よくある閾値として仮に20


    # 4. 発注機関ごとの点数条件を抽出
    agencyKeywords = [
        "全省庁統一", "防衛省", "法務省", "財務省", "文部科学省", "厚生労働省",
        "林野庁", "経済産業省", "内閣府", "農林水産省大臣官房予算課",
        "農林水産省地方農政局", "最高裁判所", "国土交通省大臣官房会計課所掌機関",
        "環境省", "国土交通省北海道開発局"
    ]

    # 各発注機関に関連する点数条件を抽出
    for agency in agencyKeywords:
        scorePattern = re.compile(fr"{agency}[\s\S]*?(\d+)点未満のものを除く")
        scoreMatch = scorePattern.search(text)
        if scoreMatch:
            minScore = int(scoreMatch[1])
            conditions["agencyScoreRequirements"][agency] = minScore

    # 5. 工事成績条件
    scoreMatch1 = re.search(r"(?:成績|評定|点数|工事成績).*?(\d+)(?:\.\d+)?\s*点以上/", text)
    if scoreMatch1:
        conditions["minScore"] = float(scoreMatch1[1])
    elif "点以上" in text:
        scoreMatch2 = re.search(r"(\d+)(?:\.\d+)?\s*点以上/", text)
        if scoreMatch2:
            conditions["minScore"] = float(scoreMatch2[1])

    # 6. 平均条件の抽出
    if "平均" in lowerText:
        conditions["requiresAverage"] = True

    # 7. 工事種別の抽出
    constructionKeywords = [
        "土木", "建築", "大工", "左官", "とび・土工", "石", "屋根",
        "電気", "管", "タイル", "鋼構造物", "鉄筋", "舗装", "しゅんせつ",
        "板金", "ガラス", "塗装", "防水", "内装", "機械", "熱絶縁",
        "電気通信", "造園", "さく井", "建具", "水道施設", "消防施設", "営繕"
    ]
    for keyword in constructionKeywords:
        if fr"{keyword}工事" in lowerText:
            conditions["constructionTypes"].append(keyword)
        elif keyword in lowerText:
            conditions["constructionTypes"].append(keyword)

    # 8. 構造・規模条件
    structureKeywords = ["RC造", "S造", "SRC造", "木造", "鉄骨", "鉄筋コンクリート"]
    for keyword in structureKeywords:
        # TODO
        # 細かいが、こちらは lowerText を使わないのか？(RC造が、rc造だったりしないのか？)
        if keyword in text:
            conditions["structures"].append(keyword)

    areaMatch = re.search(r"(\d+(?:\.\d+)?)\s*[㎡m2]\s*以上", text)
    if areaMatch:
        conditions["minArea"] = float(areaMatch[1])

    return conditions



# 条件に基づいて実績をフィルタリングする
def filterExperiencesByConditions(experiences, conditions):

    def _filterFunc(exp):
        matches = True
        # 1. 期間条件 (completion_date の確認強化)
        if conditions["fiscalYearFrom"]:
            # 有効な日付かどうかをチェック (日付型かつ有効な値)
            hasValidCompletionDate = isinstance(exp["completion_date"], datetime) and not math.isnan(exp["completion_date"].timestamp())

            if not hasValidCompletionDate:
                matches = False
            elif exp["completion_date"] < conditions["fiscalYearFrom"]:
                matches = False
        elif conditions["yearFrom"]:
            # 下位互換性のためにyearFromも残しておく (fiscalYearFromが無い場合)
            # 有効な日付かどうかをチェック追加
            hasValidCompletionDate = isinstance(exp["completion_date"], datetime) and not math.isnan(exp["completion_date"].timestamp())

            if not hasValidCompletionDate:
                matches = False
            else:
                completionYear = exp["completion_date"].year
                completionMonth = exp["completion_date"].month

                # 年度判定 (同じ年なら4月以降かチェック)
                if completionYear < conditions["yearFrom"] or (completionYear == conditions["yearFrom"] and completionMonth < 4):
                    matches = False

        # 2. 請負階層条件 (立場)の確認
        if matches and conditions["requiredContractorLayer"]:
            if exp["contractor_layer"] != conditions["requiredContractorLayer"]:
                matches = False
        elif matches and conditions["requiresOriginalContractor"]:
            # 下位互換性のため (requiredContractorLayerが設定されていない場合)
            if exp["contractor_layer"] != "元請け":
                matches = False

        # 3. JV比率条件
        if matches and conditions["minJvRatio"] is not None:
            # JVフラグがtrueで、かつJV比率が条件以上の場合のみOK
            if exp["is_jv_flg"]:
                if exp["jv_ratio"] < conditions["minJvRatio"]:
                    matches = False
        else:
            # JVでない場合は、元請けなら条件は満たすとみなす（JV条件は元請けまたはJV比率XX%という共通解釈）
            if exp["contractor_layer"] != "元請け":
                matches = False

        # 4. 工事種別条件を確認する前に、先に情報を取得しておく
        constructionInfo = None
        if matches and len(conditions["constructionTypes"]) > 0:
            constructionInfo = getConstructionInfo(
                constructionNo=exp["construction_no"],
                construction_data=pd.read_csv("data/master/construction_master.txt",sep="\t")
            )
            # if not constructionInfo:
                # 疑問：ここでmatches = False としないのか？Loggerでは x としている。

        # 発注機関情報も先に取得
        agencyInfo = None
        if matches:
            agencyInfo = getAgencyInfo(
                agencyNo=exp["agency_no"], 
                agency_data=pd.read_csv("data/master/agency_master.txt",sep="\t")
            )
        # if not agencyInfo:
        #     疑問：ここでmatches = False としないのか？Loggerでは x としている。
        # else:
        #     Logger.log("    ○ Found agency_name: " + agencyInfo.agency_name +

        # 工事種別条件
        if matches and len(conditions["constructionTypes"]) > 0:
            if not constructionInfo:
                matches = False
            else:
                constructionMatch = False
                for reqType in conditions["constructionTypes"]:
                    if reqType in constructionInfo["construction_name"]:
                        constructionMatch = True
                        break
                if not constructionMatch:
                    matches = False

        # 5. 工事成績条件（全般）
        if matches and conditions["minScore"] is not None:
            score = 0
            if type(exp["final_score"]) == 'number':
                score = exp["final_score"]

            if score < conditions["minScore"]:
                matches = False

        # 6. 発注機関固有の点数条件チェック（該当機関の場合のみ）
        #if matches and Object.keys(conditions.agencyScoreRequirements).length > 0:
        if matches and len(conditions["agencyScoreRequirements"]) > 0:
            if not agencyInfo:
                "    ! Agency-specific score requirements exist, but no agency info available"
            else:
                # 発注機関名を確認
                # agencyName = agencyInfo["agency_name"] || ""
                agencyName = agencyInfo.get("agency_name") or ""
                # parentName = agencyInfo["parent_name"] || ""
                parentName = agencyInfo.get("parent_name") or ""

            # この実績の発注機関に対応する点数条件があるか確認
            # for [agency, minScore] in Object.entries(conditions.agencyScoreRequirements):
            for agency, minScore in conditions["agencyScoreRequirements"].items():
                # この実績が特定の発注機関のものか確認
                isThisAgency = agency in agencyName or agency in parentName
                # この発注機関の実績の場合のみ、点数条件を適用
                if isThisAgency:
                    # 成績点のチェック
                    score = 0
                    if type(exp["final_score"]) == 'number':
                        score = exp["final_score"]

                    if score < minScore:
                        matches = False
                        break
                else:
                    # 別の発注機関の実績の場合は、この発注機関の点数条件は適用しない
                    fr"    ○ Not a {agency} project, ignoring its score requirement"

        # 7. 構造・規模条件 (今は実装なし)
        # if (conditions.structures.length > 0 || conditions.minArea) {
        #    ...
        # }

        return matches

    matchingExperiences = [v for v in experiences if _filterFunc(v)]

    return matchingExperiences


def generateSuccessReason(matchingExperiences, conditions, agency_data=pd.read_csv("data/master/agency_master.txt",sep="\t"), construction_data=pd.read_csv("data/master/construction_master.txt",sep="\t")):
    # 最も新しい実績情報を1件だけ取得
    # mostRecentExperience = matchingExperiences.sort((a, b) => b.completion_date - a.completion_date)[0];
    mostRecentExperience = sorted(matchingExperiences, key=lambda x: x.completion_date, reverse=True)

    # 発注機関情報を取得 - ここが重要
    agencyInfo = getAgencyInfo(
        agencyNo=mostRecentExperience["agency_no"], 
        agency_data=agency_data
    )

    # 発注機関名を正しく設定 - nullチェックを強化
    agencyName = "不明"
    if agencyInfo:
        agencyName = agencyInfo.get("agency_name") or "不明"

    # 親機関がある場合は確認（より正確な表示のため）
    if agencyInfo["parent_name"] and ("支局" in agencyName or "事務局" in agencyName):
        agencyName = agencyInfo["parent_name"]

    # 工事種別情報を取得 - ここも重要
    constructionInfo = getConstructionInfo(
        constructionNo=mostRecentExperience["construction_no"],
        construction_data=construction_data
    )

    # 工事種別名を正しく設定 - nullチェックを強化
    constructionName = "不明"
    if constructionInfo:
        constructionName = constructionInfo["construction_name"] or "不明"

    # 完成日のフォーマット
    completionDateStr = "不明"
    if isinstance(mostRecentExperience["completion_date"], datetime) and not math.isnan(mostRecentExperience["completion_date"].timestamp()):
        # completionDateStr = Utilities.formatDate(mostRecentExperience["completion_date"], Session.getScriptTimeZone(), "yyyy年MM月dd日")
        #
        # Google Apps Script の Session.getScriptTimeZone() 相当を指定
        # ここでは日本時間 (Asia/Tokyo) を例に
        tz = pytz.timezone("Asia/Tokyo")
        some_date_tz = mostRecentExperience["completion_date"].astimezone(tz)
        # フォーマット
        completionDateStr = some_date_tz.strftime("%Y年%m月%d日")

    #  詳細な条件クリア情報を生成
    conditionDetails = []

    # 1. 年度条件
    if conditions["yearFrom"]:
        #completionYear = mostRecentExperience.completion_date.getFullYear()
        #completionMonth = mostRecentExperience.completion_date.getMonth() + 1;
        completionYear = mostRecentExperience["completion_date"].year
        completionMonth = mostRecentExperience["completion_date"].month
        conditionDetails.append(fr"{conditions['yearFrom']}年度以降の条件に対して{completionYear}年{completionMonth}月に完成")

    # 2. 立場条件
    if conditions["requiredContractorLayer"]:
        conditionDetails.append(fr"{conditions['requiredContractorLayer']}の条件に対して{mostRecentExperience['contractor_layer']}として参加")
    elif conditions["requiresOriginalContractor"]:
        conditionDetails.append(fr"元請の条件に対して{mostRecentExperience['contractor_layer']}として参加")

    # 3. JV条件
    if conditions["minJvRatio"] is not None and mostRecentExperience["is_jv_flg"]:
        conditionDetails.append(fr"JV比率{conditions['minJvRatio']}%以上の条件に対してJV比率{mostRecentExperience['jv_ratio']}%で参加")

    # 4. 発注機関固有の点数条件（発注機関が一致する場合のみ）
    if agencyInfo:
        # Object.entries(conditions.agencyScoreRequirements).forEach(([agency, minScore]) => {
        for agency, minScore in conditions["agencyScoreRequirements"].items():
            isThisAgency = (agencyInfo["agency_name"] and agency in agencyInfo["agency_name"]) or (agencyInfo["parent_name"] and agency in agencyInfo["parent_name"])

            if isThisAgency and type(mostRecentExperience["final_score"]) == 'number':
                conditionDetails.append(fr"{agency}発注の成績{minScore}点以上の条件に対して成績{mostRecentExperience.final_score}点を獲得")

    # 5. 一般的な成績点条件
    if conditions["minScore"] is not None and type(mostRecentExperience["final_score"]) == 'number':
        conditionDetails.append(fr"成績{conditions['minScore']}点以上の条件に対して成績{mostRecentExperience['final_score']}点を獲得")

    # 6. 工事種別条件
    if len(conditions["constructionTypes"]) > 0 and constructionInfo:
        matchedType = ""
        for reqType in conditions["constructionTypes"]:
            if reqType in constructionInfo["construction_name"]:
                matchedType = reqType
                break
                
    if matchedType:
        conditionDetails.push(fr"{matchedType}工事の条件に対して{constructionName}を実施")

    # 基本工事情報 - 実際の発注機関名を使用
    result = fr"{agencyName}発注の{constructionName} {completionDateStr}完成"

    # JV情報
    if mostRecentExperience["is_jv_flg"]:
        result += fr"、JV出資比率{mostRecentExperience['jv_ratio']}%"

    # 成績点情報
    if type(mostRecentExperience["final_score"] == 'number') and mostRecentExperience["final_score"] > 0:
        result += fr"、成績{mostRecentExperience['final_score']}点"

    result += ")"

    # 詳細な条件クリア情報を追加
    if len(conditionDetails) > 0:
        result += "、" + conditionDetails.join("、")

    # 合計件数があれば表示
    if len(matchingExperiences) > 1:
        result = fr"合計{len(matchingExperiences)}件の該当実績あり：" + result

    return result

def generateFailureReason(conditions):
    reasons = []

    # 1. 期間条件
    if conditions["yearFrom"]:
        if conditions["fiscalYearFrom"]:
            # formattedDate = Utilities.formatDate(conditions.fiscalYearFrom, Session.getScriptTimeZone(), "yyyy年MM月dd日")
            # 
            # Google Apps Script の Session.getScriptTimeZone() 相当を指定
            # ここでは日本時間 (Asia/Tokyo) を例に
            tz = pytz.timezone("Asia/Tokyo")
            some_date_tz = conditions["fiscalYearFrom"].astimezone(tz)
            # フォーマット
            formattedDate = some_date_tz.strftime("%Y年%m月%d日")

            reasons.append(fr"{conditions['yearFrom']}年度以降（{formattedDate}以降）の実績がない")
        else:
            reasons.append(fr"{conditions['yearFrom']}年度以降の実績がない")

    # 2. 立場条件
    if conditions["requiredContractorLayer"]:
        reasons.append(fr"{conditions['requiredContractorLayer']}としての実績がない")
    elif conditions["requiresOriginalContractor"]:
        reasons.append("元請としての実績がない")

    # 3. JV条件
    if conditions["minJvRatio"] is not None:
        reasons.append(fr"JV比率{conditions['minJvRatio']}%以上の実績がない")

    # 4. 成績条件
    if conditions["minScore"] is not None:
        reasons.append(fr"成績{conditions['minScore']}点以上の実績がない")

    # 5. 工事種別条件
    if len(conditions["constructionTypes"]) > 0:
        if len(conditions["constructionTypes"]) == 1:
            reasons.append(fr"${conditions['constructionTypes'][0]}工事の実績がない")
        else:
            reasons.append(fr"{conditions['constructionTypes'].join('・')}などの工事実績がない")

    # 6. 発注機関固有の条件
    # if (Object.keys(conditions.agencyScoreRequirements).length > 0) {
    if len(conditions["agencyScoreRequirements"].keys()).length > 0:
        for agency, minScore in conditions["agencyScoreRequirements"].items():
            reasons.append(fr"{agency}発注の成績{minScore}点以上の実績がない")

    # 理由がある場合は連結して返す
    if len(reasons) > 0:
        return reasons.join("、")

    # 特定の理由が特定できない場合のデフォルトメッセージ
    return "要求される実績条件を満たす工事実績が確認できません"


def checkExperienceRequirement(requirementText, officeNo, office_experience_data=pd.read_csv("data/master/office_work_achivements_master.txt",sep="\t"), agency_data=pd.read_csv("data/master/agency_master.txt",sep="\t"), construction_data=pd.read_csv("data/master/construction_master.txt",sep="\t")):
    # 1. 要件テキストから条件を抽出
    conditions = extractExperienceConditions(text=requirementText)
    # 2. 拠点の実績データを取得
    experiences = getOfficeExperiences(
        officeNo=officeNo, 
        office_experience_data = office_experience_data
    )
    if not experiences or len(experiences) == 0:
        return {
            "is_ok": False,
            "reason": fr"実績要件 : 拠点ID={officeNo}に実績情報が見つかりません"
        }

    # 3. 条件を満たす実績があるかチェック
    matchingExperiences = filterExperiencesByConditions(experiences=experiences, conditions=conditions)

    # 結果判定 (条件に合う実績が1つ以上あればOK)
    if len(matchingExperiences) > 0:
        # 成功理由を具体的に生成
        reasonMsg = generateSuccessReason(
            matchingExperiences=matchingExperiences, 
            conditions=conditions, 
            agency_data=agency_data, 
            construction_data=construction_data
        )
        return {
            "is_ok": True,
            "reason": fr"実績要件：{reasonMsg}"
        }
    else:
        # 最も具体的な条件を特定してエラーメッセージを生成
        reasonMsg = generateFailureReason(conditions=conditions)
        return {
            "is_ok": False,
            "reason": fr"実績要件：{reasonMsg}"
        }


if __name__ == "__main__":
    1
