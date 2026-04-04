#coding: utf-8
"""
Structured notice utilities used by the HTML extraction pipeline.

This module normalizes table cell text, infers metadata (category, method,
dates, etc.), and encapsulates the results via the StructuredNotice/NoticeDocument
dataclasses so that downstream processing can treat every matrix or row cell as
an independent notice.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

from packages.engine.domain.constants import ERA_OFFSETS

DEFAULT_FIELD_RULES = {
    "title_labels": ["工事名", "業務名", "件名", "案件名", "調達件名", "業務件名", "委託業務名", "物件名"],
    "announced_at_labels": ["公告日", "公示日", "掲載日", "公開日", "発注日"],
    "deadline_labels": [
        "申請書等提出期限",
        "参加表明書提出期限",
        "技術提案書提出期限",
        "申請期限",
        "提出期限",
        "質問期限",
        "受付期限",
        "募集要領配布期間",
    ],
    "open_at_labels": ["開札日", "見積合わせ日", "見積書提出日", "入札日", "入札執行日", "ヒアリング実施日"],
    "location_labels": ["工事場所", "業務場所", "履行場所", "納入場所", "対象地域", "対象施設"],
    "noise_selectors": [".pdfsize", ".ic_target"],
}

PLACEHOLDER_VALUES = {"", "-", "－", "ー", "―", "なし", "該当なし"}
CATEGORY_FIELD_KEYWORDS = (
    "種別",
    "区分",
    "分類",
    "カテゴリ",
    "品目",
    "工種",
    "業種",
    "対象",
    "調達種別",
    "案件種別",
    "工事/役務",
    "入札種別",
)
PROCUREMENT_FIELD_KEYWORDS = (
    "入札方法",
    "入札方式",
    "契約方法",
    "契約方式",
    "調達方式",
    "実施方式",
    "方式区分",
    "募集方式",
    "手続",
    "オープンカウンター",
)
TITLE_HINT_TOKENS = ("件名", "内容")
ZENKAKU_TRANSLATION = str.maketrans("０１２３４５６７８９／．－", "0123456789/.-")


@dataclass(slots=True)
class NoticeDocument:
    label: str
    href: str
    source_label: Optional[str] = None


@dataclass(slots=True)
class StructuredNotice:
    title: str
    normalized_title: str
    category_name: Optional[str] = None
    category_code: Optional[str] = None
    procurement_method: Optional[str] = None
    announced_at: Optional[str] = None
    deadline: Optional[str] = None
    open_at: Optional[str] = None
    location: Optional[str] = None
    fields: Dict[str, str] = field(default_factory=dict)
    documents: List[NoticeDocument] = field(default_factory=list)
    raw_html: str = ""


def normalize_space(value: str) -> str:
    value = value.replace("\xa0", " ").replace("\u3000", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def normalize_title(value: str) -> str:
    cleaned = normalize_space(value)
    cleaned = re.sub(r"\(PDF:[^)]+\)", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("（PDF:", "(")
    return normalize_space(cleaned)


def clean_document_label(value: str) -> str:
    cleaned = normalize_title(value)
    cleaned = re.sub(r"\s*別ウインドウで開く\s*", "", cleaned)
    return normalize_space(cleaned)


def normalize_field_label(label: str) -> str:
    normalized = normalize_space(label)
    return normalized.replace(" ", "")


def slugify_identifier(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    normalized = normalize_space(value)
    normalized = normalized.lower()
    normalized = re.sub(r"[^\w\-]", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized or None


def merge_field_rules(base: Dict[str, List[str]], override: Optional[Dict[str, List[str]]]) -> Dict[str, List[str]]:
    merged = {key: list(values) for key, values in base.items()}
    if not override:
        return merged

    for key, values in override.items():
        if key not in merged:
            continue
        if isinstance(values, list):
            merged[key] = [str(value) for value in values if str(value).strip()]
    return merged


def pick_field(fields: Dict[str, str], labels: List[str]) -> Optional[str]:
    normalized = {normalize_field_label(k): v for k, v in fields.items()}
    for label in labels:
        candidate = normalized.get(normalize_field_label(label))
        if candidate:
            cleaned = normalize_space(candidate)
            if cleaned and cleaned not in PLACEHOLDER_VALUES:
                return cleaned
    return None


def looks_like_placeholder(value: Optional[str]) -> bool:
    if value is None:
        return True
    cleaned = normalize_space(value)
    if not cleaned:
        return True
    return cleaned in PLACEHOLDER_VALUES


def infer_category_from_fields(fields: Dict[str, str], *, fallback: Optional[str] = None) -> Optional[str]:
    for label, value in fields.items():
        normalized_label = normalize_field_label(label)
        if any(keyword in normalized_label for keyword in CATEGORY_FIELD_KEYWORDS):
            cleaned = normalize_space(value)
            if cleaned and not looks_like_placeholder(cleaned):
                return cleaned
    if fallback and not looks_like_placeholder(fallback):
        return normalize_space(fallback)
    return None


def infer_procurement_method(fields: Dict[str, str], *, fallback: Optional[str] = None) -> Optional[str]:
    for label, value in fields.items():
        normalized_label = normalize_field_label(label)
        if "方式" in normalized_label and not any(
            token in normalized_label for token in ("入札", "調達", "契約", "実施", "募集", "手続")
        ):
            continue
        if any(keyword in normalized_label for keyword in PROCUREMENT_FIELD_KEYWORDS):
            cleaned = normalize_space(value)
            if cleaned and not looks_like_placeholder(cleaned):
                return cleaned
    if fallback and not looks_like_placeholder(fallback):
        normalized_fallback = normalize_space(fallback)
        if "ｶｳﾝﾀ" in normalized_fallback or "カウンタ" in normalized_fallback or "カウンター" in normalized_fallback:
            return normalized_fallback
    return None


def infer_notice_title(fields: Dict[str, str], field_rules: Dict[str, List[str]], docs: List[NoticeDocument]) -> Optional[str]:
    title = pick_field(fields, field_rules.get("title_labels", []))
    if title:
        return title
    for label, value in fields.items():
        normalized_label = normalize_field_label(label)
        if normalized_label in {normalize_field_label(token) for token in TITLE_HINT_TOKENS}:
            cleaned = normalize_space(value)
            if cleaned:
                return cleaned
    if docs:
        return docs[0].label
    return None


def parse_japanese_date(text: Optional[str]) -> Optional[date]:
    """Parse Japanese-style dates (和暦や略記) used in MOD pages."""
    if not text:
        return None

    value = normalize_space(text)
    value = value.translate(ZENKAKU_TRANSLATION)
    value = value.replace("／", "/").replace("．", ".").replace("－", "-")
    value = value.replace("元年", "1年")

    patterns = [
        (r"^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$", None),
        (r"^(\d{4})年(\d{1,2})月(\d{1,2})日$", None),
        (r"^(?:令和|R|Ｒ)\s*(\d{1,2})\s*[./年]\s*(\d{1,2})\s*[./月]\s*(\d{1,2})日?$", "reiwa"),
        (r"^(?:平成|H|Ｈ)\s*(\d{1,2})\s*[./年]\s*(\d{1,2})\s*[./月]\s*(\d{1,2})日?$", "heisei"),
    ]
    for pattern, era_kind in patterns:
        match = re.search(pattern, value)
        if not match:
            continue
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3))
        if era_kind in ERA_OFFSETS:
            year += ERA_OFFSETS[era_kind]
        try:
            return date(year, month, day)
        except ValueError:
            return None

    compact = re.search(r"^(?:令和|R|Ｒ)\s*(\d{1,2})\.(\d{1,2})\.(\d{1,2})$", value)
    if compact:
        try:
            return date(int(compact.group(1)) + ERA_OFFSETS["reiwa"], int(compact.group(2)), int(compact.group(3)))
        except ValueError:
            return None

    shorthand = re.search(r"^(\d{1,2})[./](\d{1,2})[./](\d{1,2})$", value)
    if shorthand:
        try:
            year = int(shorthand.group(1))
            month = int(shorthand.group(2))
            day = int(shorthand.group(3))
            if 1 <= year <= 31:
                return date(year + ERA_OFFSETS["reiwa"], month, day)
        except ValueError:
            return None
    return None
