# coding: utf-8 -*-

import re
import pandas as pd

#######################################
# 欠格要件の判定
#   欠格要件用の判定(会社ベース + 拠点指名停止など)
#   requirementText に応じて対象フラグをチェック。
# ※requirementType === "欠格要件"の場合。
#######################################

def isOfficeSuspended(officeNo, office_registration_authorization_data=pd.read_csv("data/master/office_registration_authorization_master.txt",sep="\t")):
    # 拠点登録許可マスター
    # office_registration_authorization_data
    
    target_data = office_registration_authorization_data[office_registration_authorization_data["office_no"] == officeNo]
    if target_data.shape[0] >= 1:
        keyname = "is_suspended" # 指名停止フラグ
        is_suspended_flg = target_data[keyname].tolist()[0]
        if is_suspended_flg:
            return True

    return False

# 企業Noが一致する行(companies)を返す(無ければNone)
def findCompanyRow(companyNo, company_data=None):
    """
    company_data (DataFrame) から company_no が一致する行を返す。

    Args:
        companyNo: 企業番号 (INTEGER)
        company_data: companies テーブルの DataFrame。必須。

    Returns:
        DataFrame (1行) or None
    """
    if company_data is None:
        raise ValueError("company_data must be provided")

    data = company_data[company_data["company_no"] == companyNo]
    if data.shape[0] == 0:
        return None
    else:
        if data.shape[0] > 1:
            print(f"Warning: 企業No={companyNo} に対して複数行ヒット({data.shape[0]}行)")
        return data.head(1)

def checkIneligibilityDynamic(requirementText, companyNo, officeNo, company_data=None, disqualification_data=None, office_registration_authorization_data=None):
    """
    欠格要件の動的判定。

    Args:
        requirementText: 要件文テキスト
        companyNo: 企業番号 (INTEGER)
        officeNo: 拠点番号
        company_data: companies テーブルの DataFrame。必須。
        disqualification_data: company_disqualifications テーブルの DataFrame。必須。
        office_registration_authorization_data: 拠点登録許可マスターの DataFrame。
    """
    if company_data is None:
        raise ValueError("company_data must be provided")
    if disqualification_data is None:
        raise ValueError("disqualification_data must be provided")

    compRow = findCompanyRow(companyNo, company_data=company_data)
    if compRow is None or compRow.shape[0] == 0:
        # 会社そのものが見つからなければNG
        return { "is_ok": False, "reason": fr"欠格要件：企業No={companyNo}が見つからない" }

    # companies テーブルの id を使って company_disqualifications を引く
    company_id = compRow["id"].item()
    disqRow = disqualification_data[disqualification_data["company_id"] == company_id]

    if disqRow.shape[0] == 0:
        # 欠格データがない場合は全てOK
        return { "is_ok": True, "reason": "欠格要件：欠格データなし => OK" }

    disqRow = disqRow.head(1)

    # company_disqualifications テーブルから snake_case カラムで取得
    article70Flg = disqRow["article_70_flag"].item()
    article71Flg = disqRow["article_71_flag"].item()
    bankruptFlg = disqRow["bankruptcy_flag"].item()
    rehabFlg = disqRow["corporate_reorganization_flag"].item()
    rehabStartDt = disqRow["corporate_reorganization_start_date"].item()
    reobtainedDt = disqRow["post_reorganization_reacquisition_date"].item()
    violentFlg = disqRow["anti_social_forces_flag"].item()
    legalIncapFlg = disqRow["adult_ward_flag"].item()
    foreignFlg = disqRow["foreign_legal_restriction_flag"].item()
    terroristFlg = disqRow["subversive_organization_flag"].item()
    socialInsOk = disqRow["no_social_insurance_arrears_flag"].item()
    infoSecFlg = disqRow["information_security_framework_flag"].item()
    isSuspByBOJ = disqRow["boj_transaction_suspension_flag"].item()

    # (1) 70条
    if re.search(r"70条", requirementText):
        if article70Flg or bankruptFlg or violentFlg or legalIncapFlg:
            return { "is_ok": False, "reason": "欠格要件：70条NG(破産/暴力団/成年後見等フラグ)" }
        else:
            return { "is_ok": True, "reason": "欠格要件：70条OK" }

    # (2) 71条
    if re.search(r"71条", requirementText):
        if article71Flg:
            return { "is_ok": False, "reason": "欠格要件：71条NG(71条該当フラグ)" }
        else:
            return { "is_ok": True, "reason": "欠格要件：71条OK" }

    # (3) 破産/倒産
    if re.search(r"破産|倒産", requirementText):
        if bankruptFlg:
            return { "is_ok": False, "reason": "欠格要件：破産NG(破産フラグ)" }
        else:
            return { "is_ok": True, "reason": "欠格要件：破産OK" }

    # (4) 会社更生/民事再生
    if re.search(r"会社更生|民事再生|更生法|再生手続", requirementText):
        if rehabFlg and not reobtainedDt:
            return { "is_ok": False, "reason": "欠格要件：更生/再生NG(再取得なし)" }
        else:
            return { "is_ok": True, "reason": "欠格要件：更生/再生OK" }

    # (5) 成年後見   
    if re.search(r"成年被後見|後見人|保佐人|法定代理", requirementText):
        if legalIncapFlg:
            return { "is_ok": False, "reason": "欠格要件：成年後見NG" }
        else:
            return { "is_ok": True, "reason": "欠格要件：成年後見OK" }

    # (6) 暴力団/反社会    
    if re.search(r"暴力団|反社会", requirementText):
        if violentFlg:
            return { "is_ok": False, "reason": "欠格要件：暴力団NG" }
        else:
            return { "is_ok": True, "reason": "欠格要件：暴力団OK" }

    # (7) 外国法/海外制裁/安保理
    if re.search(r"外国法|海外制裁|安保理|OFAC", requirementText):
        if foreignFlg:
            return { "is_ok": False, "reason": "欠格要件：海外制裁NG" }
        else:
            return { "is_ok": True, "reason": "欠格要件：海外制裁OK" }

    # (8) 破壊的団体
    if re.search(r"破壊的団体|破壊活動防止法|テロリスト", requirementText):
        if terroristFlg:
            return { "is_ok": False, "reason": "欠格要件：破壊的団体NG" }
        else:
            return { "is_ok": True, "reason": "欠格要件：破壊的団体OK" }

    # (9) 社会保険/労働保険の滞納
    if re.search(r"社会保険|労働保険|保険料.*滞納", requirementText):
        # TODO
        # 例: socialInsOk が true なら OK。falseまたはnullならNG
        # ※ 上のコメントの内容に従えば、true なら "is_ok" は True
        # ※ コードは、true では "is_ok" が False となっている。
        # 逆では？？
        if socialInsOk:
            return { "is_ok": False, "reason": "欠格要件：社会保険滞納NG" }
        else:
            return { "is_ok": True, "reason": "欠格要件：社会保険滞納OK" }

    # (10) 情報保全/セキュリティ
    if re.search(r"情報保全|セキュリティ|保全体制|ISMS", requirementText):
        # 例: infoSecFlg === true の場合NG扱いなど
        if infoSecFlg:
            return { "is_ok": False, "reason": "欠格要件：情報保全NG" }
        else:
            return { "is_ok": True, "reason": "欠格要件：情報保全OK" }

    # (11) 日銀取引停止
    if re.search(r"日銀取引停止|日銀.*停止", requirementText):
        if isSuspByBOJ:
            return { "is_ok": False, "reason": "欠格要件：日銀取引停止NG" }
        else:
            return { "is_ok": True, "reason": "欠格要件：日銀取引停止OK" }

    # (12) 指名停止/営業停止 (拠点単位で見る例)
    if re.search(r"指名停止|営業停止|取引停止", requirementText):
        # 拠点マスター or 拠点登録許可マスターで is_suspended_flg をチェック
        if isOfficeSuspended(
            officeNo=officeNo,
            office_registration_authorization_data=office_registration_authorization_data
            ):
            return { "is_ok": False, "reason": "欠格要件：拠点指名停止NG" }
        else:
            return { "is_ok": True, "reason": "欠格要件：拠点指名停止OK" }

    # どのキーワードにも該当しない場合
    return { "is_ok": True, "reason": "欠格要件：該当キーワードなし => OK"}

if __name__ == "__main__":
    # テストコード: TSV ファイルからデータを読み込んでテスト
    # 本番では db_operator 経由で companies / company_disqualifications を取得する
    import os
    company_tsv = "data/master/companies.txt"
    disq_tsv = "data/master/company_disqualifications.txt"
    office_reg_tsv = "data/master/office_registration_authorization_master.txt"

    if not os.path.exists(company_tsv):
        print(f"Warning: {company_tsv} not found. Skipping test.")
    else:
        test_company_data = pd.read_csv(company_tsv, sep="\t")
        test_disq_data = pd.read_csv(disq_tsv, sep="\t") if os.path.exists(disq_tsv) else pd.DataFrame()
        test_office_data = pd.read_csv(office_reg_tsv, sep="\t") if os.path.exists(office_reg_tsv) else pd.DataFrame()

        companyNo = 1
        officeNo = 1
        requirementText = "70条および破産"
        print(checkIneligibilityDynamic(requirementText=requirementText, companyNo=companyNo, officeNo=officeNo,
              company_data=test_company_data, disqualification_data=test_disq_data,
              office_registration_authorization_data=test_office_data))

        requirementText = "予算決算及び会計令(昭和22年勅令第165号。以下「予決令」という。)第70条及び第71条の規定に該当しない者であること。"
        print(checkIneligibilityDynamic(requirementText=requirementText, companyNo=companyNo, officeNo=officeNo,
              company_data=test_company_data, disqualification_data=test_disq_data,
              office_registration_authorization_data=test_office_data))

        requirementText = "会社更生法に基づき更生手続開始の申立てがなされている者又は民事再生法に基づき再生手続開始の申立てがなされている者(再度級別の格付けを受けた者を除く。)でないこと。"
        print(checkIneligibilityDynamic(requirementText=requirementText, companyNo=companyNo, officeNo=officeNo,
              company_data=test_company_data, disqualification_data=test_disq_data,
              office_registration_authorization_data=test_office_data))

        requirementText = "都道府県警察から暴力団関係業者として防衛省が発注する業務から排除するよう要請があり、当該状態が継続している有資格業者については、競争参加を認めない。"
        print(checkIneligibilityDynamic(requirementText=requirementText, companyNo=companyNo, officeNo=officeNo,
              company_data=test_company_data, disqualification_data=test_disq_data,
              office_registration_authorization_data=test_office_data))


