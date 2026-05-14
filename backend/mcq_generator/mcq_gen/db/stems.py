"""Query existing question stems for duplicate-detection injection into the critic prompt."""
from __future__ import annotations

from .client import get_supabase

# Mirrors the mapping in writer.py — kept local to avoid circular imports.
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


def fetch_existing_stems(
    passage_ids: list[str],
    skill_label: str,
    limit: int = 30,
) -> list[str]:
    """Return up to *limit* stems of **active** questions that match any of the
    given passage IDs **and** the given skill label.

    Used to populate the critic prompt's duplicate-detection block so the LLM
    can penalise semantically repeated questions.

    Args:
        passage_ids:  One or two passage IDs (two when skill is 跨篇章比較).
        skill_label:  The Chinese skill label value (e.g. "內容理解").
        limit:        Maximum number of stems to return.

    Returns:
        A list of question stem strings (may be empty).
    """
    if not passage_ids or not skill_label:
        return []

    tag_id = _SKILL_TO_TAG.get(skill_label)
    if not tag_id:
        return []

    sb = get_supabase()

    # 1. All question IDs that carry this skill tag
    tag_rows = (
        sb.table("dsemcq_question_tags")
        .select("question_id")
        .eq("tag_id", tag_id)
        .execute()
        .data
        or []
    )
    tagged_ids: set[str] = {r["question_id"] for r in tag_rows}
    if not tagged_ids:
        return []

    # 2. Active questions belonging to the target passages
    q_rows = (
        sb.table("dsemcq_questions")
        .select("id,stem")
        .in_("passage_id", passage_ids)
        .eq("is_active", True)
        .execute()
        .data
        or []
    )

    # 3. Intersect: passage-filtered questions that also carry the right skill tag
    stems: list[str] = [
        r["stem"]
        for r in q_rows
        if r["id"] in tagged_ids and r.get("stem")
    ]

    return stems[:limit]
