#coding: utf-8
"""
Facade class that combines all Mixins into the original BidJudgementSan interface.

BidJudgementSan was originally a single 3,855-line God Object. It has been split
into focused Mixin classes:

- DocumentPreparationMixin: step0 document preparation pipeline
- OcrProcessingMixin: PDF download, Markdown/OCR generation, Gemini API calls
- GeminiPromptsMixin: Gemini prompt constants
- JudgementMixin: step3 requirement judgment + classification

The Master class and global helper functions are in master.py.
"""

from pathlib import Path

from packages.engine.domain.master import Master
from packages.engine.domain.document_pipeline import DocumentPreparationMixin
from packages.engine.domain.ocr_processing import OcrProcessingMixin
from packages.engine.domain.gemini_prompts import GeminiPromptsMixin
from packages.engine.domain.judgement import JudgementMixin


class BidJudgementSan(
    DocumentPreparationMixin,
    OcrProcessingMixin,
    GeminiPromptsMixin,
    JudgementMixin,
):
    """
    以下のステップを踏み、公告判定処理を行う。

    - step0 : 判定前公告表アップロード（公告マスター／要件マスターの作成・更新まで実施）

    - step3 : 要件判定処理

      企業 x 拠点 x 要件の全組み合わせに対して要件判定し結果を企業公告判定マスターに格納する。

      また、充足要件マスターと不足要件マスターを作成する。

    Attributes:

    - tablenamesconfig:

      TablenamesConfig オブジェクト。

    - db_operator:

      データベースを操作するためのオブジェクト。

    """

    def __init__(
        self,
        tablenamesconfig=None,
        db_operator=None,
        gemini_model="gemini-2.5-flash",
        google_api_key_path=None,
        gemini_use_vertex_ai=False,
        vertex_ai_project_id=None,
        vertex_ai_location="asia-northeast1",
        gemini_max_output_tokens=None,
        ocr_json_debug_output_path=None,
    ):
        self.tablenamesconfig = tablenamesconfig
        self.db_operator=db_operator
        self.gemini_model = gemini_model
        self.google_api_key_path = google_api_key_path
        self.gemini_use_vertex_ai = gemini_use_vertex_ai
        self.vertex_ai_project_id = vertex_ai_project_id
        self.vertex_ai_location = vertex_ai_location or "asia-northeast1"
        self.gemini_max_output_tokens = gemini_max_output_tokens
        self.ocr_json_debug_output_path = ocr_json_debug_output_path
