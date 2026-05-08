"""Pydantic 資料模型 — 貫穿三個 agent 的標準資料格式。"""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


# ─── 共用列舉 ───────────────────────────────────────────────────────────────


class Difficulty(str, Enum):
    EASY = "淺"
    MEDIUM = "中"
    HARD = "深"


class Skill(str, Enum):
    WORD_MEANING = "字詞解釋"
    COMPREHENSION = "內容理解"
    THEME = "主旨歸納"
    RHETORIC = "修辭手法"
    CHARACTER = "人物分析"
    GRAMMAR = "句式語法"
    BACKGROUND = "背景知識"
    CROSS_PASSAGE = "跨篇章比較"


class Verdict(str, Enum):
    PASS = "PASS"
    REVISE = "REVISE"


# ─── Agent 1 輸出 ────────────────────────────────────────────────────────────


class Spec(BaseModel):
    """題型策略師輸出的題目需求規格。"""

    passage: str = Field(..., description="主篇章 ID，例如 p09", pattern=r"^p\d{2}$")
    cross_passage: str | None = Field(None, description="跨篇章時的第二篇 ID；否則 null")
    difficulty: Difficulty
    skill_tested: Skill
    special_notes: str = Field("", description="給出題員的補充提示（可為空）")
    reasoning: str = Field("", description="策略師解釋為何選此維度（引用分佈數字）")


# ─── Agent 2 輸出 ────────────────────────────────────────────────────────────


class DraftOption(BaseModel):
    """一個 MC 選項（無 A/B/C/D 標籤，由應用程式在執行時分配）。"""

    text: str
    is_correct: bool  # 四個選項中恰好一個為 True
    explanation: str  # 此選項為何正確／錯誤（1-3 句，直接引用選項文字及篇章原文）


class Draft(BaseModel):
    """出題員輸出的完整 MC 草稿。"""

    question_stem: str
    options: list[DraftOption]  # 恰好 4 個；恰好一個 is_correct=True
    mapped_spec: Spec


# ─── Agent 3 輸出 ────────────────────────────────────────────────────────────


class Critique(BaseModel):
    """審題主任輸出的審核結果。"""

    verdict: Verdict
    score: int = Field(..., ge=1, le=10)
    comments: str
    revision_instructions: str = Field(
        "", description="REVISE 時必須提供可執行指示；PASS 時可為空"
    )


# ─── DB Stats（Agent 1 讀取用）───────────────────────────────────────────────


class DBStats(BaseModel):
    """現存題庫的維度分佈統計。"""

    total: int
    by_passage: dict[str, int] = Field(default_factory=dict)
    by_difficulty: dict[str, int] = Field(default_factory=dict)
    by_skill: dict[str, int] = Field(default_factory=dict)
    cross_passage_count: int = 0
    needs_review_count: int = 0


# ─── 最終儲存記錄 ────────────────────────────────────────────────────────────


class SavedQuestion(BaseModel):
    """寫入 Supabase 前的完整記錄。"""

    question_id: str
    passage_id: str
    stem: str
    difficulty: int  # 1–5 整數
    difficulty_label: Difficulty
    skill: Skill
    options: list[DraftOption]  # 恰好 4 個；恰好一個 is_correct=True，每個帶 explanation
    source: str
    is_active: bool
    spec: Spec
    critique_score: int
