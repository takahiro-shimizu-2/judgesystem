#coding: utf-8
"""
定数定義モジュール。

和暦 (Japanese era) から西暦への変換オフセットなど、
複数モジュールで共有されるマジックナンバーを集約する。

TypeScript 側の共有型定義 (packages/shared/src/types/index.ts) と
対応する定数もここで管理する。自動同期の仕組みはないため、
TypeScript 側を変更した場合はこのファイルも手動で更新すること。
"""

# ---------------------------------------------------------------------------
# 和暦 → 西暦 変換オフセット
# ---------------------------------------------------------------------------
# 使い方: western_year = era_year + ERA_OFFSETS["reiwa"]
ERA_OFFSETS: dict[str, int] = {
    "reiwa": 2018,    # 令和: 令和1年 = 2019年 → 1 + 2018
    "heisei": 1988,   # 平成: 平成1年 = 1989年 → 1 + 1988
    "showa": 1925,    # 昭和: 昭和1年 = 1926年 → 1 + 1925
}

# ---------------------------------------------------------------------------
# EvaluationStatus — 適格審査結果ステータス
# 対応 TS: packages/shared/src/types/index.ts  EvaluationStatus
# ---------------------------------------------------------------------------
EVALUATION_STATUS_ALL_MET: str = "all_met"
EVALUATION_STATUS_OTHER_ONLY_UNMET: str = "other_only_unmet"
EVALUATION_STATUS_UNMET: str = "unmet"

EVALUATION_STATUSES: tuple[str, ...] = (
    EVALUATION_STATUS_ALL_MET,
    EVALUATION_STATUS_OTHER_ONLY_UNMET,
    EVALUATION_STATUS_UNMET,
)

# ---------------------------------------------------------------------------
# WorkStatus — 作業進捗ステータス
# 対応 TS: packages/shared/src/types/index.ts  WorkStatus
# ---------------------------------------------------------------------------
WORK_STATUS_NOT_STARTED: str = "not_started"
WORK_STATUS_IN_PROGRESS: str = "in_progress"
WORK_STATUS_COMPLETED: str = "completed"

WORK_STATUSES: tuple[str, ...] = (
    WORK_STATUS_NOT_STARTED,
    WORK_STATUS_IN_PROGRESS,
    WORK_STATUS_COMPLETED,
)

# ---------------------------------------------------------------------------
# BidType — 入札方式
# 対応 TS: packages/shared/src/types/index.ts  BidType
# ---------------------------------------------------------------------------
BID_TYPE_OPEN_COMPETITIVE: str = "open_competitive"
BID_TYPE_PLANNING_COMPETITION: str = "planning_competition"
BID_TYPE_DESIGNATED_COMPETITIVE: str = "designated_competitive"
BID_TYPE_DOCUMENT_REQUEST: str = "document_request"
BID_TYPE_OPINION_REQUEST: str = "opinion_request"
BID_TYPE_NEGOTIATED_CONTRACT: str = "negotiated_contract"
BID_TYPE_OPEN_COUNTER: str = "open_counter"
BID_TYPE_UNKNOWN: str = "unknown"
BID_TYPE_PREFERRED_DESIGNATION: str = "preferred_designation"
BID_TYPE_OTHER: str = "other"

BID_TYPES: tuple[str, ...] = (
    BID_TYPE_OPEN_COMPETITIVE,
    BID_TYPE_PLANNING_COMPETITION,
    BID_TYPE_DESIGNATED_COMPETITIVE,
    BID_TYPE_DOCUMENT_REQUEST,
    BID_TYPE_OPINION_REQUEST,
    BID_TYPE_NEGOTIATED_CONTRACT,
    BID_TYPE_OPEN_COUNTER,
    BID_TYPE_UNKNOWN,
    BID_TYPE_PREFERRED_DESIGNATION,
    BID_TYPE_OTHER,
)
