from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from bs4 import BeautifulSoup, Tag

from packages.engine.domain.html_structure import TableNode, collect_table_nodes
from packages.engine.sources import SourceSpec


@dataclass
class TableSpec:
    table: Tag
    heading_text: Optional[str]
    depth: int
    pattern: str  # "matrix" or "row"
    parent_index: Optional[int] = None


def infer_table_specs(
    soup: BeautifulSoup,
    *,
    helper,
    source_spec: Optional[SourceSpec] = None,
) -> List[TableSpec]:
    """
    BeautifulSoupからtable構造を解析し、行形式かマトリックス形式かを判定したspecを返す。
    """
    table_nodes: List[TableNode] = collect_table_nodes(soup)
    specs: List[TableSpec] = []
    for index, node in enumerate(table_nodes):
        pattern = "matrix" if helper._is_matrix_table(node.element, source_spec=source_spec) else "row"
        specs.append(
            TableSpec(
                table=node.element,
                heading_text=node.heading_text,
                depth=node.depth,
                pattern=pattern,
                parent_index=node.parent_index,
            )
        )
    return specs


def extract_announcements_from_specs(
    specs: List[TableSpec],
    *,
    helper,
    source_spec: Optional[SourceSpec] = None,
):
    """
    推論済みのTableSpecごとに公告を抽出し、リストとして返す。
    """
    announcements = []
    for spec in specs:
        if spec.pattern == "matrix":
            table_announcements = helper._extract_matrix_announcements(spec.table, source_spec=source_spec)
        else:
            table_announcements = helper._extract_row_announcements(spec.table, source_spec=source_spec)
        announcements.extend(table_announcements)
    return announcements
