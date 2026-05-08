"""
Quiz Assembler — automatically groups active questions into quiz records.

Assembly rules
──────────────
  exercise : 5  questions · same passage · no time limit · open access
  quiz     : 10 questions · same passage · 20-min limit  · needs 10 pts
  exam     : 20 questions · 3+ passages  · 45-min limit  · needs 50 pts

Quality filtering by critique_score (1–10):
  exercise  : score >= 6  (accessible, decent quality)
  quiz      : score >= 7  (solid quality for scored tests)
  exam      : score >= 8  (only best questions for mock exam)

A new record is only created when:
  · enough qualifying questions exist (after score filter)
  · a quiz with the same (passage_id, type, title) doesn't already exist
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

import structlog

from .db.client import get_supabase

log = structlog.get_logger(__name__)

# ─── Thresholds & settings ────────────────────────────────────────────────────

EXERCISE_Q = 5
QUIZ_Q = 10
EXAM_Q = 20

# Minimum critique_score to qualify for each quiz type
EXERCISE_MIN_SCORE = 6
QUIZ_MIN_SCORE     = 7
EXAM_MIN_SCORE     = 8

QUIZ_DURATION_S = 20 * 60   # 20 min
EXAM_DURATION_S = 45 * 60   # 45 min


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _new_quiz_id() -> str:
    return f"quiz-ai-{uuid.uuid4().hex[:8]}"


def _passage_label(passage_id: str) -> str:
    """Convert 'p07' → '篇章07'."""
    return f"篇章{passage_id[1:]}" if passage_id.startswith("p") else passage_id


# ─── Core ─────────────────────────────────────────────────────────────────────

def assemble_quizzes(dry_run: bool = False) -> dict[str, Any]:
    """
    Fetch all active questions from Supabase, apply assembly rules,
    and upsert new quiz rows into dsemcq_quizzes.

    Returns a summary dict with counts of created/skipped records.
    """
    sb = get_supabase()

    # 1. All active questions with their critique_score
    rows = (
        sb.table("dsemcq_questions")
        .select("id,passage_id,difficulty,critique_score")
        .eq("is_active", True)
        .execute()
        .data or []
    )

    if not rows:
        log.warning("assemble_no_active_questions")
        return {"exercises": 0, "quizzes": 0, "exams": 0, "skipped": 0, "total_new": 0}

    def _score(r: dict) -> int:
        """Return critique_score; treat NULL (manual questions) as 7."""
        return r.get("critique_score") or 7

    # 2. Three score-filtered pools, each grouped by passage
    def _by_passage(min_score: int) -> dict[str, list[str]]:
        pool: dict[str, list[str]] = defaultdict(list)
        for r in rows:
            if _score(r) >= min_score:
                pid = r.get("passage_id") or "unknown"
                pool[pid].append(r["id"])
        return pool

    ex_pool   = _by_passage(EXERCISE_MIN_SCORE)
    quiz_pool = _by_passage(QUIZ_MIN_SCORE)
    exam_pool = _by_passage(EXAM_MIN_SCORE)

    # 3. Existing quiz keys → avoid duplicates
    existing = (
        sb.table("dsemcq_quizzes")
        .select("title,passage_id,type")
        .execute()
        .data or []
    )
    existing_keys = {
        (e.get("passage_id"), e.get("type"), e.get("title"))
        for e in existing
    }

    summary = {"exercises": 0, "quizzes": 0, "exams": 0, "skipped": 0}
    to_insert: list[dict] = []

    # 4. Per-passage: exercise + quiz
    for pid in sorted(set(list(ex_pool.keys()) + list(quiz_pool.keys()))):
        label = _passage_label(pid)
        ex_qids   = ex_pool.get(pid, [])
        quiz_qids = quiz_pool.get(pid, [])

        if len(ex_qids) >= EXERCISE_Q:
            title = f"{label} 練習題"
            if (pid, "exercise", title) not in existing_keys:
                to_insert.append({
                    "id": _new_quiz_id(),
                    "type": "exercise",
                    "title": title,
                    "description": (
                        f"精選 {EXERCISE_Q} 條關於{label}的基礎練習題"
                        f"（評分 ≥ {EXERCISE_MIN_SCORE}/10）"
                    ),
                    "passage_id": pid,
                    "difficulty": 2,
                    "duration_seconds": None,
                    "max_attempts": None,
                    "pass_score": 60,
                    "points_reward": 5,
                    "min_points_required": 0,
                    "is_published": True,
                    "question_ids": ex_qids[:EXERCISE_Q],
                })
                summary["exercises"] += 1
            else:
                summary["skipped"] += 1

        if len(quiz_qids) >= QUIZ_Q:
            title = f"{label} 綜合測驗"
            if (pid, "quiz", title) not in existing_keys:
                to_insert.append({
                    "id": _new_quiz_id(),
                    "type": "quiz",
                    "title": title,
                    "description": (
                        f"共 {QUIZ_Q} 條{label}綜合測驗，限時 20 分鐘"
                        f"（評分 ≥ {QUIZ_MIN_SCORE}/10）"
                    ),
                    "passage_id": pid,
                    "difficulty": 3,
                    "duration_seconds": QUIZ_DURATION_S,
                    "max_attempts": 3,
                    "pass_score": 70,
                    "points_reward": 15,
                    "min_points_required": 10,
                    "is_published": True,
                    "question_ids": quiz_qids[:QUIZ_Q],
                })
                summary["quizzes"] += 1
            else:
                summary["skipped"] += 1

    # 5. Exam — needs ≥3 passages each with ≥5 high-quality Qs
    exam_candidates = [
        (pid, qids) for pid, qids in sorted(exam_pool.items()) if len(qids) >= 5
    ]
    if len(exam_candidates) >= 3:
        exam_qids: list[str] = []
        per_p = EXAM_Q // len(exam_candidates)
        remainder = EXAM_Q % len(exam_candidates)

        for i, (pid, qids) in enumerate(exam_candidates):
            take = per_p + (1 if i < remainder else 0)
            exam_qids.extend(qids[:take])
            if len(exam_qids) >= EXAM_Q:
                break

        exam_qids = exam_qids[:EXAM_Q]
        n_passages = len(exam_candidates)
        exam_title = "DSE 中文 模擬考試"

        if (None, "exam", exam_title) not in existing_keys:
            to_insert.append({
                "id": _new_quiz_id(),
                "type": "exam",
                "title": exam_title,
                "description": (
                    f"涵蓋 {n_passages} 篇課文，共 {len(exam_qids)} 條模擬 DSE 閱讀理解題，"
                    f"限時 45 分鐘，滿分率 60% 合格（評分 ≥ {EXAM_MIN_SCORE}/10）"
                ),
                "passage_id": None,
                "difficulty": 4,
                "duration_seconds": EXAM_DURATION_S,
                "max_attempts": 2,
                "pass_score": 60,
                "points_reward": 50,
                "min_points_required": 50,
                "is_published": True,
                "question_ids": exam_qids,
            })
            summary["exams"] += 1
        else:
            summary["skipped"] += 1

    # 6. Write or dry-run
    if not dry_run and to_insert:
        sb.table("dsemcq_quizzes").upsert(
            to_insert, on_conflict="id", ignore_duplicates=True
        ).execute()
        log.info("quizzes_assembled", **summary)
    else:
        log.info("assemble_dry_run", to_insert=len(to_insert), **summary)

    return {**summary, "total_new": len(to_insert), "dry_run": dry_run}
