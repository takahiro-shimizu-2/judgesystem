import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Optional, Sequence


@dataclass(frozen=True)
class SourceSpec:
    name: str
    top_agency: Optional[str] = None
    sub_agency: Optional[str] = None
    page_code: Optional[str] = None
    matrix_header_keywords: Sequence[str] = ()
    force_matrix: bool = False
    source_url: Optional[str] = None
    submitted_source_url: Optional[str] = None
    page_behavior_json: dict = field(default_factory=dict)
    field_rules: dict = field(default_factory=dict)


BUILTIN_SOURCE_SPECS: tuple[SourceSpec, ...] = (
    SourceSpec(
        name="mod_internal_procurement",
        top_agency="防衛省",
        sub_agency="内部部局",
        matrix_header_keywords=("公告日",),
        force_matrix=True,
    ),
    SourceSpec(
        name="mod_gsj",
        top_agency="防衛省",
        sub_agency="陸上自衛隊",
        matrix_header_keywords=("公告日",),
    ),
)

SOURCE_SPEC_FILE = Path(__file__).with_name("source_pages.json")
REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_SPEC_GENERATED_FILE = REPO_ROOT / "config" / "source_pages.generated.json"


def _parse_page_behavior(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return json.loads(value)
        except Exception:
            return {}
    return {}


def _extract_field_rules_from_behavior(behavior):
    if not behavior:
        return {}
    override = behavior.get("structured_page_override") or {}
    field_rules = override.get("field_rules")
    if not isinstance(field_rules, dict):
        return {}
    result = {}
    for key, values in field_rules.items():
        if not isinstance(values, list):
            continue
        cleaned = [str(value) for value in values if str(value).strip()]
        result[key] = cleaned
    return result


def _load_source_specs_from_file(path: Path):
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"{SOURCE_SPEC_FILE} は配列JSONである必要があります")

    specs = []
    for index, row in enumerate(payload, start=1):
        if not isinstance(row, dict):
            continue
        behavior = _parse_page_behavior(row.get("page_behavior_json"))
        specs.append(
            SourceSpec(
                name=str(row.get("name") or f"source_{index}"),
                top_agency=row.get("top_agency"),
                sub_agency=row.get("sub_agency"),
                page_code=row.get("page_code"),
                matrix_header_keywords=tuple(row.get("matrix_header_keywords") or ()),
                force_matrix=bool(row.get("force_matrix")),
                source_url=row.get("source_url"),
                submitted_source_url=row.get("submitted_source_url"),
                page_behavior_json=behavior,
                field_rules=_extract_field_rules_from_behavior(behavior),
            )
        )
    return specs


@lru_cache(maxsize=1)
def _all_source_specs():
    specs = list(BUILTIN_SOURCE_SPECS)
    specs += _load_source_specs_from_file(SOURCE_SPEC_FILE)
    specs += _load_source_specs_from_file(SOURCE_SPEC_GENERATED_FILE)
    unique = {}
    for spec in specs:
        key = spec.page_code or f"{spec.top_agency}:{spec.sub_agency}"
        if key not in unique:
            unique[key] = spec
    return list(unique.values())


def _normalize_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return value.strip().rstrip("/")


def _match_by_page_code(specs, page_code: Optional[str]) -> Optional[SourceSpec]:
    normalized = (page_code or "").strip()
    if not normalized:
        return None
    for spec in specs:
        if spec.page_code and spec.page_code == normalized:
            return spec
    return None


def _match_by_url(specs, source_url: Optional[str]) -> Optional[SourceSpec]:
    normalized = _normalize_url(source_url)
    if not normalized:
        return None
    for spec in specs:
        if spec.source_url and _normalize_url(spec.source_url) == normalized:
            return spec
        if spec.submitted_source_url and _normalize_url(spec.submitted_source_url) == normalized:
            return spec
    return None


def find_source_spec(
    *,
    top_agency: Optional[str] = None,
    sub_agency: Optional[str] = None,
    page_code: Optional[str] = None,
    source_url: Optional[str] = None,
) -> Optional[SourceSpec]:
    """
    定義済みの SourceSpec から一致するものを返す。
    page_code → source_url → top_agency/sub_agency の優先順位でマッチングする。
    """
    specs = _all_source_specs()
    spec = _match_by_page_code(specs, page_code)
    if spec:
        return spec
    spec = _match_by_url(specs, source_url)
    if spec:
        return spec

    normalized_top = (top_agency or "").strip()
    normalized_sub = (sub_agency or "").strip()
    for spec in specs:
        if spec.top_agency and spec.top_agency != normalized_top:
            continue
        if spec.sub_agency and spec.sub_agency != normalized_sub:
            continue
        return spec
    return None


def _parse_matrix_keywords(raw_value: Optional[str]):
    if not raw_value:
        return ()
    try:
        data = json.loads(raw_value)
        if isinstance(data, list):
            return tuple(str(item) for item in data if str(item).strip())
    except Exception:
        pass
    return tuple(keyword.strip() for keyword in str(raw_value).split(",") if keyword.strip())


def _spec_from_record(record: dict) -> SourceSpec:
    behavior_json = _parse_page_behavior(record.get("page_behavior_json"))
    return SourceSpec(
        name=str(record.get("page_code") or record.get("page_name") or record.get("id") or "source_page"),
        top_agency=record.get("top_agency_name") or record.get("agency_name"),
        sub_agency=record.get("sub_agency_name"),
        page_code=record.get("page_code"),
        matrix_header_keywords=_parse_matrix_keywords(record.get("matrix_header_keywords")),
        force_matrix=bool(record.get("force_matrix")),
        source_url=record.get("source_url"),
        submitted_source_url=record.get("submitted_source_url"),
        page_behavior_json=behavior_json,
        field_rules=_extract_field_rules_from_behavior(behavior_json),
    )


def find_source_spec_from_db(
    db_operator,
    *,
    page_code=None,
    top_agency=None,
    sub_agency=None,
    source_url=None,
) -> Optional[SourceSpec]:
    if db_operator is None:
        return None
    try:
        record = db_operator.fetch_source_page(
            page_code=page_code,
            top_agency=top_agency,
            sub_agency=sub_agency,
            source_url=source_url,
        )
    except Exception:
        return None
    if not record:
        return None
    return _spec_from_record(record)
