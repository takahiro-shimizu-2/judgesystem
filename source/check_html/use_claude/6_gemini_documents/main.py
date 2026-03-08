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
import glob
from pathlib import Path
import ast
from tqdm import tqdm
import asyncio
import pickle
from concurrent.futures import ThreadPoolExecutor

### ocr : document_id 
### 
import argparse
import re
import random

def extract_second_level(url):
    # プロトコル部分（http://, https://）を削除
    url = re.sub(r'^https?://', '', url)
    # 第二階層まで取り出す
    # 例: example.com/foo/bar → example.com/foo
    m = re.match(r'([^/]+/[^/]+)', url)
    if not m:
        return 'unknown'
    second = m.group(1)
    # 置換処理
    second = second.replace('.', '_').replace('/', '---')
    return second

def getJsonFromData(data, data_type):
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
        "郵便番号": "",
        "住所": "",
        "担当部署名": "",
        "担当者名": "",
        "電話番号": "",
        "FAX番号": "",
        "メールアドレス": ""
    },
    "公告日" : "",
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

    if data_type == "txt":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_text(text=data),  # ← ここが PDF の代わり
                prompt
            ]
        )
    elif data_type == "pdf":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(
                    data=data,
                    mime_type='application/pdf',
                ),
                prompt
            ]
        )
    elif data_type == "pdf_fileapi":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                data,
                prompt
            ]
        )

    # print(response.text)

    text=response.text
    #json_text = extract_json(text=response.text)
    text2 = text.replace('\n', '').replace('```json', '').replace("```","")
    dict1 = json.loads(text2)
    return dict1



def getJsonFromData_v2(data, data_type):
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
        "郵便番号": "",
        "住所": "",
        "担当部署名": "",
        "担当者名": "",
        "電話番号": "",
        "FAX番号": "",
        "メールアドレス": ""
    },
    "公告日" : "",
    "入札方式" : "",
    "資料種類" : "",
    "category" : "",
    "pagecount" : "",
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
    1-1. As to the "入札方式" field, please set one from: open_competitive, designated_competitive, negotiated_contract, planning_competition, preferred_designation, open_counter, document_request, opinion_request, unknown, other.
    1-2. As to the "資料種類" field, please set one from: "公募", "一般競争入札", "指名停止措置", "入札公告", "変更公告/注意事項公告/訂正公告/再公告", "中止", "企画競争実施の公示", "企画競争に係る手続開始の公示", "競争参加者の資格に関する公示", "見積書", "見積依頼書", "品目等内訳書", "入札書", "入札結果", "公告結果", "仕様書", "情報提案要求書", "業者の選定", "その他".
    1-3. As to the "category" field, please set one from: '土木一式工事', '建築一式工事', '大工工事', '左官工事', 'とび・土工・コンクリート工事', '石工事', '屋根工事', '電気工事', '管工事', 'タイル・れんが・ブロック工事', '鋼構造物工事', '鉄筋工事', '舗装工事', 'しゅんせつ工事', '板金工事', 'ガラス工事', '塗装工事', '防水工事', '内装仕上工事', '機械器具設置工事', '熱絶縁工事', '電気通信工事', '造園工事', 'さく井工事', '建具工事', '水道施設工事', '消防施設工事', '清掃施設工事', '解体工事', 'その他'.
    2.  **Completeness:**  Extract all requested fields. If a field is not found in the context, represent it with an empty string (`""`). No omissions are allowed.
    3.  **Limited Output:** Only include the specified fields in the JSON output. Do not add any extra information or labels.
    4.  **Hide Steps:** Do not display the internal steps (T1 or T2). Only the final JSON output (T3) should be shown.
    5.  **Prefix Exclusion:** Exclude prefixes like "〒", "TEL", "FAX", and "E-mail:" from the extracted values.
    6.  **Output Language:** The output (field names and extracted text if applicable) should be in Japanese.
    7. **Data Structure:** Maintain the nested structure shown in the JSON Structure above.  "入札手続等担当部局", "入札説明書の交付期間", "申請書及び競争参加資格確認資料の提出期限" and "入札書の提出期間" are objects containing their respective sub-fields.
    """

    if data_type == "txt":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_text(text=data),  # ← ここが PDF の代わり
                prompt
            ]
        )
    elif data_type == "pdf":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(
                    data=data,
                    mime_type='application/pdf',
                ),
                prompt
            ]
        )
    elif data_type == "pdf_fileapi":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                data,
                prompt
            ]
        )

    # print(response.text)

    text=response.text
    #json_text = extract_json(text=response.text)
    text2 = text.replace('\n', '').replace('```json', '').replace("```","")
    dict1 = json.loads(text2)
    return dict1


def convertJson(json_value):
    """ 
    公告データから取得した json ライクな公告情報を整形して json とする。

    Args:

    - json_value

        json ライクな公告データ
    """

    def _modifyDate(datestr, handle_same_year=None, handle_same_month=None):
        try:
            # スペースを除去してから処理
            datestr = datestr.replace(" ", "").replace("　", "")

            datestr = datestr.replace("令和元年", "令和1年")
            if "同年" in datestr:
                datestr = datestr.replace("同年", fr"{handle_same_year}年")

            # 同月25日
            m = re.search(r"同月(\d+)日", datestr)
            if m and handle_same_month:
                y, mth = handle_same_month.split("-")
                return f"{y}-{mth}-{int(m.group(1)):02}"

            # 令和7年3月18日
            m = re.search(r"令和(\d+)年(\d+)月(\d+)日", datestr)
            if m:
                return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

            # 2025年3月18日 (4桁の年号)
            m = re.search(r"(\d{4})年(\d+)月(\d+)日", datestr)
            if m:
                return fr"{int(m.group(1))}-{int(m.group(2)):02}-{int(m.group(3)):02}"

            # 7年4月14日 → 令和7年として扱う (1-2桁の年号は令和とみなす)
            m = re.search(r"(\d{1,2})年(\d+)月(\d+)日", datestr)
            if m:
                year = int(m.group(1))
                # 年が100未満なら令和として扱う
                if year < 100:
                    return fr"{year+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"
                else:
                    return fr"{year}-{int(m.group(2)):02}-{int(m.group(3)):02}"

            # R7.7.2 → 令和7年7月2日
            m = re.search(r"R(\d+)\.(\d{1,2})\.(\d{1,2})", datestr)
            if m:
                return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

            # 7.3.18 → 令和7年3月18日
            m = re.search(r"\b(\d+)\.(\d{1,2})\.(\d{1,2})\b", datestr)
            if m:
                return fr"{int(m.group(1))+2018:04}-{int(m.group(2)):02}-{int(m.group(3)):02}"

            # 2025/5/12 → 2025-05-12
            m = re.search(r"(\d{4})/(\d{1,2})/(\d{1,2})", datestr)
            if m:
                return fr"{int(m.group(1))}-{int(m.group(2)):02}-{int(m.group(3)):02}"

            return datestr
        except Exception as e:
            # print(e)
            return None

    def extract_year(s: str) -> str:
        if not s:
            return ""
        try:
            dt = datetime.strptime(s, "%Y-%m-%d")
            return str(dt.year)
        except ValueError:
            return ""

    def extract_same_year_month(s: str) -> str:
        if not s:
            return ""
        try:
            dt = datetime.strptime(s, "%Y-%m-%d")
            return f"{dt.year}-{dt.month:02}"
        except ValueError:
            return ""

    new_json = {}
    new_json["announcement_no"] = json_value.get("announcement_no", None)
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

    tmp_val = json_value.get("公告日", None)
    if isinstance(tmp_val, str):
        new_json["publishdate"] = _modifyDate(datestr=tmp_val)
    else:
        new_json["publishdate"] = None

    new_json["bidType"] = json_value.get("入札方式", None)
    new_json["category"] = json_value.get("category", None)
    new_json["pagecount"] = json_value.get("pagecount", None)

    tmp_json = json_value.get("入札説明書の交付期間", None)
    if isinstance(tmp_json, dict):
        new_json["docdiststart"] = _modifyDate(datestr=tmp_json.get("開始日", None))
        new_json["docdistend"] = _modifyDate(datestr=tmp_json.get("終了日", None), handle_same_year=extract_year(new_json["docdiststart"]), handle_same_month=extract_same_year_month(new_json["docdiststart"]))

    tmp_json = json_value.get("申請書及び競争参加資格確認資料の提出期限", None)
    if isinstance(tmp_json, dict):
        new_json["submissionstart"] = _modifyDate(datestr=tmp_json.get("開始日", None))
        new_json["submissionend"] = _modifyDate(datestr=tmp_json.get("終了日", None), handle_same_year=extract_year(new_json["submissionstart"]), handle_same_month=extract_same_year_month(new_json["submissionstart"]))

    tmp_json = json_value.get("入札書の提出期間", None)
    if isinstance(tmp_json, dict):
        new_json["bidstartdate"] = _modifyDate(datestr=tmp_json.get("開始日", None))
        new_json["bidenddate"] = _modifyDate(datestr=tmp_json.get("終了日", None), handle_same_year=extract_year(new_json["bidstartdate"]), handle_same_month=extract_same_year_month(new_json["bidstartdate"]))

    return new_json










def getRequirementText(data, data_type):
    """ 
    公告データ doc_data を受け取り、gemini に渡して、公告の要件文を json ライクな形式で受け取る。

    gemini 用プロンプトはハードコードされている。

    Args:

    - doc_data

        公告データ
    """

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

    if data_type == "text":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_text(text=data),  # ← ここが PDF の代わり
                prompt
            ]
        )
    elif data_type == "pdf":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(
                    data=data,
                    mime_type='application/pdf',
                ),
                prompt
            ]
        )
    elif data_type == "pdf_fileapi":
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                data,
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

def convertRequirementTextDict(requirement_texts):
    """ 
    公告データから取得した json ライクな公告情報を整形して json とする。

    Args:

    - requirement_texts

        json ライクな要件文
    """

    # requirement_texts = {"announcement_no":1, "資格・条件":["(2)令和07・08・09年度防衛省競争参加資格(全省庁統一資格)の「役務の提供等」において、開札時までに「C」又は「D」の等級に格付けされ北海道地域の競争参加を希望する者であること(会社更生法(平成14年法律第154号)に基づき更生手続開始の申立てがなされている者又は民事再生法(平成11年法律第225号)に基づき再生手続開始の申立てがなされている者については、手続開始の決定後、再度級別の格付けを受けていること。)。"]}
    # announcement_no = requirement_texts["announcement_no"]
    announcement_no = None

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



def call_gemini(prompt, document_id, data_type, model="gemini-2.5-flash-lite", gcp_vm=True):

    if gcp_vm:
        # GCSからダウンロード
        from google.cloud import storage
        storage_client = storage.Client()
        bucket_name = "ann-files"
        blob_path = f"pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        data = blob.download_as_bytes()
    else:
        # ローカルファイルから読み込み
        f_pdf = fr"../4_get_documents/output_v3/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
        with open(f_pdf, "rb") as f0:
            data = f0.read()   # ただのバイト列


    if data_type == "text":
        response = client.models.generate_content(
            model=model,
            contents=[
                types.Part.from_text(text=data),  # ← ここが PDF の代わり
                prompt
            ]
        )
    elif data_type == "pdf":
        response = client.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(
                    data=data,
                    mime_type='application/pdf',
                ),
                prompt
            ]
        )
    elif data_type == "pdf_fileapi":
        response = client.models.generate_content(
            model=model,
            contents=[
                data,
                prompt
            ]
        )

    return response.text

if False:
    # old
    async def call_parallel(params, max_concurrency=5, gcp_vm=True):
        semaphore = asyncio.Semaphore(max_concurrency)

        async def wrapper(prompt, document_id, data_type, type2):
            async with semaphore:
                try:
                    result = await asyncio.to_thread(
                        call_gemini, prompt, document_id, data_type, gcp_vm
                    )
                    return {"document_id": document_id, "result": result, "error": None, "type": type2}
                except Exception as e:
                    return {"document_id": document_id, "result": None, "error": str(e), "type": type2}

        tasks = [wrapper(p, d, t, t2) for p, d, t, t2 in params]
        return await asyncio.gather(*tasks)

async def call_parallel(params, max_concurrency=5, gcp_vm=True):

    queue = asyncio.Queue()
    results = []

    for p in params:
        await queue.put(p)

    async def worker():
        while True:
            item = await queue.get()
            if item is None:
                break

            prompt, document_id, data_type, model, type2 = item

            for attempt in range(3):
                try:
                    result = await asyncio.to_thread(
                        call_gemini,
                        prompt,
                        document_id,
                        data_type,
                        model,
                        gcp_vm
                    )

                    results.append({
                        "document_id": document_id,
                        "result": result,
                        "error": None,
                        "type": type2
                    })
                    break

                except Exception as e:
                    if "429" in str(e) and attempt < 2:
                        await asyncio.sleep(2 ** attempt + random.random())
                    else:
                        results.append({
                            "document_id": document_id,
                            "result": None,
                            "error": str(e),
                            "type": type2
                        })
                        break

            queue.task_done()

    workers = [asyncio.create_task(worker()) for _ in range(max_concurrency)]

    await queue.join()

    for _ in workers:
        await queue.put(None)

    await asyncio.gather(*workers)

    return results



PROMPT_ANN = """
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
"郵便番号": "",
"住所": "",
"担当部署名": "",
"担当者名": "",
"電話番号": "",
"FAX番号": "",
"メールアドレス": ""
},
"公告日" : "",
"入札方式" : "",
"資料種類" : "",
"category" : "",
"pagecount" : "",
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
1-1. As to the "入札方式" field, please set one from: open_competitive, designated_competitive, negotiated_contract, planning_competition, preferred_designation, open_counter, document_request, opinion_request, unknown, other.
1-2. As to the "資料種類" field, please set one from: "公募", "一般競争入札", "指名停止措置", "入札公告", "変更公告/注意事項公告/訂正公告/再公告", "中止", "企画競争実施の公示", "企画競争に係る手続開始の公示", "競争参加者の資格に関する公示", "見積書", "見積依頼書", "品目等内訳書", "入札書", "入札結果", "公告結果", "仕様書", "情報提案要求書", "業者の選定", "その他".
1-3. As to the "category" field, please set one from: '土木一式工事', '建築一式工事', '大工工事', '左官工事', 'とび・土工・コンクリート工事', '石工事', '屋根工事', '電気工事', '管工事', 'タイル・れんが・ブロック工事', '鋼構造物工事', '鉄筋工事', '舗装工事', 'しゅんせつ工事', '板金工事', 'ガラス工事', '塗装工事', '防水工事', '内装仕上工事', '機械器具設置工事', '熱絶縁工事', '電気通信工事', '造園工事', 'さく井工事', '建具工事', '水道施設工事', '消防施設工事', '清掃施設工事', '解体工事', 'その他'.
2.  **Completeness:**  Extract all requested fields. If a field is not found in the context, represent it with an empty string (`""`). No omissions are allowed.
3.  **Limited Output:** Only include the specified fields in the JSON output. Do not add any extra information or labels.
4.  **Hide Steps:** Do not display the internal steps (T1 or T2). Only the final JSON output (T3) should be shown.
5.  **Prefix Exclusion:** Exclude prefixes like "〒", "TEL", "FAX", and "E-mail:" from the extracted values.
6.  **Output Language:** The output (field names and extracted text if applicable) should be in Japanese.
7. **Data Structure:** Maintain the nested structure shown in the JSON Structure above.  "入札手続等担当部局", "入札説明書の交付期間", "申請書及び競争参加資格確認資料の提出期限" and "入札書の提出期間" are objects containing their respective sub-fields.
"""

PROMPT_REQ = """
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


def is_document_id_value_nan(document_id, df_ann, df_req):
    v1 = df_ann[df_ann["document_id"]==document_id]
    cols = [
        "工事場所",
        "入札手続等担当部局___郵便番号",
        "入札手続等担当部局___住所",
        "入札手続等担当部局___担当部署名",
        "入札手続等担当部局___担当者名",
        "入札手続等担当部局___電話番号",
        "入札手続等担当部局___FAX番号",
        "入札手続等担当部局___メールアドレス",
        "公告日",
        "入札方式",
        "資料種類",
        "category",
        "pagecount",
        "入札説明書の交付期間___開始日",
        "入札説明書の交付期間___終了日",
        "申請書及び競争参加資格確認資料の提出期限___開始日",
        "申請書及び競争参加資格確認資料の提出期限___終了日",
        "入札書の提出期間___開始日",
        "入札書の提出期間___終了日"
    ]
    flg1 = v1.iloc[0][cols].isna().all()
    v2 = df_req[df_req["document_id"]==document_id]
    cols = ["資格・条件"]
    flg2 = v2.iloc[0][cols].isna().all()
    if flg1 and flg2:
        return True
    return False


def process_result(res):
    document_id = res["document_id"]
    type1 = res["type"]

    if type1 == "req":
        try:
            text2 = res["result"].replace('\n','').replace('```json','').replace("```","")
        except Exception:
            text2 = "ERROR"

        try:
            requirement_texts = json.loads(text2)
        except json.decoder.JSONDecodeError:
            text2 = text2.replace('"',"'")
            requirement_texts = json.loads('{"資格・条件" : ["' + text2 + '"]}')

        try:
            dict2 = {
                "document_id": document_id,
                "資格・条件": str(requirement_texts["資格・条件"])
            }
            # "資格・条件" は、listの文字列。
        except Exception as e:
            # LLMが以下を返す場合があるが未対応。
            # - json の直下のキーが "資格・条件" ではない。
            # - 辞書ではなくリスト。
            dict2 = {
                "document_id": document_id,
                "資格・条件": "['Error fetching requirements.']"
            }


        return ("req", dict2)

    else:
        try:
            dict1 = res["result"].replace('\n','').replace('```json','').replace("```","")
            dict1 = json.loads(dict1)
        except Exception as e:
            dict1 = {}

        dict2 = {
            "document_id": document_id,
            "工事場所": dict1.get("工事場所"),
            "入札手続等担当部局___郵便番号": dict1.get("入札手続等担当部局", {}).get("郵便番号"),
            "入札手続等担当部局___住所": dict1.get("入札手続等担当部局", {}).get("住所"),
            "入札手続等担当部局___担当部署名": dict1.get("入札手続等担当部局", {}).get("担当部署名"),
            "入札手続等担当部局___担当者名": dict1.get("入札手続等担当部局", {}).get("担当者名"),
            "入札手続等担当部局___電話番号": dict1.get("入札手続等担当部局", {}).get("電話番号"),
            "入札手続等担当部局___FAX番号": dict1.get("入札手続等担当部局", {}).get("FAX番号"),
            "入札手続等担当部局___メールアドレス": dict1.get("入札手続等担当部局", {}).get("メールアドレス"),
            "公告日": dict1.get("公告日"),
            "入札方式": dict1.get("入札方式"),
            "資料種類": dict1.get("資料種類"),
            "category": dict1.get("category"),
            "pagecount": dict1.get("pagecount"),
            "入札説明書の交付期間___開始日": dict1.get("入札説明書の交付期間", {}).get("開始日"),
            "入札説明書の交付期間___終了日": dict1.get("入札説明書の交付期間", {}).get("終了日"),
            "申請書及び競争参加資格確認資料の提出期限___開始日": dict1.get("申請書及び競争参加資格確認資料の提出期限", {}).get("開始日"),
            "申請書及び競争参加資格確認資料の提出期限___終了日": dict1.get("申請書及び競争参加資格確認資料の提出期限", {}).get("終了日"),
            "入札書の提出期間___開始日": dict1.get("入札書の提出期間", {}).get("開始日"),
            "入札書の提出期間___終了日": dict1.get("入札書の提出期間", {}).get("終了日"),
            "url": None
        }

        return ("ann", dict2)


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Process bid announcements with Gemini API")
    parser.add_argument("--input_dir",
                       default="../3_source_formatting/output",
                       help="Directory to search for latest input files")
    parser.add_argument("--output_base_dir",
                       default="../4_get_documents/output_v3",
                       help="Base directory for output files")
    parser.add_argument("--timestamp",
                       default=None,
                       help="Timestamp to use (format: YYYYMMDDHHMM). If not specified, uses latest from input_dir")
    parser.add_argument("--api_key_file",
                       default="../../../../data/sec/google_ai_studio_api_key_mizu.txt",
                       help="Path to Google AI Studio API key file")
    parser.add_argument("--stop_processing", action="store_true")
    parser.add_argument("--gcp_vm", action="store_true", default=True,
                       help="Use GCS paths for PDF files (default: True)")
    parser.add_argument("--no_gcp_vm", action="store_false", dest="gcp_vm",
                       help="Use local paths for PDF files instead of GCS")
    args = parser.parse_args()
    stop_processing = args.stop_processing
    gcp_vm = args.gcp_vm

    yyyymmdd = datetime.now().strftime("%Y%m%d")

    # タイムスタンプの決定（指定がない場合は最新を自動選択）
    if args.timestamp is None:
        input_dir_path = Path(args.input_dir)
        if not input_dir_path.exists():
            raise FileNotFoundError(f"Input directory not found: {input_dir_path}")

        # yyyymmddhhmm 形式のディレクトリを探す
        all_dirs = [d for d in input_dir_path.iterdir() if d.is_dir() and d.name.isdigit()]

        if not all_dirs:
            raise FileNotFoundError(f"No timestamp directories found in {input_dir_path}")

        # 最新のディレクトリを取得（ディレクトリ名でソート）
        latest_dir = sorted(all_dirs, reverse=True)[0]
        timestamp = latest_dir.name
        print(f"Using latest timestamp: {timestamp}")
    else:
        timestamp = args.timestamp

    # API key読み込み
    google_ai_studio_api_key_filepath = args.api_key_file

    if google_ai_studio_api_key_filepath is None:
        key = ""
    else:
        with open(google_ai_studio_api_key_filepath,"r") as f:
            key = f.read()

    client = genai.Client(api_key=key)

    # 出力パス設定 - 最新のタイムスタンプファイルを探す
    ann_dir = f"{args.output_base_dir}/pdf_txt_all_gemini_ann"
    req_dir = f"{args.output_base_dir}/pdf_txt_all_gemini_req"
    os.makedirs(ann_dir, exist_ok=True)
    os.makedirs(req_dir, exist_ok=True)

    # ann の最新ファイルを探す
    ann_files = list(Path(ann_dir).glob("ann_announcements_document_*.txt"))
    ann_files = [f for f in ann_files if not f.name.endswith('.zip')]
    if ann_files:
        latest_ann_file = sorted(ann_files, reverse=True)[0]
        output_path_ann = str(latest_ann_file)
        output_path_ann_zip = output_path_ann + ".zip"
        print(f"Using existing ann file: {output_path_ann}")
    else:
        output_path_ann = f"{ann_dir}/ann_announcements_document_{timestamp}.txt"
        output_path_ann_zip = output_path_ann + ".zip"
        print(f"Creating new ann file: {output_path_ann}")

    # req の最新ファイルを探す
    req_files = list(Path(req_dir).glob("req_announcements_document_*.txt"))
    req_files = [f for f in req_files if not f.name.endswith('.zip')]
    if req_files:
        latest_req_file = sorted(req_files, reverse=True)[0]
        output_path_req = str(latest_req_file)
        output_path_req_zip = output_path_req + ".zip"
        print(f"Using existing req file: {output_path_req}")
    else:
        output_path_req = f"{req_dir}/req_announcements_document_{timestamp}.txt"
        output_path_req_zip = output_path_req + ".zip"
        print(f"Creating new req file: {output_path_req}")

    print(f"Output paths:")
    print(f"  ann: {output_path_ann}")
    print(f"  req: {output_path_req}")



    # 入力ファイルパス設定（df_newを先に読み込む必要がある）
    input_timestamp_dir = Path(args.input_dir) / timestamp
    df_new_path = input_timestamp_dir / f"announcements_document_{timestamp}_merged_updated.txt"
    if not df_new_path.exists():
        df_new_path = input_timestamp_dir / f"announcements_document_{timestamp}_updated.txt"
    df_new = pd.read_csv(df_new_path, sep="\t")

    # 既にファイルがあるか確認
    if os.path.exists(output_path_ann_zip):
        df_ann = pd.read_csv(output_path_ann_zip,sep="\t", low_memory=False)
    elif os.path.exists(output_path_ann):
        df_ann = pd.read_csv(output_path_ann,sep="\t", low_memory=False)
    else:
        # ファイルが存在しない場合、新規作成
        print(f"Creating new ann dataframe with columns from df_new")
        df_ann = pd.DataFrame({
            "document_id": df_new["document_id"],
            "工事場所": None,
            "入札手続等担当部局___郵便番号": None,
            "入札手続等担当部局___住所": None,
            "入札手続等担当部局___担当部署名": None,
            "入札手続等担当部局___担当者名": None,
            "入札手続等担当部局___電話番号": None,
            "入札手続等担当部局___FAX番号": None,
            "入札手続等担当部局___メールアドレス": None,
            "公告日": None,
            "入札方式": None,
            "資料種類": None,
            "category": None,
            "pagecount": None,
            "入札説明書の交付期間___開始日": None,
            "入札説明書の交付期間___終了日": None,
            "申請書及び競争参加資格確認資料の提出期限___開始日": None,
            "申請書及び競争参加資格確認資料の提出期限___終了日": None,
            "入札書の提出期間___開始日": None,
            "入札書の提出期間___終了日": None,
            "url": df_new["url"]
        })
        # 保存
        df_ann.to_csv(output_path_ann, sep="\t", index=False)

    if os.path.exists(output_path_ann):
        df_ann0 = pd.read_csv(output_path_ann,sep="\t", low_memory=False)
    else:
        df_ann0 = df_ann.copy()

    if os.path.exists(output_path_req_zip):
        df_req = pd.read_csv(output_path_req_zip,sep="\t", low_memory=False)
    elif os.path.exists(output_path_req):
        df_req = pd.read_csv(output_path_req,sep="\t", low_memory=False)
    else:
        # ファイルが存在しない場合、新規作成
        print(f"Creating new req dataframe with columns from df_new")
        df_req = pd.DataFrame({
            "document_id": df_new["document_id"],
            "資格・条件": None
        })
        # 保存
        df_req.to_csv(output_path_req, sep="\t", index=False)

    if not (df_ann["document_id"]==df_req["document_id"]).all():
        raise ValueError("The document_id columns in df_ann and df_req are not identical.")

    if False:
        for document_id in date_df2["document_id"]:
            f_txt = fr"../4_get_documents/output_v3/pdf_txt_all_py/pdf_{document_id.split('_')[0]}/{document_id}.txt"
            if os.path.exists(f_txt):
                with open(f_txt, "r", encoding="utf-8") as f0:
                    data_txt = f0.read()
                if data_txt.find("TESSERACT") >= 0:
                    break

    ##########################################
    # 新しい document_id を追加する。
    new_ids = df_new[~df_new["document_id"].isin(df_ann["document_id"])]
    new_ids = new_ids.reset_index(drop=True)

    rows_ann = pd.DataFrame({
        col: [None] * len(new_ids)
        for col in df_ann.columns
    })
    rows_ann["document_id"] = new_ids["document_id"]
    rows_ann["url"] = new_ids["url"]
    df_ann = pd.concat([df_ann, rows_ann], ignore_index=True)
    df_ann = df_ann.sort_values("document_id")
    df_ann["document_id"].reset_index(drop=True).equals(df_new["document_id"].reset_index(drop=True))

    new_ids = df_new[~df_new["document_id"].isin(df_req["document_id"])]
    new_ids = new_ids.reset_index(drop=True)

    rows_req = pd.DataFrame({
        col: [None] * len(new_ids)
        for col in df_req.columns
    })
    rows_req["document_id"] = new_ids["document_id"]
    df_req = pd.concat([df_req, rows_req], ignore_index=True)
    df_req = df_req.sort_values("document_id")
    df_req["document_id"].reset_index(drop=True).equals(df_new["document_id"].reset_index(drop=True))
    ##########################################

    if stop_processing:
        exit(1)


    # 抽出結果を取り出すだけの処理。
    if False:
        #for i, row in tqdm(date_df2.iterrows(), total=len(date_df2)):
        for i, row in tqdm(df_ann.iterrows(), total=len(df_ann)):
            document_id = row["document_id"]
            try:
                url = df_ann[df_ann["document_id"]==document_id]["url"].values[0]
                if True:
                    # announcements
                    if document_id in df_ann["document_id"].values:
                        # df_ann から取得して整形...
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
                            "公告日": dict2["公告日"].values[0],
                            "入札方式": dict2["入札方式"].values[0],
                            "資料種類": dict2["資料種類"].values[0],
                            "category": dict2["category"].values[0],
                            "pagecount": dict2["pagecount"].values[0],
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
                        new_json = convertJson(json_value=dict1)
                        df_ann_updated.append(new_json)

                if True:
                    # requirements
                    if document_id in df_req["document_id"].values:
                        dict2 = df_req[df_req["document_id"]==document_id]
                        if dict2["資格・条件"].isna().all():
                            requirement_texts = {
                                "資格・条件": ["Missing requirements."]
                            }
                        else:
                            requirement_texts = {
                                "資格・条件": dict2["資格・条件"].apply(ast.literal_eval).values[0]
                            }
                    dic = convertRequirementTextDict(requirement_texts=requirement_texts)
                    df_req_updated.append(dic)
            except Exception as e:
                print(e)
                #time.sleep(60)
        df_ann_updated_df = pd.DataFrame(df_ann_updated)
        df_req_updated_df = pd.DataFrame(df_req_updated)
        
        col = df_req_updated_df["requirement_text"]
        lens = col.apply(len)
        mask = (lens == 0) | ((lens == 1) & (col.str[0] == "Missing requirements."))
        aa2 = df_req_updated_df[mask]

        df_ann_updated_df.shape
        df_req_updated_df.shape
        
        
        df_req_updated_df = df_req_updated_df.explode(list(df_req_updated_df.columns), ignore_index=True)



        ret = is_document_id_value_nan(document_id, df_ann, df_req)


    # 抽出結果を取り出すだけの処理(並列化版)
    if False:
        df_ann_indexed = df_ann.set_index("document_id")
        df_req_indexed = df_req.set_index("document_id")
        def process_row(row):
            document_id = row["document_id"]

            ann_result = None
            req_result = None

            try:
                # announcements
                if document_id in df_ann_indexed.index:
                    dict2 = df_ann_indexed.loc[document_id]

                    dict1 = {
                        "工事場所": dict2["工事場所"],
                        "入札手続等担当部局": {
                            "郵便番号": dict2["入札手続等担当部局___郵便番号"],
                            "住所": dict2["入札手続等担当部局___住所"],
                            "担当部署名": dict2["入札手続等担当部局___担当部署名"],
                            "担当者名": dict2["入札手続等担当部局___担当者名"],
                            "電話番号": dict2["入札手続等担当部局___電話番号"],
                            "FAX番号": dict2["入札手続等担当部局___FAX番号"],
                            "メールアドレス": dict2["入札手続等担当部局___メールアドレス"]
                        },
                        "公告日": dict2["公告日"],
                        "入札方式": dict2["入札方式"],
                        "資料種類": dict2["資料種類"],
                        "category": dict2["category"],
                        "pagecount": dict2["pagecount"],
                        "入札説明書の交付期間": {
                            "開始日": dict2["入札説明書の交付期間___開始日"],
                            "終了日": dict2["入札説明書の交付期間___終了日"]
                        },
                        "申請書及び競争参加資格確認資料の提出期限": {
                            "開始日": dict2["申請書及び競争参加資格確認資料の提出期限___開始日"],
                            "終了日": dict2["申請書及び競争参加資格確認資料の提出期限___終了日"]
                        },
                        "入札書の提出期間": {
                            "開始日": dict2["入札書の提出期間___開始日"],
                            "終了日": dict2["入札書の提出期間___終了日"]
                        }
                    }

                    ann_result = convertJson(json_value=dict1)

                # requirements
                if document_id in df_req_indexed.index:
                    dict2 = df_req_indexed.loc[document_id]

                    if dict2["資格・条件"] is None:
                        requirement_texts = {"資格・条件": ["Missing requirements."]}
                    else:
                        requirement_texts = {
                            "資格・条件": ast.literal_eval(dict2["資格・条件"])
                        }

                    req_result = convertRequirementTextDict(
                        requirement_texts=requirement_texts
                    )

            except Exception as e:
                print(e)

            return ann_result, req_result

        df_ann_updated = []
        df_req_updated = []

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(
                tqdm(
                    executor.map(process_row, [row for _, row in df_ann.iterrows()]),
                    total=len(df_ann)
                )
            )

        for ann, req in results:
            if ann:
                df_ann_updated.append(ann)
            if req:
                df_req_updated.append(req)

        df_ann_updated_df = pd.DataFrame(df_ann_updated)
        df_req_updated_df = pd.DataFrame(df_req_updated)


    # gemini逐次実行
    if False:
        data_type = ["txt","pdf","pdf_fileapi"][1]
        data_type = ["txt","pdf","pdf_fileapi"][2]
        print(fr"data_type={data_type}")
        processed_document_id = []
        #for i, row in tqdm(date_df2.iterrows(), total=len(date_df2)):
        for i, row in tqdm(df_ann.iterrows(), total=len(df_ann)):
            document_id = row["document_id"]

            if False:
                ret = is_document_id_value_nan(document_id, df_ann, df_req)
                if not ret:
                    continue

            try:
                if False:
                    if document_id in processed_document_id:
                        print(fr"Already processed document_id = {document_id}")
                        continue

                url = df_ann[df_ann["document_id"]==document_id]["url"].values[0]

                #f_txt = fr"../4_get_documents/output_v3/pdf_txt_all_py/pdf_{document_id.split('_')[0]}/{document_id}.txt"
                #if os.path.exists(f_txt):
                #    with open(f_txt, "r", encoding="utf-8") as f0:
                #        data_txt = f0.read()
                #else:
                #    print(fr"FileNotFound: {f_txt}")
                if False:
                    f_pdf = fr"../4_get_documents/output_v3/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
                    with open(f_pdf, "rb") as f0:
                        data_pdf = f0.read()   # ただのバイト列

                if True:
                    # announcements
                    if document_id in df_ann["document_id"].values:
                        if False:
                            print(fr"ann - {document_id}")
                            time.sleep(0.2)
                            # dict1 = getJsonFromData(data=data_txt,data_type="txt")
                            if data_type in ["txt","pdf"]:
                                dict1 = getJsonFromData_v2(data=data_pdf,data_type=data_type)
                            elif data_type in ["pdf_fileapi"]:
                                pdf_file = client.files.upload(file=f_pdf)
                                dict1 = getJsonFromData_v2(data=pdf_file,data_type=data_type)
                            else:
                                raise ValueError(fr"Unknown data_type={data_type}.")
                            dict2 = {
                                "document_id": document_id,
                                "工事場所": dict1.get("工事場所"),
                                "入札手続等担当部局___郵便番号": dict1.get("入札手続等担当部局", {}).get("郵便番号"),
                                "入札手続等担当部局___住所": dict1.get("入札手続等担当部局", {}).get("住所"),
                                "入札手続等担当部局___担当部署名": dict1.get("入札手続等担当部局", {}).get("担当部署名"),
                                "入札手続等担当部局___担当者名": dict1.get("入札手続等担当部局", {}).get("担当者名"),
                                "入札手続等担当部局___電話番号": dict1.get("入札手続等担当部局", {}).get("電話番号"),
                                "入札手続等担当部局___FAX番号": dict1.get("入札手続等担当部局", {}).get("FAX番号"),
                                "入札手続等担当部局___メールアドレス": dict1.get("入札手続等担当部局", {}).get("メールアドレス"),
                                "公告日": dict1.get("公告日"),
                                "入札方式": dict1.get("入札方式"),
                                "資料種類": dict1.get("資料種類"),
                                "category": dict1.get("category"),
                                "pagecount": dict1.get("pagecount"),
                                "入札説明書の交付期間___開始日": dict1.get("入札説明書の交付期間", {}).get("開始日"),
                                "入札説明書の交付期間___終了日": dict1.get("入札説明書の交付期間", {}).get("終了日"),
                                "申請書及び競争参加資格確認資料の提出期限___開始日": dict1.get("申請書及び競争参加資格確認資料の提出期限", {}).get("開始日"),
                                "申請書及び競争参加資格確認資料の提出期限___終了日": dict1.get("申請書及び競争参加資格確認資料の提出期限", {}).get("終了日"),
                                "入札書の提出期間___開始日": dict1.get("入札書の提出期間", {}).get("開始日"),
                                "入札書の提出期間___終了日": dict1.get("入札書の提出期間", {}).get("終了日"),
                                "url": None
                            }
                            if False:
                                for k,v in dict2.items():
                                    print(k,v)
                                df_ann.loc[df_ann["document_id"] == document_id,]
                                for cname in df_ann.columns:
                                    print(cname, df_ann.loc[df_ann["document_id"] == document_id,cname].values[0])
                            tmpdict2 = pd.DataFrame(dict2, index=[0])
                            keys = list(tmpdict2.keys())
                            keys = [k for k in keys if k not in ["document_id","url"] ]
                            for key in keys:
                                df_ann.loc[df_ann["document_id"] == document_id, key] = dict2[key]
                            # df_ann[df_ann["document_id"]==document_id]
                            # df_ann = pd.concat([df_ann, tmpdict2], axis=0, ignore_index=True)
                        else:
                            # df_ann から取得して整形...
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
                                "公告日": dict2["公告日"].values[0],
                                "入札方式": dict2["入札方式"].values[0],
                                "資料種類": dict2["資料種類"].values[0],
                                "category": dict2["category"].values[0],
                                "pagecount": dict2["pagecount"].values[0],
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
                    if True:
                        new_json = convertJson(json_value=dict1)
                        df_ann_updated.append(new_json)

                if True:
                    # requirements
                    if document_id in df_req["document_id"].values:
                        if False:
                            print(fr"req - {document_id}")
                            time.sleep(0.2)
                            # requirement_texts = getRequirementText(data=data_txt, data_type="txt")
                            if data_type in ["txt","pdf"]:
                                requirement_texts = getRequirementText(data=data_pdf, data_type=data_type)
                            elif data_type in ["pdf_fileapi"]:
                                requirement_texts = getRequirementText(data=pdf_file, data_type=data_type)
                                client.files.delete(name=pdf_file.name)

                            dict2 = {
                                "document_id" : document_id,
                                "資格・条件" : str(requirement_texts["資格・条件"])
                            }
                            # tmpdict2 = pd.DataFrame(dict2, index=[0])
                            # tmpdict2 = pd.DataFrame([dict2])
                            #df_req = pd.concat([df_req, tmpdict2], axis=0, ignore_index=True)
                            tmpdict2 = pd.DataFrame(dict2, index=[0])
                            keys = list(tmpdict2.keys())
                            keys = [k for k in keys if k not in ["document_id","url"] ]
                            for key in keys:
                                df_req.loc[df_req["document_id"] == document_id, key] = dict2[key]
                            # df_req[df_req["document_id"]==document_id]
                        else:
                            dict2 = df_req[df_req["document_id"]==document_id]
                            if dict2["資格・条件"].isna().all():
                                requirement_texts = {
                                    "資格・条件": ["Missing requirements."]
                                }
                            else:
                                requirement_texts = {
                                    "資格・条件": dict2["資格・条件"].apply(ast.literal_eval).values[0]
                                }
                    if True:
                        dic = convertRequirementTextDict(requirement_texts=requirement_texts)
                        df_req_updated.append(dic)
                processed_document_id.append(document_id)
            except Exception as e:
                print(e)
                #time.sleep(60)


    # gemini逐次実行の並列化検討
    if False:
        # まず params 作成。
        params = []
        print("Check target document_id and make triples of parameters.")
        for i, row in tqdm(df_ann.iterrows(), total=len(df_ann)):
            document_id = row["document_id"]

            if i <= 6000:
                continue

            if i >= 6010:
                break

            if gcp_vm:
                f_pdf = f"gs://ann-files/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"
            else:
                f_pdf = fr"../4_get_documents/output_v3/pdf/pdf_{document_id.split('_')[0]}/{document_id}.pdf"

            # pdf の存在を確認。
            try:
                if gcp_vm:
                    # GCSの場合は存在チェックのみ（実際の読み込みはcall_gemini内で行う）
                    # ここでは簡易的にスキップ（GCS SDKを使う場合は別途実装が必要）
                    pdf_exists = True
                else:
                    # ローカルの場合はファイル存在チェック
                    pdf_exists = os.path.exists(f_pdf)

                if not pdf_exists:
                    print(f"PDF not found: {f_pdf}")
                    continue
            except Exception as e:
                print(e)
                continue

            params.append( [PROMPT_ANN, document_id, "pdf", "gemini-2.5-flash-lite", "ann"] )
            # params.append( [PROMPT_REQ, document_id, "pdf", "gemini-2.5-flash-lite", "req"] )

            # pdf_file = client.files.upload(file=f_pdf)
            # client.files.delete(name=pdf_file.name)

        print("gemini call_parallel.")
        start = time.time()
        results = asyncio.run(call_parallel(params, gcp_vm=gcp_vm))
        end = time.time()
        print(f"処理時間: {end - start:.4f} 秒")
        # 処理時間: 23044.9809 秒
        # pickle 保存
        with open(fr"../4_get_documents/output_v3/gemini_results_{yyyymmdd}.pkl", "wb") as f:
            pickle.dump(results, f)




    if True:
        with open(fr"../4_get_documents/output_v3/gemini_results_20260308.pkl", "rb") as f:
            results = pickle.load(f)

        ann_results = [r for r in results if r["type"] == "ann"]
        req_results = [r for r in results if r["type"] == "req"]

        # エラーのみ抽出
        err_ann = [r for r in results if r["type"] == "ann" and r["error"] is not None]

        # エラー数の確認
        print(f"ann エラー数: {len(err_ann)} / {len([r for r in results if r['type'] == 'ann'])}")

        # エラー内容の確認
        print("Check error just 1 record.")
        for e in err_ann[:1]:  # 最初の5件
            print(f"document_id: {e['document_id']}, error: {e['error']}")


        ann_results = pd.DataFrame(ann_results)
        if False:
            ann_results_2 = []
            print("Process result(ann).")
            for i,row in ann_results.iterrows():
                aa = process_result(row)
                ann_results_2.append(aa[1])
            ann_results_2 = pd.DataFrame(ann_results_2)


        req_results = pd.DataFrame(req_results)
        if False:
            req_results_2 = []
            print("Process result(req).")
            for i,row in req_results.iterrows():
                aa = process_result(row)
                req_results_2.append(aa[1])
            req_results_2 = pd.DataFrame(req_results_2)

        if False:
            (df_ann["document_id"]==df_req["document_id"]).all()
            (df_ann["document_id"].iloc[0:ann_results_2.shape[0]].to_numpy() == ann_results_2["document_id"].to_numpy()).all()
            # df_ann に存在するかどうかのブール列を作る
            ann_results_2["exists_in_df"] = ann_results_2["document_id"].isin(df_ann["document_id"])

            # 集計
            counts = ann_results_2["exists_in_df"].value_counts()
            print(counts)





        # JSON列をリストに展開
        dict_list_0 = []
        dict_list_1 = []

        # row = ann_results[ann_results["document_id"]=="00008_pdf_result_06_10_061011-iwamizawa-r-tenpura"]
        # row = row.iloc[0]
        # ann_results
        for row in tqdm(ann_results.itertuples(index=False)):
            try:
                document_id = row.document_id
                dict0 = row.result.replace('\n','').replace('```json','').replace('```','')
                dict0 = json.loads(dict0)
                dict1 = convertJson(dict0)

                dict0["document_id"] = document_id
                dict1["document_id"] = document_id

                dict2_0 = {
                    "document_id": document_id,
                    "工事場所": dict0.get("工事場所"),
                    "入札手続等担当部局___郵便番号": dict0.get("入札手続等担当部局", {}).get("郵便番号"),
                    "入札手続等担当部局___住所": dict0.get("入札手続等担当部局", {}).get("住所"),
                    "入札手続等担当部局___担当部署名": dict0.get("入札手続等担当部局", {}).get("担当部署名"),
                    "入札手続等担当部局___担当者名": dict0.get("入札手続等担当部局", {}).get("担当者名"),
                    "入札手続等担当部局___電話番号": dict0.get("入札手続等担当部局", {}).get("電話番号"),
                    "入札手続等担当部局___FAX番号": dict0.get("入札手続等担当部局", {}).get("FAX番号"),
                    "入札手続等担当部局___メールアドレス": dict0.get("入札手続等担当部局", {}).get("メールアドレス"),
                    "公告日": dict0.get("公告日"),
                    "入札方式": dict0.get("入札方式"),
                    "資料種類": dict0.get("資料種類"),
                    "category": dict0.get("category"),
                    "pagecount": dict0.get("pagecount"),
                    "入札説明書の交付期間___開始日": dict0.get("入札説明書の交付期間", {}).get("開始日"),
                    "入札説明書の交付期間___終了日": dict0.get("入札説明書の交付期間", {}).get("終了日"),
                    "申請書及び競争参加資格確認資料の提出期限___開始日": dict0.get("申請書及び競争参加資格確認資料の提出期限", {}).get("開始日"),
                    "申請書及び競争参加資格確認資料の提出期限___終了日": dict0.get("申請書及び競争参加資格確認資料の提出期限", {}).get("終了日"),
                    "入札書の提出期間___開始日": dict0.get("入札書の提出期間", {}).get("開始日"),
                    "入札書の提出期間___終了日": dict0.get("入札書の提出期間", {}).get("終了日"),
                    "url": None
                }
                dict2_1 = {
                    "document_id": document_id,
                    "工事場所": dict1.get("workplace"),
                    "入札手続等担当部局___郵便番号": dict1.get("zipcode"),
                    "入札手続等担当部局___住所": dict1.get("address"),
                    "入札手続等担当部局___担当部署名": dict1.get("department"),
                    "入札手続等担当部局___担当者名": dict1.get("assigneename"),
                    "入札手続等担当部局___電話番号": dict1.get("telephone"),
                    "入札手続等担当部局___FAX番号": dict1.get("fax"),
                    "入札手続等担当部局___メールアドレス": dict1.get("mail"),
                    "公告日": dict1.get("publishdate"),
                    "入札方式": dict1.get("bidType"),
                    "資料種類": dict1.get("category"),
                    "pagecount": dict1.get("pagecount"),
                    "入札説明書の交付期間___開始日": dict1.get("docdiststart"),
                    "入札説明書の交付期間___終了日": dict1.get("docdistend"),
                    "申請書及び競争参加資格確認資料の提出期限___開始日": dict1.get("submissionstart"),
                    "申請書及び競争参加資格確認資料の提出期限___終了日": dict1.get("submissionend"),
                    "入札書の提出期間___開始日": dict1.get("bidstartdate"),
                    "入札書の提出期間___終了日": dict1.get("bidenddate"),
                    "url": None
                }


                dict_list_0.append(dict2_0)
                dict_list_1.append(dict2_1)
            except Exception as e:
                continue

        # 必要な列だけ抽出
        columns_to_keep = [
            'document_id', '公告日', '入札説明書の交付期間___開始日', '入札説明書の交付期間___終了日', 
            '申請書及び競争参加資格確認資料の提出期限___開始日', '申請書及び競争参加資格確認資料の提出期限___終了日', 
            '入札書の提出期間___開始日', '入札書の提出期間___終了日'
        ]
        # 一括でDataFrame化
        df0 = pd.DataFrame(dict_list_0)
        df0 = df0[columns_to_keep]
        df1 = pd.DataFrame(dict_list_1)
        df1 = df1[columns_to_keep]

        cols_0 = [
            '公告日', '入札説明書の交付期間___開始日', '入札説明書の交付期間___終了日', 
            '申請書及び競争参加資格確認資料の提出期限___開始日', '申請書及び競争参加資格確認資料の提出期限___終了日', 
            '入札書の提出期間___開始日', '入札書の提出期間___終了日'
        ]
        vals_0 = (
            df0[cols_0]
            .stack()
            .loc[lambda s: s.str.len() < 8]
            .tolist()
        )
        cols_1 = [
            '公告日', '入札説明書の交付期間___開始日', '入札説明書の交付期間___終了日', 
            '申請書及び競争参加資格確認資料の提出期限___開始日', '申請書及び競争参加資格確認資料の提出期限___終了日', 
            '入札書の提出期間___開始日', '入札書の提出期間___終了日'
        ]
        vals_1 = (
            df1[cols_1]
            .stack()
            .loc[lambda s: s.str.len() < 10]
            .tolist()
        )
        xx = list(set(vals_0))
        xx = [x for x in xx if x != ""]
        print(xx)
        # df0[df0.isin(xx[33:34]).any(axis=1)]
        # df1[df1.isin(xx[33:34]).any(axis=1)]
        # df0[df0.astype(str).apply(lambda col: col.str.startswith("同月", na=False)).any(axis=1)]
        # df0[df0.astype(str).apply(lambda col: col.str.startswith("同月", na=False)).any(axis=1)]["申請書及び競争参加資格確認資料の提出期限___終了日"]
        # df1[df0.astype(str).apply(lambda col: col.str.startswith("同月", na=False)).any(axis=1)]["申請書及び競争参加資格確認資料の提出期限___終了日"]
        # df_ann[df_ann["document_id"] == df0[df0[cols_0[0]].isin(xx[18:19])].values[0][0] ]["url"].values
        set(vals_1)

    if False:
        results2 = []
        tmp_req_df_list = []
        tmp_ann_df_list = []
        for i,res in enumerate(tqdm(results, total=len(results))):
            document_id = res["document_id"]
            type1 = res["type"]

            if type1 == "req":
                try:
                    text2 = res["result"].replace('\n', '').replace('```json', '').replace("```","")
                    # text2 = text2.replace('\n', '').replace('```json', '').replace("```","")
                except Exception as e:
                    text2 = res["error"]
                    text2 = "ERROR"
                try:
                    requirement_texts = json.loads(text2)
                except json.decoder.JSONDecodeError:
                    text2 = text2.replace('"',"'")
                    requirement_texts = json.loads('{"資格・条件" : ["' + text2 + '"]}')

                dict2 = {
                    "document_id" : document_id,
                    "資格・条件" : str(requirement_texts["資格・条件"])
                }
                # tmpdict2 = pd.DataFrame(dict2, index=[0])
                # tmpdict2 = pd.DataFrame([dict2])
                #df_req = pd.concat([df_req, tmpdict2], axis=0, ignore_index=True)
                tmpdict2 = pd.DataFrame(dict2, index=[0])
                if True:
                    keys = list(tmpdict2.keys())
                    keys = [k for k in keys if k not in ["document_id","url"] ]
                    for key in keys:
                        df_req.loc[df_req["document_id"] == document_id, key] = dict2[key]
                    # df_ann[df_ann["document_id"]==document_id]
                tmp_req_df_list.append(tmpdict2)
            else:
                dict1 = res["result"].replace('\n', '').replace('```json', '').replace("```","")
                dict1 = json.loads(dict1)
                dict2 = {
                    "document_id": document_id,
                    "工事場所": dict1.get("工事場所"),
                    "入札手続等担当部局___郵便番号": dict1.get("入札手続等担当部局", {}).get("郵便番号"),
                    "入札手続等担当部局___住所": dict1.get("入札手続等担当部局", {}).get("住所"),
                    "入札手続等担当部局___担当部署名": dict1.get("入札手続等担当部局", {}).get("担当部署名"),
                    "入札手続等担当部局___担当者名": dict1.get("入札手続等担当部局", {}).get("担当者名"),
                    "入札手続等担当部局___電話番号": dict1.get("入札手続等担当部局", {}).get("電話番号"),
                    "入札手続等担当部局___FAX番号": dict1.get("入札手続等担当部局", {}).get("FAX番号"),
                    "入札手続等担当部局___メールアドレス": dict1.get("入札手続等担当部局", {}).get("メールアドレス"),
                    "公告日": dict1.get("公告日"),
                    "入札方式": dict1.get("入札方式"),
                    "資料種類": dict1.get("資料種類"),
                    "category": dict1.get("category"),
                    "pagecount": dict1.get("pagecount"),
                    "入札説明書の交付期間___開始日": dict1.get("入札説明書の交付期間", {}).get("開始日"),
                    "入札説明書の交付期間___終了日": dict1.get("入札説明書の交付期間", {}).get("終了日"),
                    "申請書及び競争参加資格確認資料の提出期限___開始日": dict1.get("申請書及び競争参加資格確認資料の提出期限", {}).get("開始日"),
                    "申請書及び競争参加資格確認資料の提出期限___終了日": dict1.get("申請書及び競争参加資格確認資料の提出期限", {}).get("終了日"),
                    "入札書の提出期間___開始日": dict1.get("入札書の提出期間", {}).get("開始日"),
                    "入札書の提出期間___終了日": dict1.get("入札書の提出期間", {}).get("終了日"),
                    "url": None
                }

                if False:
                    for k,v in dict2.items():
                        print(k,v)
                    df_ann.loc[df_ann["document_id"] == document_id,]
                    for cname in df_ann.columns:
                        print(cname, df_ann.loc[df_ann["document_id"] == document_id,cname].values[0])
                tmpdict2 = pd.DataFrame(dict2, index=[0])
                if True:
                    keys = list(tmpdict2.keys())
                    keys = [k for k in keys if k not in ["document_id","url"] ]
                    for key in keys:
                        df_ann.loc[df_ann["document_id"] == document_id, key] = dict2[key]
                    # df_req[df_req["document_id"]==document_id]
                tmp_ann_df_list.append(tmpdict2)


    # 保存
    if False:
        df_ann.to_csv(output_path_ann, sep="\t", index=False)
        df_ann.to_csv(output_path_ann_zip, sep="\t", compression="zip", index=False)
        df_req.to_csv(output_path_req, sep="\t", index=False)
        df_req.to_csv(output_path_req_zip, sep="\t", compression="zip", index=False)

    if False:
        tmp_ann_df = pd.concat(tmp_ann_df_list)
        tmp_ann_df = tmp_ann_df.reset_index(drop=True)
        tmp_req_df = pd.concat(tmp_req_df_list)
        tmp_req_df = tmp_req_df.reset_index(drop=True)

        xxx = tmp_req_df[tmp_req_df["資格・条件"].str.len() <= 10]
        xxx = tmp_req_df[tmp_req_df["資格・条件"].str.len() <= 30]
        xxx = tmp_req_df[tmp_req_df["資格・条件"].str.contains("ERROR")]
        xxx["資格・条件"].value_counts()



    if False:
        df_ann_updated = pd.DataFrame(df_ann_updated)
        df_ann_updated["zipcode"].value_counts()
        df_ann_updated["bidenddate"].value_counts()
        df_ann_updated.columns

        df_req_updated = pd.DataFrame(df_req_updated)
        # こいつらは保存し (て）ない。

    if False:
        df_ann_updated_latest = df_ann_updated["2026-01-01" <= df_ann_updated["publishdate"]]
        df_ann_updated_latest.shape
        df_ann_updated_latest["publishdate"].value_counts()
        df_ann_updated_latest["bidenddate"].value_counts()

        df_ann_updated_latest = df_ann_updated["2026-03-01" <= df_ann_updated["submissionend"]]
        df_ann_updated_latest.shape
        df_ann_updated_latest["publishdate"].value_counts()
        df_ann_updated_latest["bidenddate"].value_counts()






