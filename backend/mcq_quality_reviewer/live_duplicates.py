from __future__ import annotations

from typing import Any

from config import settings  # noqa: F401  Ensures mcq_gen is importable.
from mcq_gen.db.client import fetch_all, get_supabase


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


def fetch_live_duplicate_stems(
    passage_ids: list[str],
    skill_label: str,
    *,
    exclude_question_id: str | None = None,
) -> list[str]:
    """Fetch all live active candidate stems for the Critic's concept check.

    This mirrors the generator's passage + skill narrowing, but excludes the
    question currently under audit so correction mode can still check every
    other matching question for duplicated concepts.
    """
    if not passage_ids or not skill_label:
        return []
    tag_id = _SKILL_TO_TAG.get(skill_label)
    if not tag_id:
        return []

    sb = get_supabase()
    tag_rows = fetch_all(
        sb.table("dsemcq_question_tags")
        .select("question_id")
        .eq("tag_id", tag_id)
    )
    tagged_ids = {row["question_id"] for row in tag_rows}
    if exclude_question_id:
        tagged_ids.discard(exclude_question_id)
    if not tagged_ids:
        return []

    question_query = (
        sb.table("dsemcq_questions")
        .select("id,stem")
        .in_("passage_id", passage_ids)
        .eq("is_active", True)
        .order("id")
    )
    rows = fetch_all(question_query)
    stems = [
        row["stem"]
        for row in rows
        if row["id"] in tagged_ids and row.get("stem")
    ]
    return stems