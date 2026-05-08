"""
quiz_builder.py — 將近期 agent 生成的題目自動組合成 quiz/exam，
寫入 dsemcq_quizzes（使用 question_ids text[] 欄位）。

組卷邏輯：
  exercise : 同篇章  4–6  題，difficulty 1–2
  quiz     : 同篇章  8–10 題，difficulty 3
  exam     : 跨篇章 16–20 題，difficulty 4–5
"""
from __future__ import annotations

import uuid

import structlog

from .db.client import get_supabase

log = structlog.get_logger(__name__)

# 題數門檻
_THRESHOLDS = {
    "exercise": (4, 6, [1, 2]),
    "quiz":     (8, 10, [3]),
    "exam":     (16, 20, [4, 5]),
}

_TYPE_LABEL = {"exercise": "練習", "quiz": "測驗", "exam": "模擬試卷"}
_TYPE_DIFF  = {"exercise": 2, "quiz": 3, "exam": 4}


def _short_uuid() -> str:
    return uuid.uuid4().hex[:6]


def build_quizzes_from_recent(from_recent: int = 30) -> int:
    """
    從最近 from_recent 條 agent 生成的 is_active=true 題目中自動組卷。
    回傳新建 quiz 數量。
    """
    sb = get_supabase()

    # 讀取最近 N 條 agent 題目（按 created_at 降冪，無 created_at 則按 id）
    resp = (
        sb.table("dsemcq_questions")
        .select("id, passage_id, difficulty, source")
        .like("source", "agent-%")
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(from_recent)
        .execute()
    )
    questions = resp.data or []

    if not questions:
        log.warning("build_quizzes_no_questions")
        return 0

    # 按篇章分組
    by_passage: dict[str, list[dict]] = {}
    for q in questions:
        pid = q["passage_id"]
        by_passage.setdefault(pid, []).append(q)

    created = 0

    # ── per-passage quizzes ──────────────────────────────────────────────────
    for pid, qs in by_passage.items():
        for quiz_type in ("exercise", "quiz"):
            min_q, max_q, diff_levels = _THRESHOLDS[quiz_type]
            matching = [q for q in qs if q.get("difficulty") in diff_levels]
            if len(matching) < min_q:
                continue
            selected = matching[:max_q]
            _create_quiz(sb, pid, quiz_type, selected)
            created += 1

    # ── cross-passage exam ───────────────────────────────────────────────────
    hard_all = [q for q in questions if (q.get("difficulty") or 0) >= 4]
    if len(hard_all) >= 16:
        _create_quiz(sb, None, "exam", hard_all[:20])
        created += 1

    log.info("build_quizzes_done", created=created)
    return created


def _create_quiz(sb, passage_id: str | None, quiz_type: str, questions: list[dict]) -> None:
    """建立一條 dsemcq_quizzes 記錄，question_ids 用 text[] 欄位存題目 ID。"""
    quiz_id = f"quiz-ai-{_short_uuid()}"

    if passage_id:
        p_resp = (
            sb.table("dsemcq_passages")
            .select("title")
            .eq("id", passage_id)
            .single()
            .execute()
        )
        p_title = (p_resp.data or {}).get("title", passage_id)
        title = f"{p_title}（{_TYPE_LABEL[quiz_type]}）"
    else:
        title = f"跨篇章{_TYPE_LABEL[quiz_type]}"

    quiz_row = {
        "id":           quiz_id,
        "title":        title,
        "description":  f"由 AI 自動生成的{_TYPE_LABEL[quiz_type]}（agent-quiz-builder）",
        "type":         quiz_type,           # enum: 'exercise' | 'quiz' | 'exam'
        "passage_id":   passage_id,
        "difficulty":   _TYPE_DIFF[quiz_type],
        "question_ids": [q["id"] for q in questions],  # text[]
        "is_published": False,               # 預設不公開，需人工審核後啟用
    }

    sb.table("dsemcq_quizzes").upsert(
        quiz_row, on_conflict="id", ignore_duplicates=True
    ).execute()

    log.info("quiz_created", quiz_id=quiz_id, title=title, question_count=len(questions))
