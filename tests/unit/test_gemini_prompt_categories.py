from packages.engine.domain.gemini_prompts import GeminiPromptsMixin


CONSTRUCTION_CATEGORIES = [
    "土木",
    "建築",
    "大工",
    "左官",
    "とび・土工・コンクリート",
    "石",
    "屋根",
    "電気",
    "管",
    "タイル・れんが・ブロック",
    "鋼構造物",
    "鉄筋",
    "舗装",
    "しゅんせつ",
    "板金",
    "ガラス",
    "塗装",
    "防水",
    "内装仕上",
    "機械装置",
    "熱絶縁",
    "電気通信",
    "造園",
    "さく井",
    "建具",
    "水道施設",
    "消防施設",
    "清掃施設",
    "解体",
    "その他",
    "グラウト",
    "維持",
    "自然環境共生",
    "水環境処理",
]

MANUFACTURE_CATEGORIES = [
    "衣服・その他繊維製品類",
    "ゴム・皮革・プラスチック製品類",
    "窯業・土石製品類",
    "非鉄金属・金属製品類",
    "フォーム印刷",
    "その他印刷類",
    "図書類",
    "電子出版物類",
    "紙・紙加工品類",
    "車両類",
    "その他輸送・搬送機械器具類",
    "船舶類",
    "燃料類",
    "家具・什器類",
    "一般・産業用機器類",
    "電気・通信用機器類",
    "電子計算機類",
    "精密機器類",
    "医療用機器類",
    "事務用機器類",
    "その他機器類",
    "医薬品・医療用品類",
    "事務用品類",
    "土木・建設・建築材料",
    "警察用装備品類",
    "防衛用装備品類",
    "その他",
]

SERVICE_CATEGORIES = [
    "広告・宣伝",
    "写真・製図",
    "調査・研究",
    "情報処理",
    "翻訳・通訳・速記",
    "ソフトウェア開発",
    "会場等の借り上げ",
    "賃貸借",
    "建物管理等各種保守管理",
    "運送",
    "車両整備",
    "船舶整備",
    "電子出版",
    "防衛用装備品類の整備",
    "その他",
]

BUYBACK_CATEGORIES = ["立木竹", "その他"]


def test_prompt_contains_all_required_categories():
    prompt = GeminiPromptsMixin._PROMPT_ANN

    for name in CONSTRUCTION_CATEGORIES:
        assert name in prompt, f"Missing construction category: {name}"

    for name in MANUFACTURE_CATEGORIES:
        assert name in prompt, f"Missing manufacture category: {name}"

    for name in MANUFACTURE_CATEGORIES:
        assert name in prompt, f"Missing sales category: {name}"

    for name in SERVICE_CATEGORIES:
        assert name in prompt, f"Missing service category: {name}"

    for name in BUYBACK_CATEGORIES:
        assert name in prompt, f"Missing buyback category: {name}"

    assert "時点" in prompt, "Prompt must mention 時点 field for schedule entries"
