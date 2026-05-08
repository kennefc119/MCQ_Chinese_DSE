"""Append-only 寫入器 — 將生成的題目寫入 Supabase。

安全守則：
- 此模組只包含 INSERT；沒有 UPDATE 或 DELETE 程式碼。
- 所有插入均使用 upsert(on_conflict='id', ignore_duplicates=True) 確保安全。
"""
from __future__ import annotations

import structlog

from ..config import settings
from ..schemas import Difficulty, SavedQuestion
from .client import get_supabase

log = structlog.get_logger(__name__)

# 難度文字 → 數值
_DIFF_TO_INT = {
    Difficulty.EASY: 2,
    Difficulty.MEDIUM: 3,
    Difficulty.HARD: 4,
}

# Skill → tag_id
_SKILL_TO_TAG: dict[str, str] = {
    "字詞解釋": "t-meaning",
    "內容理解": "t-comprehension",
    "主旨歸納": "t-theme",
    "修辭手法": "t-rhetoric",
    "人物分析": "t-character",
    "句式語法": "t-grammar",
    "背景知識": "t-context",
    "跨篇章比較": "t-comparison",
}


def write_question(q: SavedQuestion) -> bool:
    """
    將一條題目（及其選項、tag）寫入 Supabase。
    回傳 True 表示成功，False 表示跳過（衝突）。
    """
    sb = get_supabase()

    # ── 1. dsemcq_questions ────────────────────────────────────────────────
    q_row = {
        "id": q.question_id,
        "passage_id": q.passage_id,
        "stem": q.stem,
        "explanation": q.explanation,
        "difficulty": _DIFF_TO_INT[q.difficulty_label],
        "source": q.source,
        "is_active": q.is_active,
        "critique_score": q.critique_score,  # 1-10 quality score from critic agent
    }
    result = (
        sb.table("dsemcq_questions")
        .upsert(q_row, on_conflict="id", ignore_duplicates=True)
        .execute()
    )
    if not result.data:
        log.warning("question_skipped_duplicate", question_id=q.question_id)
        return False

    # ── 2. dsemcq_question_options ─────────────────────────────────────────
    opts = q.options.model_dump()  # {"A": ..., "B": ..., "C": ..., "D": ...}
    option_rows = [
        {
            "id": f"{q.question_id}-{label.lower()}",
            "question_id": q.question_id,
            "label": label,
            "text": text,
            "is_correct": (label == q.correct_answer),
        }
        for label, text in opts.items()
    ]
    sb.table("dsemcq_question_options").upsert(
        option_rows, on_conflict="id", ignore_duplicates=True
    ).execute()

    # ── 3. dsemcq_question_tags ────────────────────────────────────────────
    tag_id = _SKILL_TO_TAG.get(q.skill.value)
    if tag_id:
        tag_row = {"question_id": q.question_id, "tag_id": tag_id}
        sb.table("dsemcq_question_tags").upsert(
            tag_row,
            on_conflict="question_id,tag_id",
            ignore_duplicates=True,
        ).execute()

    # 跨篇章額外加 t-comparison tag
    if q.spec.cross_passage:
        cross_tag = {"question_id": q.question_id, "tag_id": "t-comparison"}
        sb.table("dsemcq_question_tags").upsert(
            cross_tag,
            on_conflict="question_id,tag_id",
            ignore_duplicates=True,
        ).execute()

    log.info(
        "question_written",
        question_id=q.question_id,
        passage=q.passage_id,
        is_active=q.is_active,
        score=q.critique_score,
    )
    return True
