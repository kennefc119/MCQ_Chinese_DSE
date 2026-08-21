from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from config import settings  # noqa: F401  Ensures mcq_gen is importable.
from mcq_gen.db.client import fetch_all, get_supabase


QUESTION_FIELDS = (
    "id,passage_id,cross_passage_id,stem,difficulty,source,is_active,"
    "critique_score,admin_flag,user_flag_count,user_flag_comments"
)


def count_questions() -> int:
    response = (
        get_supabase()
        .table("dsemcq_questions")
        .select("id", count="exact")
        .limit(1)
        .execute()
    )
    return int(response.count or 0)


def fetch_next_unscanned(excluded_ids: set[str]) -> dict[str, Any] | None:
    rows = fetch_all(
        get_supabase().table("dsemcq_questions").select(QUESTION_FIELDS).order("id")
    )
    for row in rows:
        if row["id"] not in excluded_ids:
            return _hydrate_question(row)
    return None


def fetch_all_questions() -> list[dict[str, Any]]:
    """Load the complete question inventory with options and tags in batches."""
    sb = get_supabase()
    rows = fetch_all(sb.table("dsemcq_questions").select(QUESTION_FIELDS).order("id"))
    question_ids = [row["id"] for row in rows]
    options_by_question: dict[str, list[dict[str, Any]]] = {}
    tags_by_question: dict[str, list[str]] = {}

    for start in range(0, len(question_ids), 500):
        chunk = question_ids[start:start + 500]
        option_rows = fetch_all(
            sb.table("dsemcq_question_options")
            .select("id,question_id,text,is_correct,explanation")
            .in_("question_id", chunk)
            .order("id")
        )
        for option in option_rows:
            options_by_question.setdefault(option["question_id"], []).append(option)

        tag_rows = fetch_all(
            sb.table("dsemcq_question_tags")
            .select("question_id,tag_id")
            .in_("question_id", chunk)
        )
        for tag in tag_rows:
            tags_by_question.setdefault(tag["question_id"], []).append(tag["tag_id"])

    return [
        _question_from_related_rows(
            row,
            options_by_question.get(row["id"], []),
            tags_by_question.get(row["id"], []),
        )
        for row in rows
    ]


def fetch_question_headers() -> list[dict[str, Any]]:
    """Load question metadata without options/tags for local status filtering."""
    rows = fetch_all(
        get_supabase().table("dsemcq_questions").select(QUESTION_FIELDS).order("id")
    )
    return [
        _question_from_related_rows(row, [], [])
        for row in rows
    ]


def iter_question_headers(page_size: int = 500):
    """Yield lightweight question headers page by page for batch claiming."""
    sb = get_supabase()
    offset = 0
    while True:
        response = _execute_with_retry(
            lambda: (
                sb.table("dsemcq_questions")
                .select(QUESTION_FIELDS)
                .order("id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
        )
        rows = response.data or []
        for row in rows:
            yield _question_from_related_rows(row, [], [])
        if len(rows) < page_size:
            return
        offset += page_size


def fetch_question_page(offset: int, limit: int) -> list[dict[str, Any]]:
    """Load one ordered question page and hydrate only its related rows."""
    sb = get_supabase()
    response = (
        sb.table("dsemcq_questions")
        .select(QUESTION_FIELDS)
        .order("id")
        .range(offset, offset + limit - 1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return []

    return _hydrate_question_rows(rows)


def fetch_questions_by_ids(question_ids: list[str]) -> list[dict[str, Any]]:
    """Load and hydrate an explicit question subset while preserving input order."""
    if not question_ids:
        return []
    rows = fetch_all(
        get_supabase()
        .table("dsemcq_questions")
        .select(QUESTION_FIELDS)
        .in_("id", question_ids)
    )
    hydrated = _hydrate_question_rows(rows)
    by_id = {question["question_id"]: question for question in hydrated}
    return [by_id[question_id] for question_id in question_ids if question_id in by_id]


def _hydrate_question_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    sb = get_supabase()
    question_ids = [row["id"] for row in rows]
    option_rows = fetch_all(
        sb.table("dsemcq_question_options")
        .select("id,question_id,text,is_correct,explanation")
        .in_("question_id", question_ids)
        .order("id")
    )
    tag_rows = fetch_all(
        sb.table("dsemcq_question_tags")
        .select("question_id,tag_id")
        .in_("question_id", question_ids)
    )
    options_by_question: dict[str, list[dict[str, Any]]] = {}
    tags_by_question: dict[str, list[str]] = {}
    for option in option_rows:
        options_by_question.setdefault(option["question_id"], []).append(option)
    for tag in tag_rows:
        tags_by_question.setdefault(tag["question_id"], []).append(tag["tag_id"])

    return [
        _question_from_related_rows(
            row,
            options_by_question.get(row["id"], []),
            tags_by_question.get(row["id"], []),
        )
        for row in rows
    ]


def fetch_question(question_id: str) -> dict[str, Any] | None:
    sb = get_supabase()

    def load_question() -> dict[str, Any] | None:
        response = (
            sb.table("dsemcq_questions")
            .select(QUESTION_FIELDS)
            .eq("id", question_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return _hydrate_question(response.data[0])

    return _execute_with_retry(load_question)


def _execute_with_retry(operation, attempts: int = 4):
    """Retry transient local reviewer Supabase reads with a fresh operation."""
    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except Exception:
            if attempt >= attempts:
                raise
            time.sleep(0.5 * attempt)


def question_hash(question: dict[str, Any]) -> str:
    content = {
        "question_id": question["question_id"],
        "passage_id": question["passage_id"],
        "cross_passage_id": question.get("cross_passage_id"),
        "stem": question["stem"],
        "difficulty": question["difficulty"],
        "options": [
            {
                "text": option.get("text", ""),
                "is_correct": bool(option.get("is_correct")),
                "explanation": option.get("explanation", ""),
            }
            for option in question["options"]
        ],
        "tags": sorted(question["tags"]),
    }
    encoded = json.dumps(content, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def apply_proposal(
    question_id: str,
    original_hash: str,
    proposal: dict[str, Any],
    score: int,
) -> None:
    current = fetch_question(question_id)
    if current is None:
        raise ValueError("Question no longer exists in Supabase")
    if question_hash(current) != original_hash:
        raise ValueError("Question changed after audit; approval is stale")

    options = proposal.get("options") or []
    if len(options) != 4 or sum(bool(option.get("is_correct")) for option in options) != 1:
        raise ValueError("Proposed question must contain four options and one correct answer")

    sb = get_supabase()
    try:
        question_result = (
            sb.table("dsemcq_questions")
            .update({"stem": proposal["question_stem"], "critique_score": score})
            .eq("id", question_id)
            .execute()
        )
        if not question_result.data:
            raise RuntimeError("Question update returned no row")

        sb.table("dsemcq_question_options").delete().eq(
            "question_id", question_id
        ).execute()
        sb.table("dsemcq_question_options").insert(
            [
                {
                    "id": f"{question_id}-opt{index}",
                    "question_id": question_id,
                    "text": option["text"],
                    "is_correct": bool(option["is_correct"]),
                    "explanation": option.get("explanation", ""),
                }
                for index, option in enumerate(options)
            ]
        ).execute()
    except Exception as exc:
        _restore_original(current)
        raise RuntimeError(f"Supabase update failed; original restored: {exc}") from exc


def _hydrate_question(row: dict[str, Any]) -> dict[str, Any]:
    question_id = row["id"]
    sb = get_supabase()
    option_rows = fetch_all(
        sb.table("dsemcq_question_options")
        .select("id,question_id,text,is_correct,explanation")
        .eq("question_id", question_id)
        .order("id")
    )
    tag_rows = fetch_all(
        sb.table("dsemcq_question_tags")
        .select("tag_id")
        .eq("question_id", question_id)
    )
    return _question_from_related_rows(row, option_rows, [tag["tag_id"] for tag in tag_rows])


def _question_from_related_rows(
    row: dict[str, Any],
    option_rows: list[dict[str, Any]],
    tag_ids: list[str],
) -> dict[str, Any]:
    return {
        "question_id": row["id"],
        "passage_id": row.get("passage_id") or "",
        "cross_passage_id": row.get("cross_passage_id"),
        "stem": row.get("stem") or "",
        "difficulty": int(row.get("difficulty") or 3),
        "source": row.get("source") or "",
        "is_active": bool(row.get("is_active", True)),
        "critique_score": row.get("critique_score"),
        "admin_flag": bool(row.get("admin_flag", False)),
        "user_flag_count": int(row.get("user_flag_count") or 0),
        "user_flag_comments": row.get("user_flag_comments") or "",
        "options": option_rows,
        "tags": tag_ids,
    }


def _restore_original(original: dict[str, Any]) -> None:
    sb = get_supabase()
    question_id = original["question_id"]
    sb.table("dsemcq_questions").update(
        {
            "stem": original["stem"],
            "critique_score": original.get("critique_score"),
        }
    ).eq("id", question_id).execute()
    sb.table("dsemcq_question_options").delete().eq(
        "question_id", question_id
    ).execute()
    if original["options"]:
        sb.table("dsemcq_question_options").insert(
            [
                {
                    "id": option["id"],
                    "question_id": question_id,
                    "text": option.get("text", ""),
                    "is_correct": bool(option.get("is_correct")),
                    "explanation": option.get("explanation", ""),
                }
                for option in original["options"]
            ]
        ).execute()