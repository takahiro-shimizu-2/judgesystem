# coding: utf-8 -*-

import re
import pandas as pd


#######################################
# 所在地要件の判定
# ※requirementType === "所在地要件"の場合。
#######################################

# 管轄地域名（防衛局など）から対応する都道府県をリストで返す。
# agencyData:発注者機関マスターから、管轄地域情報を取得
def expandRegionToPrefectures(regionName=None, agencyData=pd.read_csv("data/master/agency_master.txt",sep="\t")):
    if regionName is None:
        regionName = "北海道"
        regionName = "東北"
    
    target_data = agencyData[(agencyData["agency_name"] == regionName) & (agencyData["agency_area"].notnull())]
    if target_data.shape[0] >= 1:
        agency_area = target_data["agency_area"]
        agency_area = [part.strip() for part in agency_area.str.split(",").tolist()[0]]
        return agency_area

    # 発注者機関マスターに該当がない場合、ハードコーディングされたマッピングを使用
    regionPrefectureMap = {
        "北海道防衛局": ["北海道"],
        "帯広防衛支局": ["北海道"],
        "東北防衛局": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
        "北関東防衛局": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "新潟県", "長野県"],
        "南関東防衛局": ["神奈川県", "山梨県", "静岡県"],
        "東海防衛支局": ["岐阜県", "愛知県", "三重県"],
        # 近畿中部防衛局に愛知県、岐阜県、三重県を含める
        "近畿中部防衛局": ["富山県", "石川県", "福井県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "愛知県", "岐阜県", "三重県"],
        "中国四国防衛局": ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"],
        "九州防衛局": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"],
        "沖縄防衛局": ["沖縄県"]
    }

    return regionPrefectureMap[regionName]

def getOfficeLocation(officeNo, officeData = pd.read_csv("data/master/office_master.txt",sep="\t")):
    
    target_data = officeData[officeData["office_no"] == officeNo]
    if target_data.shape[0] >= 1:
        officelocation = target_data["office_address"].tolist()[0]
        officetype = target_data["office_type"].tolist()[0]
        officeprefecture = target_data["Located_Prefecture"].tolist()[0]
        return officelocation, officetype, officeprefecture

    return "", "", ""


def expandOfficeType(officeType):
    # 拠点種別対応関係のマッピング
    if not officeType:
        return []

    result = [officeType] # 元の種別も含める

    # 拠点種別文字列を空白で分割して単語単位で検索（「東京建設 本社」→「本社」の抽出）
    parts = officeType.split()
    for part in parts:
        result.append(part)

    # 基本形の拠点種別を追加
    if '本社' in officeType or '本店' in officeType:
        result.extend(['本社', '本店', 'HEADQUARTER'])
    elif '支店' in officeType:
        result.extend(['支店', 'BRANCH'])
    elif '営業所' in officeType:
        result.extend(['営業所', 'SALES_OFFICE'])
    elif '出張所' in officeType:
        result.append('出張所')

    return list(set(result)) # 重複を排除


# extractLocationRequirements
# => 以下の3つを返す。処理を分けた。
#  return {
#    prefectures: extractedPrefectures,
#    regions: extractedRegions,
#    officeTypes: extractedOfficeTypes
#  };
def extractLocationRequirements(requirementText):
    1

def extractPrefectures(requirementText):
    extractedPrefectures = []

    # 都道府県名リスト（完全版のみ）
    PREFECTURE_PATTERNS = [
        "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
        "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
        "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
        "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
        "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
        "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
        "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
    ]

    # 省略版の都道府県名（単独で出現する場合のみ判定）
    SHORT_PREFECTURE_PATTERNS = {
        "北海道": "北海道",
        "青森": "青森県", "岩手": "岩手県", "宮城": "宮城県", "秋田": "秋田県", "山形": "山形県", "福島": "福島県",
        "茨城": "茨城県", "栃木": "栃木県", "群馬": "群馬県", "埼玉": "埼玉県", "千葉": "千葉県", "東京": "東京都", "神奈川": "神奈川県",
        "新潟": "新潟県", "富山": "富山県", "石川": "石川県", "福井": "福井県", "山梨": "山梨県", "長野": "長野県", "岐阜": "岐阜県",
        "静岡": "静岡県", "愛知": "愛知県", "三重": "三重県", "滋賀": "滋賀県", "京都": "京都府", "大阪": "大阪府", "兵庫": "兵庫県",
        "奈良": "奈良県", "和歌山": "和歌山県", "鳥取": "鳥取県", "島根": "島根県", "岡山": "岡山県", "広島": "広島県", "山口": "山口県",
        "徳島": "徳島県", "香川": "香川県", "愛媛": "愛媛県", "高知": "高知県", "福岡": "福岡県", "佐賀": "佐賀県", "長崎": "長崎県",
        "熊本": "熊本県", "大分": "大分県", "宮崎": "宮崎県", "鹿児島": "鹿児島県", "沖縄": "沖縄県"
    }

    # 特別なケース処理: 主要都道府県を完全一致で検出
    # 「東京都」と「京都府」の誤抽出問題(東京都に京都が含まれる？)を解決するために、明示的な検出を行う

    # 空白区切りで分割して単語単位での検証を行う
    words = re.split(r'[ 　,、。.・\s]+', requirementText)

    # 「〇〇都に」「〇〇県に」などのパターンを追加
    for pref in PREFECTURE_PATTERNS:
        if pref + "に" in requirementText or pref + "内" in requirementText or pref + "内に" in requirementText:
            if not pref in extractedPrefectures:
                extractedPrefectures.append(pref)

    # 短縮形の都道府県名を検出（ただし「東京」に「京都」が含まれるような誤検出を防止）
    for shortPref in SHORT_PREFECTURE_PATTERNS:
        # 「東京」の場合は特別処理
        if shortPref == "東京" and shortPref in words:
            if not "東京都" in extractedPrefectures:
                extractedPrefectures.append("東京都")
        # 「京都」の場合も特別処理
        elif shortPref == "京都" and shortPref in words:
            if not "京都府" in extractedPrefectures:
                extractedPrefectures.append("京都府")
        # それ以外の短縮形
        elif shortPref in words:
            fullPref = SHORT_PREFECTURE_PATTERNS[shortPref]
            if not fullPref in extractedPrefectures:
                extractedPrefectures.append(fullPref)
    return extractedPrefectures


def extractRegions(requirementText):
    extractedRegions = []

    # 管轄地域名パターン
    REGION_PATTERNS = [
        "北海道防衛局", "帯広防衛支局", "東北防衛局", "北関東防衛局", "南関東防衛局",
        "東海防衛支局", "近畿中部防衛局", "中国四国防衛局", "九州防衛局", "沖縄防衛局"
    ]

    for region in REGION_PATTERNS:
        if requirementText.find(region) >= 0:
            extractedRegions.append(region)
    
    # 防衛局管内などの表現に対応
    regionKeywords = [
        { "pattern": "北海道防衛局管内|北海道防衛局管轄", "region": "北海道防衛局" },
        { "pattern": "帯広防衛支局管内|帯広防衛支局管轄", "region": "帯広防衛支局" },
        { "pattern": "東北防衛局管内|東北防衛局管轄", "region": "東北防衛局" },
        { "pattern": "北関東防衛局管内|北関東防衛局管轄", "region": "北関東防衛局" },
        { "pattern": "南関東防衛局管内|南関東防衛局管轄", "region": "南関東防衛局" },
        { "pattern": "東海防衛支局管内|東海防衛支局管轄", "region": "東海防衛支局" },
        { "pattern": "近畿中部防衛局管内|近畿中部防衛局管轄", "region": "近畿中部防衛局" },
        { "pattern": "中国四国防衛局管内|中国四国防衛局管轄", "region": "中国四国防衛局" },
        { "pattern": "九州防衛局管内|九州防衛局管轄", "region": "九州防衛局" },
        { "pattern": "沖縄防衛局管内|沖縄防衛局管轄", "region": "沖縄防衛局" }
      ]
    
    for kw in regionKeywords:
        if re.search(kw["pattern"],requirementText) and not kw["region"] in extractedRegions:
            extractedRegions.append(kw["region"])

    return extractedRegions

def extractOfficeTypes(requirementText):
    extractedOfficeTypes = []

    # 拠点種別パターン - 「等」付きの表現も含む
    OFFICE_TYPE_PATTERNS = [
        {
            "pattern": "本店",
            "expanded": ["本店", "本社", "HEADQUARTER"]
        },
        {
            "pattern": "支店",
            "expanded": ["支店", "BRANCH"]
        },
        {
            "pattern": "営業所",
            "expanded": ["営業所", "SALES_OFFICE"]
        },
        {
            "pattern": "出張所",
            "expanded": ["出張所"]
        }
    ]

    # 「等」付きのパターン
    ETC_PATTERNS = [
        {
            "pattern": "支店等",
            "expanded": ["支店", "営業所", "出張所", "BRANCH", "SALES_OFFICE"]
        },
        {
            "pattern": "営業所等",
            "expanded": ["営業所", "出張所", "SALES_OFFICE"]
        }
    ]

    # 3. 拠点種別の抽出 (まず「等」付きのものを先に)
    etcFound = False
    for typeObj in ETC_PATTERNS:
        if requirementText.find(typeObj["pattern"]) >= 0:
            etcFound = True
            for t in typeObj["expanded"]:
                if not t in extractedOfficeTypes:
                    extractedOfficeTypes.append(t)

    # 「等」が見つからなければ通常パターンを検索
    if not etcFound:
        for typeObj in OFFICE_TYPE_PATTERNS:
            if requirementText.find(typeObj["pattern"]) >= 0:
                for t in typeObj["expanded"]:
                    if not t in extractedOfficeTypes:
                        extractedOfficeTypes.append(t)

    # 「営業拠点」のような一般的な表現は特別処理
    if requirementText.find("営業拠点") >= 0 and len(extractedOfficeTypes) == 0:
        # 全種類の拠点を認める - 拠点種別の制約を緩める
        # ※ ただし地域条件は維持する - 地域条件を無視するような変更は行わない
        extractedOfficeTypes.append("本店", "本社", "HEADQUARTER", "支店", "BRANCH", "営業所", "SALES_OFFICE", "出張所")

    return extractedOfficeTypes


def checkLocationRequirement(
    requirementText, 
    officeNo, 
    agencyData=pd.read_csv("data/master/agency_master.txt",sep="\t"),
    officeData = pd.read_csv("data/master/office_master.txt",sep="\t")
    ):

    prefectures = extractPrefectures(requirementText)
    regions = extractRegions(requirementText)
    officetypes = extractOfficeTypes(requirementText)

    prefectures_from_regions = sum([expandRegionToPrefectures(regionName=region, agencyData=agencyData) for region in regions],[])

    prefectures = list(set(prefectures + prefectures_from_regions))

    officelocation, officetype, officeprefecture = getOfficeLocation(
        officeNo=officeNo,
        officeData = officeData
    )

    if not officelocation and not officeprefecture:
        return { "is_ok": False, "reason": fr"所在地要件:拠点ID={officeNo}の所在地要件が取得できません" }


    # 3. 都道府県条件の照合 - officePrefectureを優先的に使用
    prefectureMatch = False
    matchedPrefecture = []

    if len(prefectures) == 0:
        # 都道府県指定がない場合は無条件でOK
        prefectureMatch = True
    else:
        # 所在都道府県列を優先的に使用
        if officeprefecture:
            for pref in prefectures:
                if officeprefecture == pref:
                    prefectureMatch = True
                    matchedPrefecture.append(pref)
        # 所在都道府県列でマッチしなかった場合はofficeLocationも確認
        if not prefectureMatch and officelocation:
            for pref in prefectures:
                if officelocation.find(pref) >= 0:
                    prefectureMatch = True
                    matchedPrefecture.append(pref)

    # 4. 拠点種別条件の照合
    officeTypeMatch = False

    if len(officetypes) == 0:
        # 拠点種別指定がない場合は無条件でOK
        officeTypeMatch = True
    else:
        # 拠点種別の拡張処理
        expandedOfficeType = expandOfficeType(officetype)

        # 「支店等」のような表現に対応する特殊処理
        if '支店等' in requirementText and ('支店' in officetype or '営業所' in officetype or '出張所' in officetype):
            officeTypeMatch = True
            # 「営業拠点」のような表現に対応する特殊処理
        elif '営業拠点' in requirementText:
            officeTypeMatch = True
        # 通常の拠点種別マッチング
        else:
            for type_ in officetypes:
                for expandedType in expandedOfficeType:
                    if type_ in expandedType or expandedType in type_:
                        officeTypeMatch = True
                        break
                if officeTypeMatch:
                    break

    # 5. 判定結果を返す
    if prefectureMatch and officeTypeMatch:
        if len(matchedPrefecture) > 0:
            matchDescription = "所在地要件：" + "・".join(matchedPrefecture) + "に" + (officetype or "拠点") + "があります"
        else:
            matchDescription = "所在地要件：条件を満たしています"
        return { "is_ok": True, "reason": matchDescription }
    elif not prefectureMatch:
        return {"is_ok": False, "reason": "所在地要件：要求地域(" + prefectures.join("・") + ")に拠点がありません"}
    else:
        return {"is_ok": False, "reason": "所在地要件：要求拠点種別(" + officetypes.join("・") + ")の条件を満たしていません"}
