#coding: utf-8
"""
Gemini プロンプト定数を提供する Mixin。

NOTE: プロンプト中の入札方式 (BidType) の列挙値は
packages/engine/domain/constants.py の BID_TYPE_* 定数と対応している。
プロンプトは自然言語テキストのためリテラル埋め込みだが、
定数側を変更した場合はプロンプトも手動で更新すること。
"""


class GeminiPromptsMixin:
    """Geminiプロンプト定数を提供するMixin"""

    # Gemini プロンプト定義
    _PROMPT_ANN = """
Goal: Extract specific information related to construction projects and bidding procedures from the provided context.

Steps (T1 -> T2 -> T3):
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
"pageCount" : "",
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
},
"提出書類一覧": [
  {
    "書類名": "",
    "日付": "",
    "意味": "",
    "時点": "開始"
  }
]
}
```

Rules:
1.  **Exact Text:** Use the exact original text from the context for all extracted data.  Do not modify or translate the text.
1-1. As to the "入札方式" field, please set one from: open_competitive, designated_competitive, negotiated_contract, planning_competition, preferred_designation, open_counter, document_request, opinion_request, unknown, other. 参考基準:
    - open_counter: 「見積」「オープンカウンター」「見積書の提出」など、少額随意・見積合わせを明示する場合。提出物が「見積書」「見積書一式」等なら優先。
    - open_competitive / designated_competitive: 一般競争入札か指名競争を明示している場合。
    - planning_competition / document_request / opinion_request: 企画競争、意見募集、公募型プロポーザル等を明示している場合。
    - negotiated_contract / preferred_designation: 随意契約や特定業者のみと記載されている場合。
    - 当てはまらない場合は unknown か other を使用する。
1-2. As to the "資料種類" field, please set one from: "公募", "一般競争入札", "指名停止措置", "入札公告", "変更公告/注意事項公告/訂正公告/再公告", "中止", "企画競争実施の公示", "企画競争に係る手続開始の公示", "競争参加者の資格に関する公示", "見積書", "見積依頼書", "品目等内訳書", "入札書", "入札結果", "公告結果", "仕様書", "情報提案要求書", "業者の選定", "その他".
1-3. As to the "category" field, strictly use the enumerations below. Construction work（各発注機関用） must be one of: '土木', '建築', '大工', '左官', 'とび・土工・コンクリート', '石', '屋根', '電気', '管', 'タイル・れんが・ブロック', '鋼構造物', '鉄筋', '舗装', 'しゅんせつ', '板金', 'ガラス', '塗装', '防水', '内装仕上', '機械装置', '熱絶縁', '電気通信', '造園', 'さく井', '建具', '水道施設', '消防施設', '清掃施設', '解体', 'その他', 'グラウト', '維持', '自然環境共生', '水環境処理'. Goods / services（全省庁統一）は必ず `"{大分類} / {中分類}"` 形式で記載する:
    - 物品の製造: '衣服・その他繊維製品類', 'ゴム・皮革・プラスチック製品類', '窯業・土石製品類', '非鉄金属・金属製品類', 'フォーム印刷', 'その他印刷類', '図書類', '電子出版物類', '紙・紙加工品類', '車両類', 'その他輸送・搬送機械器具類', '船舶類', '燃料類', '家具・什器類', '一般・産業用機器類', '電気・通信用機器類', '電子計算機類', '精密機器類', '医療用機器類', '事務用機器類', 'その他機器類', '医薬品・医療用品類', '事務用品類', '土木・建設・建築材料', '警察用装備品類', '防衛用装備品類', 'その他'.
    - 物品の販売: '衣服・その他繊維製品類', 'ゴム・皮革・プラスチック製品類', '窯業・土石製品類', '非鉄金属・金属製品類', 'フォーム印刷', 'その他印刷類', '図書類', '電子出版物類', '紙・紙加工品類', '車両類', 'その他輸送・搬送機械器具類', '船舶類', '燃料類', '家具・什器類', '一般・産業用機器類', '電気・通信用機器類', '電子計算機類', '精密機器類', '医療用機器類', '事務用機器類', 'その他機器類', '医薬品・医療用品類', '事務用品類', '土木・建設・建築材料', '警察用装備品類', '防衛用装備品類', 'その他'.
    - 役務の提供等: '広告・宣伝', '写真・製図', '調査・研究', '情報処理', '翻訳・通訳・速記', 'ソフトウェア開発', '会場等の借り上げ', '賃貸借', '建物管理等各種保守管理', '運送', '車両整備', '船舶整備', '電子出版', '防衛用装備品類の整備', 'その他'.
    - 物品の買受け: '立木竹', 'その他'.
    If nothing matches, use "other".
1-4. **提出書類一覧:** 文中に記載された提出物・添付書類ごとに、(書類名, 日付, 意味, 時点) の四つ組を列挙する。期間を表すものは必ず開始と終了の2エントリを作り、"時点" に「開始」「終了」を設定する。単日のイベント（公告日や説明会など）は "時点" を「単日」にし1件のままで良い。日付は判読できれば YYYY-MM-DD に変換し、難しい場合は原文のまま残す。意味欄には締切などの説明をそのまま記載する。
2.  **Completeness:**  Extract all requested fields. If a field is not found in the context, represent it with an empty string (`""`). No omissions are allowed.
3.  **Limited Output:** Only include the specified fields in the JSON output. Do not add any extra information or labels.
4.  **Hide Steps:** Do not display the internal steps (T1 or T2). Only the final JSON output (T3) should be shown.
5.  **Prefix Exclusion:** Exclude prefixes like "〒", "TEL", "FAX", and "E-mail:" from the extracted values.
6.  **Output Language:** The output (field names and extracted text if applicable) should be in Japanese.
7. **Data Structure:** Maintain the nested structure shown in the JSON Structure above.  "入札手続等担当部局", "入札説明書の交付期間", "申請書及び競争参加資格確認資料の提出期限" and "入札書の提出期間" are objects containing their respective sub-fields.
"""

    _PROMPT_REQ = """
# Goal Seek Prompt for Bid Qualification Extraction

[Input]
-> [Extract bidding qualifications from document]
-> [Intent](identify, extract, format, maintain original text, output JSON)

[Input]
-> [User Intent]
-> [Want or need Intent](accurate extraction, complete requirements, properly formatted JSON, faithful text reproduction)

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

    _PROMPT_OCR_JSON = """
You are an OCR and document-structure extraction system.
Return plain extracted text from the PDF and a compact JSON structure summary.
Output JSON with keys:
- extracted_text
- normalized_structure
Do not add explanations outside JSON.
"""

    _PROMPT_MD = """
あなたは日本語の建設・調達関連文書を要約する専門アシスタントです。添付 PDF の内容を読み、次のルールに従って Markdown でまとめてください。

ルール:
1. 出力は Markdown だけにし、余計な説明や JSON は付けない。
2. 以下のセクション構成を必ず守る:
   # 概要
   ## 日程
   ## 発注者・問い合わせ先
   ## 主要条件
   ## その他特記事項
3. それぞれのセクションでは原文の日本語を尊重し、必要に応じて箇条書きで整理する。情報が無い場合は「情報なし」と明記する。
4. 日付は判読できる場合 YYYY-MM-DD 形式に変換する。難しい場合は原文のまま残す。
5. 数値や固有名詞は可能な限り具体的に保つ。
"""
