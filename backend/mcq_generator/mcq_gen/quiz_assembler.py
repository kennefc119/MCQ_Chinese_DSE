"""
Quiz Assembler — groups active questions into quiz records by three strategies:

  passage   : questions from the same passage (per-篇章)
  skill     : questions sharing a skill/topic tag (cross-passage)
              e.g. 修辭手法 練習題, 內容理解 綜合測驗
  difficulty: questions at the same difficulty level (cross-passage)
              e.g. 難度三 練習題

  exam      : 20 best questions across ≥3 passages (score≥8, always)

Assembly thresholds per quiz type:
  exercise : ≥5  questions · score≥6 · no time limit · open access
  quiz     : ≥10 questions · score≥7 · 20-min limit  · needs 10 pts
  exam     : ≥20 questions · score≥8 · 45-min limit  · needs 50 pts

Each run always re-assembles ALL matching quizzes (upserts by id).
Existing quiz IDs are preserved so FK references stay intact.
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

EXERCISE_MIN_SCORE = 6
QUIZ_MIN_SCORE     = 7
EXAM_MIN_SCORE     = 8

QUIZ_DURATION_S = 20 * 60   # 20 min
EXAM_DURATION_S = 45 * 60   # 45 min

# ─── Label maps ───────────────────────────────────────────────────────────────

TAG_LABEL: dict[str, str] = {
    "t-meaning":       "字詞解釋",
    "t-comprehension": "內容理解",
    "t-theme":         "主旨歸納",
    "t-rhetoric":      "修辭手法",
    "t-character":     "人物分析",
    "t-grammar":       "句式語法",
    "t-context":       "背景知識",
    "t-comparison":    "跨篇章比較",
}

DIFF_LABEL: dict[int, str] = {1: "一", 2: "二", 3: "三", 4: "四", 5: "五"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _new_quiz_id() -> str:
    return f"quiz-ai-{uuid.uuid4().hex[:8]}"


def _passage_label(passage_id: str) -> str:
    """Convert 'p07' → '篇章07'."""
    return f"篇章{passage_id[1:]}" if passage_id.startswith("p") else passage_id


def _score(r: dict) -> int:
    """Return critique_score; treat NULL as 7 (manual questions assumed decent)."""
    return r.get("critique_score") or 7


def _build_pool(rows: list[dict], min_score: int,
                key_fn) -> dict[str, list[str]]:
    """
    Group question IDs by key_fn(row), filtered to score >= min_score.
    key_fn must return a list of keys (one question can go into multiple groups).
    """
    pool: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        if _score(r) >= min_score:
            for k in key_fn(r):
                if k:
                    pool[k].append(r["id"])
    return pool


def _make_record(
    *,
    quiz_type: str,
    title: str,
    description: str,
    passage_id: str | None,
    difficulty: int,
    question_ids: list[str],
    duration_seconds: int | None,
    max_attempts: int | None,
    pass_score: int,
    points_reward: int,
    min_points_required: int,
    existing_id_map: dict[tuple, str],
    summary: dict[str, int],
) -> dict:
    key = (passage_id, quiz_type, title)
    existing_id = existing_id_map.get(key)
    record = {
        "id":                   existing_id or _new_quiz_id(),
        "type":                 quiz_type,
        "title":                title,
        "description":          description,
        "passage_id":           passage_id,
        "difficulty":           difficulty,
        "duration_seconds":     duration_seconds,
        "max_attempts":         max_attempts,
        "pass_score":           pass_score,
        "points_reward":        points_reward,
        "min_points_required":  min_points_required,
        "is_published":         True,
        "question_ids":         question_ids,
    }
    if existing_id:
        summary["updated"] += 1
    elif quiz_type == "exercise":
        summary["exercises"] += 1
    elif quiz_type == "quiz":
        summary["quizzes"] += 1
    elif quiz_type == "exam":
        summary["exams"] += 1
    return record


# ─── Core ─────────────────────────────────────────────────────────────────────

def assemble_quizzes(
    dry_run: bool = False,
    strategies: list[str] | None = None,
) -> dict[str, Any]:
    """
    Fetch all active questions, apply assembly rules for the requested strategies,
    and upsert quiz rows into dsemcq_quizzes.

    strategies: list containing any of 'passage', 'skill', 'difficulty'.
                Default: all three.
    Returns a summary dict.
    """
    if strategies is None:
        strategies = ["passage", "skill", "difficulty"]

    sb = get_supabase()

    # 1. All active questions
    rows = (
        sb.table("dsemcq_questions")
        .select("id,passage_id,difficulty,critique_score")
        .eq("is_active", True)
        .execute()
        .data or []
    )

    if not rows:
        log.warning("assemble_no_active_questions")
        return {"exercises": 0, "quizzes": 0, "exams": 0, "updated": 0,
                "total_new": 0, "dry_run": dry_run}

    # 2. Fetch skill tags for all active questions
    q_ids = [r["id"] for r in rows]
    # Supabase in_() accepts a list
    tag_rows = (
        sb.table("dsemcq_question_tags")
        .select("question_id,tag_id")
        .in_("question_id", q_ids)
        .execute()
        .data or []
    )
    q_tags: dict[str, list[str]] = defaultdict(list)
    for tr in tag_rows:
        q_tags[tr["question_id"]].append(tr["tag_id"])
    for r in rows:
        r["tags"] = q_tags.get(r["id"], [])

    # 3. Existing quizzes → id map keyed by (passage_id, type, title)
    existing = (
        sb.table("dsemcq_quizzes")
        .select("id,title,passage_id,type")
        .execute()
        .data or []
    )
    existing_id_map: dict[tuple, str] = {
        (e.get("passage_id"), e.get("type"), e.get("title")): e["id"]
        for e in existing
    }

    summary: dict[str, int] = {"exercises": 0, "quizzes": 0, "exams": 0, "updated": 0}
    to_upsert: list[dict] = []

    # ── Strategy: passage ─────────────────────────────────────────────────────
    if "passage" in strategies:
        ex_pool   = _build_pool(rows, EXERCISE_MIN_SCORE,
                                lambda r: [r.get("passage_id") or "unknown"])
        quiz_pool = _build_pool(rows, QUIZ_MIN_SCORE,
                                lambda r: [r.get("passage_id") or "unknown"])

        for pid in sorted(set(list(ex_pool) + list(quiz_pool))):
            label = _passage_label(pid)

            if len(ex_pool.get(pid, [])) >= EXERCISE_Q:
                to_upsert.append(_make_record(
                    quiz_type="exercise",
                    title=f"{label} 練習題",
                    description=(
                        f"精選 {EXERCISE_Q} 條關於{label}的基礎練習題"
                        f"（評分 ≥ {EXERCISE_MIN_SCORE}/10）"
                    ),
                    passage_id=pid, difficulty=2,
                    question_ids=ex_pool[pid][:EXERCISE_Q],
                    duration_seconds=None, max_attempts=None,
                    pass_score=60, points_reward=5, min_points_required=0,
                    existing_id_map=existing_id_map, summary=summary,
                ))

            if len(quiz_pool.get(pid, [])) >= QUIZ_Q:
                to_upsert.append(_make_record(
                    quiz_type="quiz",
                    title=f"{label} 綜合測驗",
                    description=(
                        f"共 {QUIZ_Q} 條{label}綜合測驗，限時 20 分鐘"
                        f"（評分 ≥ {QUIZ_MIN_SCORE}/10）"
                    ),
                    passage_id=pid, difficulty=3,
                    question_ids=quiz_pool[pid][:QUIZ_Q],
                    duration_seconds=QUIZ_DURATION_S, max_attempts=3,
                    pass_score=70, points_reward=15, min_points_required=10,
                    existing_id_map=existing_id_map, summary=summary,
                ))

    # ── Strategy: skill (tag-based, cross-passage) ────────────────────────────
    if "skill" in strategies:
        skill_ex_pool   = _build_pool(rows, EXERCISE_MIN_SCORE,
                                      lambda r: r.get("tags", []))
        skill_quiz_pool = _build_pool(rows, QUIZ_MIN_SCORE,
                                      lambda r: r.get("tags", []))

        for tag_id in sorted(set(list(skill_ex_pool) + list(skill_quiz_pool))):
            label = TAG_LABEL.get(tag_id, tag_id)

            if len(skill_ex_pool.get(tag_id, [])) >= EXERCISE_Q:
                to_upsert.append(_make_record(
                    quiz_type="exercise",
                    title=f"{label} 練習題",
                    description=(
                        f"跨篇章精選 {EXERCISE_Q} 條【{label}】練習題"
                        f"（評分 ≥ {EXERCISE_MIN_SCORE}/10）"
                    ),
                    passage_id=None, difficulty=2,
                    question_ids=skill_ex_pool[tag_id][:EXERCISE_Q],
                    duration_seconds=None, max_attempts=None,
                    pass_score=60, points_reward=5, min_points_required=0,
                    existing_id_map=existing_id_map, summary=summary,
                ))

            if len(skill_quiz_pool.get(tag_id, [])) >= QUIZ_Q:
                to_upsert.append(_make_record(
                    quiz_type="quiz",
                    title=f"{label} 綜合測驗",
                    description=(
                        f"跨篇章 {QUIZ_Q} 條【{label}】綜合測驗，限時 20 分鐘"
                        f"（評分 ≥ {QUIZ_MIN_SCORE}/10）"
                    ),
                    passage_id=None, difficulty=3,
                    question_ids=skill_quiz_pool[tag_id][:QUIZ_Q],
                    duration_seconds=QUIZ_DURATION_S, max_attempts=3,
                    pass_score=70, points_reward=15, min_points_required=10,
                    existing_id_map=existing_id_map, summary=summary,
                ))

    # ── Strategy: difficulty (cross-passage) ─────────────────────────────────
    if "difficulty" in strategies:
        diff_ex_pool   = _build_pool(rows, EXERCISE_MIN_SCORE,
                                     lambda r: [str(r.get("difficulty") or 2)])
        diff_quiz_pool = _build_pool(rows, QUIZ_MIN_SCORE,
                                     lambda r: [str(r.get("difficulty") or 2)])

        for d_str in sorted(set(list(diff_ex_pool) + list(diff_quiz_pool))):
            d_int = int(d_str)
            label = f"難度{DIFF_LABEL.get(d_int, d_str)}"

            if len(diff_ex_pool.get(d_str, [])) >= EXERCISE_Q:
                to_upsert.append(_make_record(
                    quiz_type="exercise",
                    title=f"{label} 練習題",
                    description=(
                        f"跨篇章精選 {EXERCISE_Q} 條{label}練習題"
                        f"（評分 ≥ {EXERCISE_MIN_SCORE}/10）"
                    ),
                    passage_id=None, difficulty=d_int,
                    question_ids=diff_ex_pool[d_str][:EXERCISE_Q],
                    duration_seconds=None, max_attempts=None,
                    pass_score=60, points_reward=5, min_points_required=0,
                    existing_id_map=existing_id_map, summary=summary,
                ))

            if len(diff_quiz_pool.get(d_str, [])) >= QUIZ_Q:
                to_upsert.append(_make_record(
                    quiz_type="quiz",
                    title=f"{label} 綜合測驗",
                    description=(
                        f"跨篇章 {QUIZ_Q} 條{label}綜合測驗，限時 20 分鐘"
                        f"（評分 ≥ {QUIZ_MIN_SCORE}/10）"
                    ),
                    passage_id=None, difficulty=d_int,
                    question_ids=diff_quiz_pool[d_str][:QUIZ_Q],
                    duration_seconds=QUIZ_DURATION_S, max_attempts=3,
                    pass_score=70, points_reward=15, min_points_required=10,
                    existing_id_map=existing_id_map, summary=summary,
                ))

    # ── Exam: always (cross-passage, score≥8, needs ≥3 passages × ≥5 Qs) ─────
    exam_pool = _build_pool(rows, EXAM_MIN_SCORE,
                            lambda r: [r.get("passage_id") or "unknown"])
    exam_candidates = [
        (pid, qids) for pid, qids in sorted(exam_pool.items()) if len(qids) >= 5
    ]
    if len(exam_candidates) >= 3:
        exam_qids: list[str] = []
        per_p = EXAM_Q // len(exam_candidates)
        remainder = EXAM_Q % len(exam_candidates)
        for i, (_, qids) in enumerate(exam_candidates):
            take = per_p + (1 if i < remainder else 0)
            exam_qids.extend(qids[:take])
            if len(exam_qids) >= EXAM_Q:
                break
        exam_qids = exam_qids[:EXAM_Q]
        to_upsert.append(_make_record(
            quiz_type="exam",
            title="DSE 中文 模擬考試",
            description=(
                f"涵蓋 {len(exam_candidates)} 篇課文，共 {len(exam_qids)} 條模擬 DSE 閱讀理解題，"
                f"限時 45 分鐘，滿分率 60% 合格（評分 ≥ {EXAM_MIN_SCORE}/10）"
            ),
            passage_id=None, difficulty=4,
            question_ids=exam_qids,
            duration_seconds=EXAM_DURATION_S, max_attempts=2,
            pass_score=60, points_reward=50, min_points_required=50,
            existing_id_map=existing_id_map, summary=summary,
        ))

    # ── Write or dry-run ──────────────────────────────────────────────────────
    if not dry_run and to_upsert:
        sb.table("dsemcq_quizzes").upsert(to_upsert, on_conflict="id").execute()
        log.info("quizzes_assembled", **summary, strategies=strategies)
    else:
        log.info("assemble_dry_run", to_upsert=len(to_upsert), **summary)

    return {
        **summary,
        "total_new": summary["exercises"] + summary["quizzes"] + summary["exams"],
        "dry_run": dry_run,
        "strategies": strategies,
    }

