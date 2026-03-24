#coding: utf-8

"""
Entry point for bid_announcement_judgement_tools.

従来 main.py に集約されていた機能を CLI / Application / Domain / Repository 層に分割した。
このファイルは CLI 層を起動しつつ、互換性維持のため主要クラスを再エクスポートする。
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from packages.engine.application.services import BidAnnouncementsApplication
from packages.engine.cli.entry import main as cli_main
from packages.engine.domain.bid_judgement import (
    BidJudgementSan,
    Master,
)
from packages.engine.repository.db_operator import (
    TablenamesConfig,
    DBOperator,
    DBOperatorGCPVM,
    DBOperatorSQLITE3,
    DBOperatorPOSTGRES,
)

__all__ = [
    "cli_main",
    "BidAnnouncementsApplication",
    "BidJudgementSan",
    "Master",
    "TablenamesConfig",
    "DBOperator",
    "DBOperatorGCPVM",
    "DBOperatorSQLITE3",
    "DBOperatorPOSTGRES",
]


def main():
    """
    CLI を起動する。
    """
    cli_main()


if __name__ == "__main__":
    main()
