"""查詢被用戶標記的題目 — 供修正流程使用。"""
from __future__ import annotations

from dataclasses import dataclass

import structlog

from .client import fetch_all, get_supabase

log = structlog.get_logger(__name__)


@dataclass
class FlaggedQuestion:
    """A question that has been flagged by users, with full context."""

    question_id: str
    passage_id: str
    cross_passage_id: str | None
    stem: str
    difficulty: int
    source: str
    is_active: bool
    critique_score: int | None
    user_flag_count: int
    user_flag_comments: str
    options: list[dict]       # [{id, text, is_correct, explanation}, ...]
    tags: list[str]           # [tag_id, ...]


def fetch_flagged_questions(
    *,
    question_id: str | None = None,
) -> list[FlaggedQuestion]:
    """
    Fetch questions with user_flag_count > 0.

    If question_id is provided, fetch only that single question
    (still must have flags to be returned).
    """
    sb = get_supabase()

    # 1. Flagged questions
    q_query = (
        sb.table("dsemcq_questions")
        .select("id,passage_id,cross_passage_id,stem,difficulty,source,is_active,critique_score,"
                "user_flag_count,user_flag_comments")
    )
    if question_id:
        q_query = q_query.eq("id", question_id)

    q_query = q_query.gt("user_flag_count", 0)
    q_rows = fetch_all(q_query)

    if not q_rows:
        return []

    q_ids = [r["id"] for r in q_rows]

    # 2. Options for those questions
    opt_rows = fetch_all(
        sb.table("dsemcq_question_options")
        .select("id,question_id,text,is_correct,explanation")
        .in_("question_id", q_ids)
    )
    opts_by_q: dict[str, list[dict]] = {}
    for o in opt_rows:
        opts_by_q.setdefault(o["question_id"], []).append(o)

    # 3. Tags for those questions
    tag_rows = fetch_all(
        sb.table("dsemcq_question_tags")
        .select("question_id,tag_id")
        .in_("question_id", q_ids)
    )
    tags_by_q: dict[str, list[str]] = {}
    for t in tag_rows:
        tags_by_q.setdefault(t["question_id"], []).append(t["tag_id"])

    # Build results
    results = []
    for q in q_rows:
        results.append(FlaggedQuestion(
            question_id=q["id"],
            passage_id=q.get("passage_id", ""),
            cross_passage_id=q.get("cross_passage_id"),
            stem=q.get("stem", ""),
            difficulty=q.get("difficulty", 3),
            source=q.get("source", ""),
            is_active=q.get("is_active", True),
            critique_score=q.get("critique_score"),
            user_flag_count=q.get("user_flag_count", 0),
            user_flag_comments=q.get("user_flag_comments", ""),
            options=opts_by_q.get(q["id"], []),
            tags=tags_by_q.get(q["id"], []),
        ))

    log.info("flagged_questions_fetched", count=len(results))
    return results
