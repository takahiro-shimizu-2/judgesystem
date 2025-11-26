# coding: utf-8 -*-

import re
import pandas as pd
import datetime

#######################################
# 技術者要件の判定
# ※requirementType === "技術者要件"の場合。
#######################################

def getEquivalentQualifications():
    # 要件定義未完了のため空のオブジェクトを返す
    return {}

# 全資格リストを取得
def getAllQualificationsList():
    return [
        "監理技術者資格者証",
        "監理技術者講習修了証",
        "1級建設機械施工管理技士",
        "2級建設機械施工管理技士",
        "1級土木施工管理技士",
        "1級土木施工管理技士補",
        "2級土木施工管理技士",
        "2級土木施工管理技士補",
        "1級建築施工管理技士",
        "1級建築施工管理技士補",
        "2級建築施工管理技士",
        "2級建築施工管理技士補",
        "1級電気工事施工管理技士",
        "1級電気工事施工管理技士補",
        "2級電気工事施工管理技士",
        "2級電気工事施工管理技士補",
        "1級管工事施工管理技士",
        "1級管工事施工管理技士補",
        "2級管工事施工管理技士",
        "2級管工事施工管理技士補",
        "1級電気通信工事施工管理技士",
        "2級電気通信工事施工管理技士",
        "1級造園施工管理技士",
        "1級造園施工管理技士補",
        "2級造園施工管理技士",
        "2級造園施工管理技士補",
        "1級建築士",
        "2級建築士",
        "木造建築士",
        "建築設備士",
        "建設(「鋼構造及びコンクリート」)・総合技術監理(建設)(「鋼構造及びコンクリート」)",
        "建設(「鋼構造及びコンクリート」を除く)・総合技術監理(建設)(「鋼構造及びコンクリート」を除く)",
        "農業「農業農村工学」・総合技術監理(農業「農業農村工学」)",
        "電気電子・総合技術監理(電気電子)",
        "機械「熱・動力エネルギー機器」又は「流体機器」・総合技術監理(機械「熱・動力エネルギー機器」又は「流体機器」)",
        "機械「熱・動力エネルギー機器」及び「流体機器」を除く・総合技術監理(機械「熱・動力エネルギー機器」及び「流体機器」を除く)",
        "上下水道「上下水道及び工業用水道」・総合技術監理(上下水道「上下水道及び工業用水道」)",
        "上下水道(「下水道」)・総合技術監理(上下水道)(「下水道」)",
        "水産「水産土木」・総合技術監理(水産「水産土木」)",
        "森林「林業・林産」・総合技術監理(森林「林業・林産」)",
        "森林「森林土木」・総合技術監理(森林「森林土木」)",
        "衛生工学「水質管理」・総合技術監理(衛生工学「水質管理」)",
        "衛生工学「廃棄物・資源循環」・総合技術監理(衛生工学「廃棄物・資源循環」)",
        "衛生工学「建築物環境衛生管理」・総合技術監理(衛生工学「建築物環境衛生管理」)",
        "第1種電気工事士",
        "第2種電気工事士",
        "電気主任技術者",
        "電気通信主任技術者",
        "工事担任者(第一級アナログ通信及び第一級デジタル通信の両方)の交付を受けた者",
        "工事担任者(総合通信)の交付を受けた者",
        "給水装置工事主任技術者",
        "甲種消防設備士",
        "乙種消防設備士",
        "1級建築大工",
        "2級建築大工",
        "1級型枠施工",
        "2級型枠施工",
        "1級左官",
        "2級左官",
        "1級とび",
        "2級とび",
        "1級コンクリート圧送施工",
        "2級コンクリート圧送施工",
        "1級ウェルポイント施工",
        "2級ウェルポイント施工",
        "1級冷凍空気調和機器施工",
        "2級冷凍空気調和機器施工",
        "1級配管(選択科目「建築配管作業」)",
        "2級配管(選択科目「建築配管作業」)",
        "1級タイル張り",
        "2級タイル張り",
        "1級築炉",
        "2級築炉",
        "1級ブロック建築",
        "2級ブロック建築",
        "1級石材施工",
        "2級石材施工",
        "1級鉄工",
        "2級鉄工",
        "1級鉄筋施工(選択科目「鉄筋施工図作成作業」及び「鉄筋組立て作業」)",
        "2級及び3級鉄筋施工(選択科目「鉄筋施工図作成作業」及び「鉄筋組立て作業」)",
        "1級建築板金",
        "2級建築板金",
        "1級建築板金「ダクト板金作業」",
        "2級建築板金「ダクト板金作業」",
        "1級建築板金「ダクト板金作業」以外",
        "2級建築板金「ダクト板金作業」以外",
        "1級かわらぶき",
        "2級かわらぶき",
        "1級ガラス施工",
        "2級ガラス施工",
        "1級塗装",
        "2級塗装",
        "路面標示施工",
        "1級製作・内装仕上げ施工・裱装",
        "2級製作・内装仕上げ施工・裱装",
        "1級熱絶縁施工",
        "2級熱絶縁施工",
        "1級建具製作・カーテンウォール施工・サッシ施工",
        "2級建具製作・カーテンウォール施工・サッシ施工",
        "1級造園",
        "2級造園",
        "1級防水施工",
        "2級防水施工",
        "1級さく井",
        "2級さく井",
        "地すべり防止工事士",
        "基礎ぐい工事",
        "1級計装士",
        "解体工事施工技士",
        "登録電気工事基幹技能者",
        "登録橋梁基幹技能者",
        "登録造園基幹技能者",
        "登録コンクリート圧送基幹技能者",
        "登録防水基幹技能者",
        "登録トンネル基幹技能者",
        "登録建設塗装基幹技能者",
        "登録左官基幹技能者",
        "登録機械土工基幹技能者",
        "登録海上起重基幹技能者",
        "登録PC基幹技能者",
        "登録鉄筋基幹技能者",
        "登録圧接基幹技能者",
        "登録型枠基幹技能者",
        "登録配管基幹技能者",
        "登録鳶・土工基幹技能者",
        "登録切断穿孔基幹技能者",
        "登録内装仕上工事基幹技能者",
        "登録サッシ・カーテンウォール基幹技能者",
        "登録エクステリア基幹技能者",
        "登録ALC基幹技能者",
        "登録建築板金基幹技能者",
        "登録外壁仕上基幹技能者",
        "登録ダクト基幹技能者",
        "登録保温保冷基幹技能者",
        "登録ウレタン断熱基幹技能者",
        "登録グラウト基幹技能者",
        "登録冷凍空調基幹技能者",
        "登録運搬施設基幹技能者",
        "登録基礎工基幹技能者",
        "登録タイル張り基幹技能者",
        "登録標識・路面標示基幹技能者",
        "登録土工基幹技能者",
        "登録発破・破砕基幹技能者",
        "登録圧入基幹技能者",
        "登録送電線工事基幹技能者",
        "登録消化設備基幹技能者",
        "登録建築大工基幹技能者",
        "登録建築測量基幹技能者",
        "登録硝子工事基幹技能者",
        "登録さく井基幹技能者",
        "登録解体基幹技能者",
        "登録あと施工アンカー基幹技能者",
        "登録計装基幹技能者",
        "登録土質改良基幹技能者",
        "登録都市トンネル基幹技能者",
        "登録潜函基幹技能者"
    ]


# 資格連番から資格名を取得
def getQualificationName(qualificationNo, qualMasterData=pd.read_csv("data/master/technician_qualification_master.txt", sep="\t")):
    #const qualMasterSheet = getSheetByName("技術者資格マスター");
    #const qualMasterData = qualMasterSheet.getDataRange().getValues();
    qualifications = []

    # 技術者資格マスターの構造:
    # 0: 資格連番
    # 1: 資格名称
    # 2: 種別
    # ...

    subData = qualMasterData[qualMasterData["qualification_id"] == qualificationNo]
    if subData.shape[0] == 0:
        return None
    elif subData.shape[0] > 1:
        print("WARNING: 複数の資格連番が存在します。qualificationNo=" + str(qualificationNo))
        subData = subData.iloc[0:1]

    # 種別があれば付加する
    if subData["qualification_type"]:
        return subData["qualification_name"] + "(" + subData["qualification_type"] + ")"
    else:
        return subData["qualification_name"]

    return None


def getEmployeeQualifications(
        companyNo, 
        officeNo, 
        employeeData=pd.read_csv("data/master/employee_master.txt", sep="\t"), 
        qualData=pd.read_csv("data/master/employee_qualification_master.txt", sep="\t"), 
        qualMasterData=pd.read_csv("data/master/technician_qualification_master.txt", sep="\t")
        ):
    # 1. 従業員マスターから対象拠点の従業員を取得
    # employeeData = pd.read_csv("data/master/employee_master.txt", sep="\t")
    employees = []

    # 従業員マスターの構造:
    # 0: employee_no(id)
    # 1: company_no(id)
    # 2: office_no(id)
    # 3: employee_name
    # 4: birthdate
    # 5: is_retired_flg
    # 6: contact_info
    # ...

    # 指定された会社に所属し、退職していない従業員を抽出
    # 特定の拠点が指定されている場合はそれもチェック
    subData = employeeData[(employeeData["company_id"] == companyNo) & (employeeData["is_retired_flg"])]
    subData = subData[(employeeData["office_id"] == officeNo)]

    # 欠損対応は必要？
    for index, row in subData.iterrows():
        employees.append({
            "employee_no": row["employee_id"],
            "employee_name": row["employee_name"],
            "office_no": row["office_nid"]
        })

    if len(employees) == 0:
        return []

    # 2. 従業員資格マスターから資格情報を取得
    # qualData = pd.read_csv("data/master/employee_qualification_master.txt", sep="\t")
    qualifications = []

    # 従業員資格マスターの構造:
    # 0: employee_qual_no(id)
    # 1: employee_no(id)
    # 2: qualification_no(id)
    # 3: obtained_date
    # 4: license_number
    # 5: is_active_flg
    # ...

    #employeeIds = employees.map(emp => emp.employee_no)
    employeeIds = [emp["employee_no"] for emp in employees]

    # for (let i = 1; i < qualData.length; i++) {
    for index, row in qualData.iterrows():
        employeeNo = row["employee_id"]
        # 対象従業員の資格で、有効なものを抽出
        if employeeNo in employeeIds and row["is_active_flg"]:
            # 技術者資格マスターから資格名を取得
            qualificationName = getQualificationName(qualificationNo=row["qualification_id"], qualMasterData=qualMasterData)

            if qualificationName:
                # 該当する従業員情報を取得
                # employee = employees.find(emp => emp.employee_no === employeeNo)
                employee = next((emp for emp in employees if emp["employee_no"] == employeeNo), None)
                qualifications.push({
                    "employee_no": employeeNo,
                    "employee_name": employee["employee_name"] if employee else "不明",
                    "office_no": employee["office_no"] if employee else None,
                    "qualification_name": qualificationName,
                    "obtained_date": row["obtained_date"],
                    "is_active": row["is_active_flg"]
                })

    return qualifications



# 指定された企業・拠点に所属する従業員の実務経験情報を取得
def getEmployeeExperiences(companyNo, officeNo, employeeData = pd.read_csv("data/master/employee_master.txt", sep="\t"), expData = pd.read_csv("data/master/technician_experience_master.txt", sep="\t")):
    # 1. 従業員マスターから対象拠点の従業員を取得
    # employeeData = pd.read_csv("data/master/employee_master.txt", sep="\t")
    employees = []

    subData = employeeData[(employeeData["company_id"]==companyNo) & (employeeData["is_retired_flg"])]
    for index, row in subData.iterrows():
        if row["office_id"] == officeNo:
            employees.append({
                "employee_no": row["employee_id"],
                "employee_name": row["employee_name"],
                "office_no": row["office_id"]
            })
    if len(employees) == 0:
        return []

    # 2. 従業員工事経験マスターから経験情報を取得
    # expSheet = getSheetByName("従業員工事経験マスター")
    # expData = pd.read_csv("data/master/technician_experience_master.txt", sep="\t")
    experiences = []

    # 従業員工事経験マスターの構造:
    # 0: employee_experience_no
    # 1: employee_no
    # 2: project_name
    # 3: role_position
    # 4: start_date
    # 5: end_date
    # 6: agency_no
    # 7: construction_no
    # 8: is_original_contractor_flg
    # 9: final_score
    # ...

    # employeeIds = employees.map(emp => emp.employee_no)
    employeeIds = [v["employee_no"] for v in employees]

    subData = expData["employee_no"].isin(employeeIds)
    for index, row in subData.iterrows():
        employee = next((emp for emp in employees if emp["employee_no"] == row["employee_no"]), None)
        experiences.append({
            "employee_no": row["employee_no"],
            "employee_name": employee["employee_name"] if employee else "不明",
            "office_no": employee["office_no"] if employee else None,
            "project_name": row["project_name"],
            "role_position": row["role_position"],
            "start_date": row["start_date"],
            "end_date": row["end_date"],
            "agency_no": row["agency_id"],
            "construction_no": row["construction_id"],
            "is_original_contractor": row["is_original_contractor_flg"],
            "final_score": row["final_score"]
        })

    return experiences



def extractTechnicianRequirements(text):
    # 結果を格納するオブジェクト
    requirements = {
        "requiredQualifications": [],  # 必要資格のリスト
        "needsMonitoringEngineer": False, # 監理技術者必須か
        "needsSupervisingEngineer": False,  # 主任技術者必須か
        "needsDedicatedTechnician": False, # 専任が必要か
        "requiresExperience": False,   # 経験が必要か
        "experienceYears": None,       # 経験年数
        "experienceScore": None,       # 要求工事成績点数
        "alternativeQualifications": {} # 同等資格のマッピング（空オブジェクト）
    }

    # 小文字・全角半角統一して検索を容易に
    normalizedText = text.lower()

    # 1. 専任要件の確認
    if "専任" in normalizedText or "専任の" in normalizedText or "専任で" in normalizedText:
        requirements["needsDedicatedTechnician"] = True

    # 2. 監理技術者要件の確認
    if '監理技術者' in normalizedText or '監理技術者資格者証' in normalizedText:
        requirements["needsMonitoringEngineer"] = True
        requirements["requiredQualifications"].append('監理技術者資格者証')

        # 監理技術者講習修了証も必要
        if '監理技術者講習' in normalizedText or '講習修了' in normalizedText:
            requirements["requiredQualifications"].append('監理技術者講習修了証')

    # 3. 主任技術者要件の確認
    if '主任技術者' in normalizedText:
        requirements["needsSupervisingEngineer"] = True

    # 4. 全資格リストとのマッチング
    allQualifications = getAllQualificationsList()
    for qual in allQualifications:
        # 種別を持つ特別な資格かチェック
        if qual == '2級土木施工管理技士' or qual == '2級建築施工管理技士' or qual == '電気主任技術者':
            # 完全一致の資格名がある場合（種別なし）
            if qual in text:
                requirements["requiredQualifications"].append(qual)

            # 種別付きのパターンを検索
            if qual == '2級土木施工管理技士':
                types = ['土木', '鋼構造物塗装', '薬液注入']
                for type_ in types:
                    if qual + '（' + type_ + '）' in text or qual + '(' + type_ + ')' in text or qual + type in text:
                        requirements["requiredQualifications"].append(qual + '（' + type_ + '）')
            elif qual == '2級建築施工管理技士':
                types = ['建築', '躯体', '仕上げ']
                for type_ in types:
                    if qual + '（' + type_ + '）' in text or qual + '(' + type_ + ')' in text or qual + type_ in text:
                        requirements["requiredQualifications"].append(qual + '（' + type_ + '）')

            elif qual == '電気主任技術者':
                types = ['1種', '2種', '3種']
                for type_ in types:
                    if qual + type_ in text or type_ + qual in text or '第' + type_ + qual in text:
                        requirements["requiredQualifications"].append(qual + '（' + type_ + '）')

        # 通常の資格（種別なし）
        elif qual in text:
            requirements["requiredQualifications"].append(qual)

    # 5. 同等資格の処理 - 要件定義未完了のため削除
    # 「同等」キーワードをチェックする部分を削除

    # 6. 実務経験要件の確認
    if '実務経験' in normalizedText or '経験年数' in normalizedText or '年以上の経験' in normalizedText:
        requirements["requiresExperience"] = True

        # 経験年数の抽出
        yearMatch = re.search(r"(\d+)年(?:以上の)?(?:実務)?経験", text)
        if yearMatch:
            requirements["experienceYears"] = int(yearMatch[1])

        # 工事成績要件の抽出
        scoreMatch = re.search(r"成績(?:評定)?(?:が|で)?(\d+)点以上", text)
        if scoreMatch:
            requirements["experienceScore"] = int(scoreMatch[1])

    return requirements




# 監理技術者要件の特別チェック - 元の関数名を維持
def checkMonitoringEngineerRequirement(employeeQualifications):
    try:
        # 監理技術者資格者証と講習修了証の両方が必要
        employeesWithCert = {}
        employeesWithTraining = {}

        for qual in employeeQualifications:
            if qual["qualification_name"] == "監理技術者資格者証":
                employeesWithCert[qual["employee_no"]] = qual["employee_name"]
            if qual["qualification_name"] == "監理技術者講習修了証":
                employeesWithTraining[qual["employee_no"]] = qual["employee_name"]

        # 両方の資格を持つ従業員を特定
        qualifiedEmployees = []
        for empNo in employeesWithCert:
            if employeesWithTraining[empNo]:
                qualifiedEmployees.append({
                    "name": employeesWithCert[empNo],
                    "qualifications": ["監理技術者資格者証", "監理技術者講習修了証"]
                })

        if len(qualifiedEmployees) == 0:
            return {
                "is_ok": False,
                "reason": "監理技術者資格者証と講習修了証の両方を持つ技術者がいません"
            }

        # 防御的プログラミング: nameプロパティのチェック
        # validEmployees = qualifiedEmployees.filter(emp => emp && emp.name)
        validEmployees = [emp for emp in qualifiedEmployees if emp and getattr(emp, "name", None)]
        # empNames = validEmployees.map(emp => emp.name)
        empNames = [emp["name"] for emp in validEmployees]

        return {
            "is_ok": True,
            "reason": fr"監理技術者の要件を満たす技術者が{len(validEmployees)}名います：" + empNames.join("、")
        }
    except:
        return {
            "is_ok": False,
            "reason": "監理技術者要件チェック中にエラーが発生しました"
        }

# 経験要件のチェック - 元の関数名を維持
def checkExperienceRequirements(requirements, employeeExperiences, matchingEmployees):
    try:
        # 防御的チェック
        if not isinstance(matchingEmployees,list) or len(matchingEmployees) == 0:
            return {
                "is_ok": False,
                "reason": "資格要件を満たす技術者がいません"
            }

        # 資格要件を満たす従業員のIDリスト
        # 防御的プログラミング: nameプロパティの存在チェック
        qualifiedEmployeeNames = []
        for emp in matchingEmployees:
            if emp and emp["name"]:
                qualifiedEmployeeNames.append(emp["name"])

        # 該当する従業員の経験のみフィルタリング
        #relevantExperiences = employeeExperiences.filter(exp =>
        #    qualifiedEmployeeNames.includes(exp.employee_name))
        relevantExperiences = [exp for exp in employeeExperiences if exp["employee_name"] in qualifiedEmployeeNames]

        if len(relevantExperiences) == 0:
            return {
                "is_ok": False,
                "reason": "資格要件を満たす技術者に工事経験がありません"
            }

        # 以下略（元の実装と同じ）
        # 経験年数要件のチェック
        if requirements["experienceYears"]:
            # 従業員ごとの経験期間を計算
            employeeExperienceYears = {}

            for exp in relevantExperiences:
                if not employeeExperienceYears[exp["employee_name"]]:
                    employeeExperienceYears[exp["employee_name"]] = 0

                # 開始日と終了日が正しい日付形式の場合のみ計算
                if isinstance(exp["start_date"], datetime) and isinstance(exp["end_date"], datetime):
                    diffTime = abs(exp["end_date"] - exp["start_date"])
                    diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25)
                    employeeExperienceYears[exp["employee_name"]] += diffYears

            # 要件年数を満たす従業員がいるかチェック
            experiencedEmployees = []
            for empName in employeeExperienceYears:
                if employeeExperienceYears[empName] >= requirements["experienceYears"]:
                    experiencedEmployees.append(empName)

            if len(experiencedEmployees) == 0:
                return {
                    "is_ok": False,
                    "reason": requirements["experienceYears"] + "年以上の実務経験を持つ技術者がいません"
                }

        # 工事成績要件のチェック
        if requirements["experienceScore"]:
            # 工事成績が要件を満たす経験があるかチェック
            #highScoreExperiences = relevantExperiences.filter(exp =>
            #    typeof exp.final_score === 'number' && exp.final_score >= requirements.experienceScore)
            highScoreExperiences = [exp for exp in relevantExperiences if type(exp["final_score"]) == "number" and exp["final_score"] >= requirements["experienceScore"]]
            if len(highScoreExperiences) == 0:
                return {
                    "is_ok": False,
                    "reason": "工事成績" + requirements["experienceScore"] + "点以上の実績を持つ技術者がいません"
                }

        return {
            "is_ok": True,
            "reason": "経験要件を満たしています"
        }
    except:
        return {
            "is_ok": False,
            "reason": "経験要件チェック中にエラーが発生しました"
        }

# 技術者要件成功理由の生成 - 元の関数名を維持
def generateTechnicianSuccessReason(matchingEmployees):
    try:
        # 防御的プログラミング: nullチェック、配列チェック
        if not matchingEmployees or not isinstance(matchingEmployees,list) or len(matchingEmployees) == 0:
            return "技術者要件を満たしています"

        # 最初の3名までの情報を表示
        # displayEmployees = matchingEmployees.slice(0, 3)
        displayEmployees = matchingEmployees[0:3]

        # 防御的プログラミング: map前に各要素の正当性チェック
        employeeInfos = []
        for emp in displayEmployees:
            if not emp or type(emp) != 'object':
                continue

        name = emp.get("name") or "不明な技術者"
        quals = "資格あり"

        if isinstance(emp["qualifications"], list):
            quals = emp.qualifications.join("、")

            employeeInfos.append(name + "（" + quals + "）")

        result = "技術者要件を満たす技術者が" + matchingEmployees.length + "名います："

        # 技術者情報がある場合は追加
        if len(employeeInfos) > 0:
            #result += employeeInfos.join("、")
            result += "、".join(employeeInfos)

            # 表示されていない技術者がいる場合
            if len(matchingEmployees) > 3:
                result += " ほか" + (matchingEmployees.length - 3) + "名"
        return result
    except:
        # エラーが発生した場合でも最低限の情報を返す
        return "技術者要件を満たしています（情報表示中にエラー）"


# 企業公告判定マスターのメッセージ欄を更新
def updateEvaluationMessage(companyNo, officeNo, message):
    print("No implementation.")
    return None

    # 企業公告判定マスターを更新する。
    #evalSheet = getSheetByName("企業公告判定マスター");
    evalData = None
    # 以下省略

# 要件と実際の資格・経験を照合 - 元の関数名を維持
def matchTechnicianRequirements(requirements, employeeQualifications, employeeExperiences):
    try:
        # 監理技術者資格要件がある場合の特別チェック
        if (requirements["needsMonitoringEngineer"]):
            monitoringResult = checkMonitoringEngineerRequirement(employeeQualifications)
            if not monitoringResult["is_ok"]:
                return monitoringResult

            # 監理技術者要件を満たす場合、他の一般的な資格要件は自動的にOK
            return {
                "is_ok": True,
                "reason": monitoringResult["reason"]
            }

        # 一般的な資格要件のチェック
        if requirements["requiredQualifications"] and len(requirements["requiredQualifications"]) > 0:
            # 各従業員が持つ資格をリスト化
            employeeQuals = {}
            for qual in employeeQualifications:
                if not employeeQuals[qual["employee_no"]]:
                    employeeQuals[qual["employee_no"]] = {
                        "name": qual["employee_name"],
                        "qualifications": []
                    }
                employeeQuals[qual["employee_no"]]["qualifications"].append(qual["qualification_name"])

            # 要求資格を1つ以上満たす従業員がいるかチェック
            qualificationMatch = False
            matchingEmployees = []

            for empNo in employeeQuals:
                emp = employeeQuals[empNo]
                hasRequiredQual = False
                matchedQuals = []

                # 必須資格のいずれかを持っているかチェック
                for reqQual in requirements["requiredQualifications"]:
                    if reqQual in emp["qualifications"]:
                        hasRequiredQual = True
                        matchedQuals.append(reqQual)

                if hasRequiredQual:
                    qualificationMatch = True
                    matchingEmployees.append({
                        "name": emp.name,
                        "qualifications": matchedQuals
                    })

            if not qualificationMatch:
                return {
                    "is_ok": False,
                    "reason": "必要な資格（" + requirements["requiredQualifications"].join("、") + "）を持つ技術者がいません"
                }

            # 経験要件のチェック
            if requirements["requiresExperience"]:
                experienceMatch = checkExperienceRequirements(requirements, employeeExperiences, matchingEmployees)
                if not experienceMatch["is_ok"]:
                    return experienceMatch

                # 資格と経験の両方を満たす場合
                return {
                    "is_ok": True,
                    "reason": generateTechnicianSuccessReason(matchingEmployees)
                }

            # 資格要件のみの場合
            return {
                "is_ok": True,
                "reason": generateTechnicianSuccessReason(matchingEmployees)
            }

        # 【ここが問題の原因】要件がない場合は自動的にOK
        # ここで原因となっていた generateTechnicianSuccessReason の呼び出しを回避
        return {
            "is_ok": True,
            "reason": "特定の技術者資格要件はありません"
        }
    except:
        # MyLogger.addError("TechnicianRequirement", "matchTechnicianRequirements",`マッチングエラー: ${e.message}`, false);

        return {
            "is_ok": False,
            "reason": "技術者要件マッチング中にエラーが発生しました"
        }


def checkTechnicianRequirement(
        requirementText, 
        companyNo, 
        officeNo,
        employeeData=pd.read_csv("data/master/employee_master.txt", sep="\t"), 
        qualData=pd.read_csv("data/master/employee_qualification_master.txt", sep="\t"), 
        qualMasterData=pd.read_csv("data/master/technician_qualification_master.txt", sep="\t"),
        expData = pd.read_csv("data/master/technician_experience_master.txt", sep="\t")
        ):
    try:
        # 1. 要件テキストから必要な資格や条件を抽出
        requirements = extractTechnicianRequirements(requirementText)

        # 専任要件の有無をチェック
        needsDedicatedTechnician = requirements["needsDedicatedTechnician"]

        # 2. 従業員資格マスターから会社・拠点の従業員資格を取得
        employeeQualifications = getEmployeeQualifications(
            companyNo=companyNo, 
            officeNo=officeNo,
            employeeData=employeeData, 
            qualData=qualData, 
            qualMasterData=qualMasterData
        )

        # 従業員資格がなければNG判定
        if not employeeQualifications or len(employeeQualifications) == 0:
            return {
                "is_ok": False,
                "reason": "技術者要件：従業員資格情報が見つかりません"
            }

        # 3. 従業員工事経験マスターから経験情報を取得（必要な場合）
        employeeExperiences = []
        if requirements["requiresExperience"]:
            employeeExperiences = getEmployeeExperiences(
                companyNo=companyNo, 
                officeNo=officeNo,
                employeeData = employeeData, 
                expData = expData
            )

        # 4. 要件と実際の資格・経験を照合
        matchResult = matchTechnicianRequirements(
            requirements=requirements, 
            employeeQualifications=employeeQualifications, 
            employeeExperiences=employeeExperiences
        )

        # 5. 企業公告判定マスターのメッセージ欄に専任要件を記録（必要な場合）
        if needsDedicatedTechnician:
            updateEvaluationMessage(
                companyNo=companyNo, 
                officeNo=officeNo, 
                message="技術者の専任配置が必要です"
            )
            #} catch (e) {
            #// メッセージ更新エラーは無視して続行
        # 6. 判定結果を返す
        if matchResult["is_ok"]:
            return {
                "is_ok": True,
                "reason": "技術者要件：" + matchResult["reason"]
            }
        else:
            return {
                "is_ok": False,
                "reason": "技術者要件：" + matchResult["reason"]
            }
    except Exception as e:
        # } catch (e) {
        # MyLogger.addError("TechnicianRequirement", "checkTechnicianRequirement",
        # `技術者要件判定エラー: ${e.message}`, false);

        # エラー時は技術者要件を満たしていないとする
        return {
            "is_ok": False,
            "reason": "技術者要件：判定処理中にエラーが発生しました"
        }


