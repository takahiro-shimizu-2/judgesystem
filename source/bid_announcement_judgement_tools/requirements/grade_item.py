# coding: utf-8 -*-

import re
import pandas as pd

#######################################
# 業種・等級要件の判定
# *   - 全省庁統一 or 特定省庁 or その他 の3パターンに分岐
# *   - 必要に応じて地域要件 / 営業品目要件 / 等級(A～D) / スコア(点数)などをチェック
# *   - 各ステップで詳細ログ(Logger.log)を出し、判定理由を追跡可能にする
#######################################

def getAgencyAreas(ministry):
    if ministry == "全省庁統一":
        return ["北海道", "東北", "関東・甲信越", "東海・北陸", "近畿", "中国", "四国", "九州・沖縄"]
    elif ministry == "防衛省":
        return ["北海道", "帯広", "東北", "北関東", "南関東", "近畿中部", "中国四国", "九州", "熊本", "沖縄"]
    elif ministry == "法務省":
        return [
          "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島", "東京", "神奈川", "埼玉", "千葉",
          "茨城", "栃木", "群馬", "山梨", "新潟", "長野", "富山", "石川", "福井", "愛知", "岐阜",
          "静岡", "三重", "大阪", "兵庫", "京都", "滋賀", "奈良", "和歌山", "鳥取", "島根", "岡山",
          "広島", "山口", "徳島", "香川", "愛媛", "高知", "福岡", "佐賀", "長崎", "熊本", "大分",
          "宮崎", "鹿児島", "沖縄", "石狩", "渡島", "檜山", "後志", "空知", "上川", "留萌", "宗谷",
          "オホーツク", "胆振", "日高", "十勝", "釧路", "根室"
        ]
    elif ministry == "財務省":
        return ["北海道", "東北", "関東", "北陸", "東海", "近畿", "中国", "四国", "九州", "福岡"]
    elif ministry == "厚生労働省":
        return ["北海道", "東北", "関東・甲信越", "東海・北陸", "近畿", "中国", "四国", "九州・沖縄"]
    elif ministry == "林野庁":
        return ["本庁", "北海道", "東北", "関東", "中部", "近畿・中国", "四国", "九州"]
    elif ministry == "経済産業省":
        return ["北海道", "東北・関東・甲信越", "東海・北陸", "近畿", "中国", "四国", "九州・沖縄"]
    elif ministry == "内閣府":
        return ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州"]
    elif ministry == "農林水産省地方農政局":
        return ["東北", "関東", "北陸", "東海", "近畿", "中国", "九州"]
    elif ministry == "最高裁判所":
        return [
          "青森", "岩手", "宮城", "秋田", "山形", "福島", "茨城", "栃木", "群馬", "埼玉", "千葉",
          "東京", "神奈川", "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡",
          "愛知", "三重", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山", "鳥取", "島根",
          "岡山", "広島", "山口", "徳島", "香川", "長崎", "熊本", "大分", "宮崎", "鹿児島",
          "沖縄", "石狩", "渡島", "檜山", "後志", "空知", "上川", "留萌", "宗谷", "オホーツク",
          "胆振", "日高", "十勝", "釧路", "根室"
        ]
    elif ministry == "国土交通省大臣官房会計課所掌機関":
        return [
          "北海道運輸局", "東北運輸局", "関東運輸局", "北陸信越運輸局", "中部運輸局", "近畿運輸局",
          "神戸運輸監理部", "中国運輸局", "四国運輸局", "九州運輸局", "航空局", "東京航空局",
          "大阪航空局", "海上保安庁", "海上保安大学校", "海上保安学校", "第一管区海上保安本部",
          "第二管区海上保安本部", "第三管区海上保安本部", "第四管区海上保安本部", "第五管区海上保安本部",
          "第六管区海上保安本部", "第七管区海上保安本部", "第八管区海上保安本部", "第九管区海上保安本部",
          "第十管区海上保安本部", "第十一管区海上保安本部", "札幌管区気象台", "仙台管区気象台",
          "東京管区気象台", "大阪管区気象台", "福岡管区気象台", "沖縄気象台", "運輸安全委員会",
          "国土技術政策総合研究所(横須賀庁舎)", "海難審判所"
        ]
    elif ministry == "環境省":
        return ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州", "沖縄"]
    elif ministry == "国土交通省北海道開発局":
        return ["札幌", "函館", "小樽", "旭川", "室蘭", "釧路", "帯広", "網走", "留萌", "稚内", "本局"]
    else:
        return []

# 等級(A/B/C/D)の比較判定
def checkGrade(licenseGrade, requiredGrade, comparison):
    grades = ["A", "B", "C", "D"]
    if licenseGrade in grades:
        licIndex = grades.index(licenseGrade)
    else:
        licIndex = -1
    
    if requiredGrade in grades:
        reqIndex = grades.index(requiredGrade)
    else:
        reqIndex = -1

    if licIndex < 0 or reqIndex < 0:
        return False

    if comparison == "以上":
        result = (licIndex <= reqIndex)
    elif comparison == "以下":
        result = (licIndex >= reqIndex)
    else:
        result = (licIndex == reqIndex)

    return result

# スコア(点数)の比較判定
def checkScore(licenseScore, requiredScore, comparison=None):
    result = False
    if comparison == "以上":
        result = licenseScore >= requiredScore
    elif comparison == "以下":
        result = licenseScore <= requiredScore
    elif comparison == "超":
        result = licenseScore > requiredScore
    elif comparison == "未満":
        result = licenseScore < requiredScore
    return result

# (A) 全省庁統一資格のチェック
def checkAllMinistryUnified(requiredItems, agencyMap, officeLicenses, constructionMap, requiredGrade, gradeComparison, requiredScore, scoreComparison):
    #unifiedLicenses = officeLicenses.filter(lic => {
    #    agInfo = agencyMap[lic.agency_no];
    #    if not agInfo:
    #        return False
    #    return agInfo.agency_name == "全省庁統一")
    def _filter(lic):
        agInfo = agencyMap[lic["agency_no"]]
        if not agInfo:
            return False
        return agInfo["agency_name"] == "全省庁統一"

    unifiedLicenses = [v for v in officeLicenses if _filter(v)]

    if len(unifiedLicenses) == 0:
        return {
            "is_ok": False,
            "reason": "業種・等級要件：全省庁統一資格を保有していません"
        }

    if len(requiredItems) > 0:
        matchingLicenses = []
        for lic in unifiedLicenses:
            cInfo = constructionMap[fr"{int(lic['construction_no']):04}"]
            if not cInfo:
                continue

            # --- (1) ここで「処理が間違っているか？」を分けてロギング ---
            itemMatched = False
            for reqItem in requiredItems:
                if cInfo["construction_name"].find(reqItem) >= 0: # indexOf
                    itemMatched = True
                    break
            
            if itemMatched:
                matchingLicenses.append(lic)

        if len(matchingLicenses) == 0:
            return {
                "is_ok": False,
                "reason": fr"業種・等級要件：全省庁統一資格で必要な営業品目({"、".join(requiredItems)})を保有していません"
            }

        if requiredGrade:
            gradeLicenses = []
            for lic in matchingLicenses:
                if not lic["license_grade"]:
                    continue
                if checkGrade(
                    licenseGrade = lic["license_grade"], 
                    requiredGrade = requiredGrade, 
                    comparison = gradeComparison
                    ):
                    gradeLicenses.append(lic)

            if len(gradeLicenses) == 0:
                return {
                    "is_ok": False,
                    "reason": fr"業種・等級要件：全省庁統一資格で{requiredGrade}等級{gradeComparison}の条件を満たしていません"
                }

            if requiredScore:
                scoreLicenses = []
                for lic in gradeLicenses:
                    if type(lic["license_score"]) != 'number':
                        continue
                    if checkScore(lic["license_score"], requiredScore, scoreComparison):
                        scoreLicenses.append(lic)

                if len(scoreLicenses) == 0:
                    return {
                        "is_ok": False,
                        "reason": fr"業種・等級要件：全省庁統一資格で{requiredScore}点{scoreComparison}の条件を満たしていません"
                    }

    # ... 地域要件などは同様 ...
    return {
      "is_ok": True,
      "reason": "業種・等級要件：全省庁統一資格の条件を満たしています"
    }

# (B) 特定省庁パターン
def checkSpecificAgency(agency, agencyMap, officeLicenses, constructionMap, requiredItems, requiredGrade, gradeComparison, requiredScore, scoreComparison):
    # specificLicenses = officeLicenses.filter(lic => {
    def _filter(lic):
        agInfo = agencyMap[lic["agency_no"]]
        if not agInfo:
            return False
        if agInfo["agency_name"] == agency:
            return True
        if agInfo["parent_agency_no"]:
            parent = agencyMap.get(agInfo["parent_agency_no"])
            if parent and parent["agency_name"] == agency:
                return True
        return False
    specificLicenses = [v for v in officeLicenses if _filter(v)]

    if len(specificLicenses) == 0:
        return {
            "is_ok": False,
            "reason": fr"業種・等級要件：{agency}の資格を保有していません"
        }

    if len(requiredItems) > 0:
        matchingLicenses = []
        for lic in specificLicenses:
            cInfo = constructionMap[fr"{int(lic['construction_no']):04}"]
            if not cInfo:
                continue
            itemMatched = False
            for reqItem in requiredItems:
                if cInfo["construction_name"].find(reqItem) >= 0:
                    itemMatched = True
                    break
        if itemMatched:
            matchingLicenses.append(lic)

        if len(matchingLicenses) == 0:
            return {
                "is_ok": False,
                "reason": fr"業種・等級要件：{agency}資格で必要な営業品目({"、".join(requiredItems)})を保有していません"
            }

        if requiredGrade:
            gradeLicenses = []
            for lic in matchingLicenses:
                if not lic["license_grade"]:
                    continue
                if checkGrade(
                    licenseGrade = lic["license_grade"], 
                    requiredGrade = requiredGrade, 
                    comparison = gradeComparison
                    ):
                    gradeLicenses.append(lic)

            if len(gradeLicenses) == 0:
                return {
                    "is_ok": False,
                    "reason": fr"業種・等級要件：{agency}資格で{requiredGrade}等級{gradeComparison}の条件を満たしていません"
                }

            if requiredScore:
                scoreLicenses = []
                for lic in gradeLicenses:
                    if type(lic["license_score"]) != "number":
                        continue
                    if checkScore(lic.license_score, requiredScore, scoreComparison):
                        scoreLicenses.append(lic)
                if len(scoreLicenses) == 0:
                    return {
                        "is_ok": False,
                        "reason": fr"業種・等級要件：{agency}資格で{requiredScore}点{scoreComparison}の条件を満たしていません"
                    }

    return {
        "is_ok": True, 
        "reason": fr"業種・等級要件：{agency}資格の条件を満たしています"
    }


# (C) 資格タイプが特定できない場合（デフォルト）
def checkDefault(requiredItems, officeLicenses, constructionMap, agencyMap, requiredGrade, gradeComparison, requiredScore, scoreComparison, requiredAreas):
    if len(requiredItems) > 0:
        matchingLicenses = []
        for lic in officeLicenses:
            cInfo = constructionMap[fr"{int(lic['construction_no']):04}"]
            if not cInfo:
                continue
            itemMatched = False
            for reqItem in requiredItems:
                if cInfo["construction_name"].find(reqItem) >= 0:
                    itemMatched = True
                    break
                #else:
                #    Logger.log("        => not matched => indexOf(...) < 0");
            if itemMatched:
                matchingLicenses.append(lic)

        if len(matchingLicenses) == 0:
            return {
                "is_ok": False,
                "reason": fr"業種・等級要件：必要な営業品目({"、".join(requiredItems)})を保有していません"
            }

        if requiredGrade:
            gradeLicenses = []
            for lic in matchingLicenses:
                if not lic["license_grade"]:
                    continue
                if checkGrade(
                    licenseGrade = lic["license_grade"], 
                    requiredGrade = requiredGrade, 
                    comparison = gradeComparison
                    ):
                    gradeLicenses.append(lic)
                    
            if len(gradeLicenses) == 0:
                return {
                    "is_ok": False,
                    "reason": fr"業種・等級要件：{requiredGrade}等級{gradeComparison}の条件を満たしていません"
                }

            if requiredScore:
                scoreLicenses = []
                for lic in gradeLicenses:
                    if type(lic["license_score"]) != "number":
                        continue
                    if checkScore(lic["license_score"], requiredScore, scoreComparison):
                        scoreLicenses.append(lic)
                if len(scoreLicenses) == 0:
                    return {
                        "is_ok": False,
                        "reason": fr"業種・等級要件：{requiredScore}点{scoreComparison}の条件を満たしていません"
                    }

    # 地域要件
    if len(requiredAreas) > 0:
        areaLicenses = []
        for lic in officeLicenses:
            agInfo = agencyMap.get(lic["agency_no"])
            if not agInfo or not agInfo["gency_area"]:
                continue

            areaMatched = False
            for area in requiredAreas:
                if area in agInfo["agency_area"]:
                    areaMatched = True
                    break
            if areaMatched:
                areaLicenses.append(lic)
        if len(areaLicenses) == 0:
            return {
                "is_ok": False,
                "reason": fr"業種・等級要件：必要な地域({"、".join(requiredAreas)})の登録がありません"
            }

    return {
        "is_ok": True, 
        "reason": "業種・等級要件：営業品目の条件を満たしています"
    }


def checkGradeAndItemRequirement(
        requirementText, 
        companyNo, 
        officeNo,
        licenseData = pd.read_csv("data/master/office_registration_authorization_master.txt",sep="\t", converters={"construction_id": lambda x: str(x)}),
        agencyData = pd.read_csv("data/master/agency_master.txt",sep="\t"),
        constructionData = pd.read_csv("data/master/construction_master.txt",sep="\t")
    ):
    # ----------------------------------------
    #  1. 要件テキストから必要な情報を抽出
    # ----------------------------------------

    # (A) 全省庁統一資格かどうか
    # isAllMinistryUnified = /全省庁統一/.test(requirementText);
    isAllMinistryUnified = bool(re.search("全省庁統一", requirementText))
    # (B) 特定省庁
    specificAgency = None

    # agencyMatch = requirementText.match(/(防衛省|国土交通省|法務省|財務省|文部科学省|厚生労働省|農林水産省|経済産業省|環境省|内閣府)/);
    agencyMatch = re.search(r"(防衛省|国土交通省|法務省|財務省|文部科学省|厚生労働省|農林水産省|経済産業省|環境省|内閣府)", requirementText)
    if agencyMatch:
        specificAgency = agencyMatch[1]

    # (C) 等級要件(A～D)
    requiredGrade = None
    gradeComparison = "等しい"
    # gradeMatch = requirementText.match(/([A-D])(?:等級以上|以上の等級|等級|という等級|以上|等級以下|以下)/)
    gradeMatch = re.search(r"([A-D])(?:等級以上|以上の等級|等級|という等級|以上|等級以下|以下)", requirementText)
    if gradeMatch:
        requiredGrade = gradeMatch[1]
        # if (gradeMatch[0].includes("以上")) {
        if "以上" in gradeMatch[0]:
            gradeComparison = "以上"
        #} else if (gradeMatch[0].includes("以下")) {
        elif "以下" in gradeMatch[0]:
            gradeComparison = "以下"

    # (D) 点数要件(例: "1200点以上"など)
    requiredScore = None
    scoreComparison = "以上"
    # scoreMatch = requirementText.match(/(\d+)点(以上|以下|超|未満)?/);
    # requirementText = "1200点以上"
    # requirementText = "1200点"
    scoreMatch = re.search(r"(\d+)点(以上|以下|超|未満)?", requirementText)
    if scoreMatch:
        requiredScore = int(scoreMatch[1])
        scoreComparison = scoreMatch[2] or "以上"

    # (E) 営業品目の抽出
    requiredItems = []
    constructionItems = [
        "土木", "建築", "大工", "左官", "とび、土工、コンクリート", "石", "屋根", "電気", "管",
        "タイル、れんが、ブロック", "鋼構造物", "鉄筋", "舗装", "しゅんせつ", "板金", "ガラス",
        "塗装", "防水", "内装仕上", "機械装置", "熱絶縁", "電気通信", "造園", "さく井", "建具",
        "水道施設", "消防施設", "清掃施設", "解体", "その他", "グラウト", "維持", "自然環境共生",
        "水環境処理"
    ]
    unifiedCategories = [
        "物品の製造", "物品の販売", "役務の提供等", "物品の買受け"
    ]
    specificItems = [
        "衣服・その他繊維製品類", "ゴム・皮革・プラスチック製品類", "窯業・土石製品類",
        "非鉄金属・金属製品類", "フォーム印刷類", "その他印刷類", "図書類", "電子出版物類",
        "紙・紙加工品類", "車両類", "その他輸送・搬送機械器具類", "船舶類", "燃料類", "家具・什器類",
        "一般・産業用機器類", "電気・通信用機器類", "電子計算機類", "精密機器類", "医療用機器類",
        "事務用機器類", "その他機器類", "医薬品・医療用品類", "事務用品類", "土木・建設・建築材料類",
        "警察用装備品類", "防衛用装備品類", "その他類", "広告・宣伝類", "写真・製図類", "調査・研究類",
        "情報処理類", "翻訳・通訳・速記類", "ソフトウェア開発類", "会場等の借り上げ類", "賃貸借類",
        "建物管理等各種保守管理類", "運送類", "車両整備類", "船舶整備類", "電子出版類",
        "防衛用装備品類の整備類", "立木竹類"
    ]
    #for item in [...constructionItems, ...unifiedCategories, ...specificItems]:
    for item in [*constructionItems, *unifiedCategories, *specificItems]:
        if item in requirementText:
            requiredItems.append(item)

    # (F) 地域要件の抽出
    requiredAreas = []
    if specificAgency:
        agencyAreas = getAgencyAreas(specificAgency)
        for area in agencyAreas:
            if area in requirementText:
                requiredAreas.append(area)
    else:
        standardAreas = getAgencyAreas("全省庁統一")
        for area in standardAreas:
            if area in requirementText:
                requiredAreas.append(area)

    # 2. 拠点登録許可マスター (officeLicenses) を取得
    # licenseSheet = getSheetByName("拠点登録許可マスター")
    # licenseData = licenseSheet.getDataRange().getValues();
    # licenseData = None
    officeLicenses = []
    subset_data = licenseData[licenseData["office_id"]==officeNo]
    for index, row in subset_data.iterrows():
        officeLicenses.append({
            "agency_no": row["agency_id"],
            "construction_no": row["construction_id"],
            "license_grade": row["license_grade"],
            "license_score": row["license_score"],
            "is_suspended": row["is_suspended"]
        })

    # === (C) 取得ライセンス ===
    if len(officeLicenses) == 0:
        return {
            "is_ok": False,
            "reason": fr"業種・等級要件：拠点ID={officeNo}にライセンス情報がありません"
        }

    # 3. 発注機関マスターを取得
    # agencyData = pd.read_csv("data/master/agency_master.txt",sep="\t")
    agencyMap = {}
    for index, row in agencyData.iterrows():
        agencyMap[row["agency_id"]] = {
            "agency_name": row["agency_name"],
            "parent_agency_no": row["parent_agency_id"],
            "agency_area": row["agency_area"]
        }

    # 4. 営業品目マスターを取得
    # constructionData = pd.read_csv("data/master/construction_master.txt",sep="\t")
    constructionMap = {}
    for index, row in constructionData.iterrows():
        constructionMap[ f"{row['construction_id']:04d}" ] = {
            "construction_name": row["construction_name"],
            "category_segment": row["category_segment"]
        }
    
    # 5. ライセンス情報をチェック (全省庁統一 / 特定省庁 / デフォルト)
    if isAllMinistryUnified:
        return checkAllMinistryUnified(
            requiredItems=requiredItems, 
            agencyMap=agencyMap, 
            officeLicenses=officeLicenses, 
            constructionMap=constructionMap, 
            requiredGrade=requiredGrade, 
            gradeComparison = gradeComparison, 
            requiredScore=requiredScore, 
            scoreComparison=scoreComparison
        )
    elif specificAgency:
        return checkSpecificAgency(
            agency=specificAgency, 
            agencyMap=agencyMap, 
            officeLicenses=officeLicenses, 
            constructionMap=constructionMap, 
            requiredItems=requiredItems, 
            requiredGrade=requiredGrade, 
            gradeComparison=gradeComparison, 
            requiredScore=requiredScore, 
            scoreComparison=scoreComparison
        )
    else:
        return checkDefault(requiredItems=requiredItems, officeLicenses=officeLicenses, constructionMap=constructionMap, agencyMap=agencyMap, requiredGrade=requiredGrade, gradeComparison=gradeComparison, requiredScore=requiredScore, scoreComparison=scoreComparison, requiredAreas=requiredAreas)


if __name__ == "__main__":
    companyNo = 1
    officeNo = 1
    requirementText = "令和07・08・09年度防衛省競争参加資格(全省庁統一資格)の「役務の提供等」において、開札時までに「C」又は「D」の等級に格付けされ北海道地域の競争参加を希望する者であること"

    print(checkGradeAndItemRequirement(requirementText, companyNo, officeNo))


