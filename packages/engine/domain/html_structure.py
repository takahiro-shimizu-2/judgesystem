from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from bs4 import BeautifulSoup, Tag


HEADING_SELECTORS = ("h1", "h2", "h3", "h4", "h5", "h6")


@dataclass
class TableNode:
    element: Tag
    depth: int
    parent_index: Optional[int]
    heading_text: Optional[str]
    path: str


def _nearest_heading_text(table: Tag) -> Optional[str]:
    heading = table.find_previous(HEADING_SELECTORS)
    if heading is None:
        return None
    text = heading.get_text(" ", strip=True)
    return text or None


def _walk_dom(
    tag: Tag,
    *,
    parent_table_index: Optional[int],
    depth: int,
    path: str,
    table_nodes: List[TableNode],
):
    child_counter = 0
    for child in tag.children:
        if not isinstance(child, Tag):
            continue
        child_counter += 1
        child_path = f"{path}/{child_counter}"
        if child.name == "table":
            node_index = len(table_nodes)
            table_nodes.append(
                TableNode(
                    element=child,
                    depth=depth,
                    parent_index=parent_table_index,
                    heading_text=_nearest_heading_text(child),
                    path=child_path,
                )
            )
            _walk_dom(
                child,
                parent_table_index=node_index,
                depth=depth + 1,
                path=child_path,
                table_nodes=table_nodes,
            )
        else:
            _walk_dom(
                child,
                parent_table_index=parent_table_index,
                depth=depth,
                path=child_path,
                table_nodes=table_nodes,
            )


def collect_table_nodes(soup: BeautifulSoup) -> List[TableNode]:
    """
    HTML全体からtable要素を深さ順に収集する。
    レイアウト用table内にネストされたデータtableも含めて取得する。
    """
    root = soup.body or soup
    table_nodes: List[TableNode] = []
    if root:
        _walk_dom(root, parent_table_index=None, depth=0, path="root", table_nodes=table_nodes)
    return table_nodes
