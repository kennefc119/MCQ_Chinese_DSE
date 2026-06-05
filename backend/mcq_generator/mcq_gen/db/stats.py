"""查詢現有題庫的維度分佈，供策略師決策使用。"""
from __future__ import annotations

import structlog

from ..schemas import DBStats, Difficulty, Skill
from .client import fetch_all, get_supabase

log = structlog.get_logger(__name__)

# 難度文字 ↔ skill_tested 欄位不在 DB，改用 tag slug
# 策略師需要的是 by_skill（按 tag_id 計）和 by_difficulty（按 difficulty 數值計）

_DIFFICULTY_MAP = {
    1: Difficulty.VERY_EASY,
    2: Difficulty.EASY,
    3: Difficulty.MEDIUM,
    4: Difficulty.HARD,
    5: Difficulty.VERY_HARD,
}

# tag_id → Skill 對應
_TAG_TO_SKILL: dict[str, Skill] = {
    "t-meaning": Skill.WORD_MEANING,
    "t-comprehension": Skill.COMPREHENSION,
    "t-theme": Skill.THEME,
    "t-rhetoric": Skill.RHETORIC,
    "t-character": Skill.CHARACTER,
    "t-grammar": Skill.GRAMMAR,
    "t-context": Skill.BACKGROUND,
    "t-comparison": Skill.CROSS_PASSAGE,
}


def fetch_db_stats() -> DBStats:
    """從 Supabase 讀取現存題目（包括 seed + agent 生成），計算分佈統計。"""
    sb = get_supabase()

    # 抓所有題目（含 is_active 欄位）— 使用分頁避免 1000 筆上限
    questions = fetch_all(
        sb.table("dsemcq_questions")
        .select("id, passage_id, difficulty, source, is_active")
    )

    # 抓所有 question-tag 關係 — 使用分頁避免 1000 筆上限
    tag_rows = fetch_all(
        sb.table("dsemcq_question_tags")
        .select("question_id, tag_id")
    )

    # question_id → [tag_id]
    q_tags: dict[str, list[str]] = {}
    for row in tag_rows:
        q_tags.setdefault(row["question_id"], []).append(row["tag_id"])

    total = len(questions)
    total_active = 0
    total_inactive = 0
    # 難度分佈及能力分佈只計算有效題目（is_active=True）
    by_passage: dict[str, int] = {}
    by_difficulty: dict[str, int] = {
        Difficulty.VERY_EASY.value: 0,
        Difficulty.EASY.value: 0,
        Difficulty.MEDIUM.value: 0,
        Difficulty.HARD.value: 0,
        Difficulty.VERY_HARD.value: 0,
    }
    by_skill: dict[str, int] = {s.value: 0 for s in Skill}
    cross_passage_count = 0
    needs_review_count = 0

    for q in questions:
        active = q.get("is_active", True)  # 預設視為有效
        if active:
            total_active += 1
        else:
            total_inactive += 1

        source = q.get("source") or ""
        if "needs-review" in source:
            needs_review_count += 1

        # 以下統計只計 active 題目
        if not active:
            continue

        pid = q.get("passage_id") or "unknown"
        by_passage[pid] = by_passage.get(pid, 0) + 1

        diff_num = q.get("difficulty") or 2
        diff_label = _DIFFICULTY_MAP.get(diff_num, Difficulty.MEDIUM).value
        by_difficulty[diff_label] = by_difficulty.get(diff_label, 0) + 1

        for tag_id in q_tags.get(q["id"], []):
            skill = _TAG_TO_SKILL.get(tag_id)
            if skill:
                by_skill[skill.value] = by_skill.get(skill.value, 0) + 1
            if tag_id == "t-comparison":
                cross_passage_count += 1

    stats = DBStats(
        total=total,
        total_active=total_active,
        total_inactive=total_inactive,
        by_passage=by_passage,
        by_difficulty=by_difficulty,
        by_skill=by_skill,
        cross_passage_count=cross_passage_count,
        needs_review_count=needs_review_count,
    )
    log.info("db_stats_fetched", total=total, by_passage=by_passage)
    return stats
