import pytest

from packages.engine.domain.ocr_processing import OcrProcessingMixin


class _OcrHelper(OcrProcessingMixin):
    """Minimal helper to expose _convertJson for testing."""

    pass


def test_convert_json_normalizes_category_and_submission_dates():
    helper = _OcrHelper()
    payload = {
        "工事場所": "東京都新宿区",
        "入札方式": "open_counter",
        "資料種類": "入札公告",
        "category": ["物品の製造", "電子計算機類"],
        "入札説明書の交付期間": {"開始日": "2024年4月1日", "終了日": "同年4月10日"},
        "提出書類一覧": [
            {
                "書類名": "見積書",
                "日付": "令和6年4月5日",
                "意味": "入札書提出期間",
                "時点": "開始",
            },
            {
                "書類名": "見積書",
                "日付": "令和6年4月10日",
                "意味": "入札書提出期間",
                "時点": "終了",
            }
        ],
    }

    converted = helper._convertJson(payload)

    assert converted["category"] == "物品の製造 / 電子計算機類"
    assert converted["docdiststart"] == "2024-04-01"
    assert converted["docdistend"] == "2024-04-10"

    submissions = converted["submission_documents"]
    assert len(submissions) == 2
    assert submissions[0]["submission_document_name"] == "見積書"
    assert submissions[0]["date_value"] == "2024-04-05"
    assert submissions[0]["date_meaning"] == "入札書提出期間"
    assert submissions[0]["timepoint_type"] == "start"
    assert submissions[1]["timepoint_type"] == "end"
