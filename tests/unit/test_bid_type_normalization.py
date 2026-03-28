import pytest

from packages.engine.domain.ocr_processing import OcrProcessingMixin


class _BidTypeHelper(OcrProcessingMixin):
    """Expose bid type helpers for testing."""

    pass


@pytest.fixture
def helper():
    return _BidTypeHelper()


def test_normalize_bid_type_detects_open_counter(helper):
    text = "本件はオープンカウンター方式で実施します。"
    assert helper._normalize_bid_type_value(text) == "open_counter"


def test_normalize_bid_type_handles_japanese_negation(helper):
    text = "オープンカウンターによらない一般競争入札です。"
    assert helper._normalize_bid_type_value(text) == "open_competitive"


def test_normalize_bid_type_handles_english_negation(helper):
    text = "This is not open counter procurement."
    assert helper._normalize_bid_type_value(text) is None


def test_select_preferred_bid_type_prioritizes_rules(helper):
    result = helper._select_preferred_bid_type("open_competitive", "open_counter")
    assert result == "open_counter"


def test_select_preferred_bid_type_skips_empty(helper):
    result = helper._select_preferred_bid_type(None, "", "negotiated_contract")
    assert result == "negotiated_contract"
