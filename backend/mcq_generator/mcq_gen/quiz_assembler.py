"""
Quiz Assembler — groups active questions into quiz records by two modes:

  by_passage : questions from the same passage; prefer all-different skills per quiz
  by_skill   : questions sharing a skill tag (cross-passage)

Difficulty distribution targets per quiz type:
  exercise (5q)  : ~70% easy (4q) + ~30% middle (1q)
  quiz     (10q) : 40% easy (4q)  + 60% middle (6q)
  exam     (20q) : 3 easy -> fill middle -> hard fills remainder

Global repeat constraint (applied independently per pool type):
  Each question may appear in at most MAX_REPEAT=2 quizzes of the same type.
  A question can appear <=2x in exercises AND <=2x in quizzes AND <=2x in exams.

Each run always re-assembles ALL matching quizzes (upserts by id).
Existing quiz IDs are preserved so FK references stay intact.
"""
from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from typing import Any

import structlog

from .db.client import get_supabase

log = structlog.get_logger(__name__)

# --- Constants ---------------------------------------------------------------

EXERCISE_Q = 5
QUIZ_Q     = 10
EXAM_Q     = 20

EXERCISE_MIN_SCORE = 6
QUIZ_MIN_SCORE     = 7
EXAM_MIN_SCORE     = 8

QUIZ_DURATION_S = 20 * 60   # 20 min
EXAM_DURATION_S = 45 * 60   # 45 min

MAX_REPEAT = 2   # max appearances per question within the same quiz-type pool

# Difficulty integer values (must match dsemcq_questions.difficulty)
EASY = 2
MID  = 3
HARD = 4

# --- Metadata maps -----------------------------------------------------------

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

COLOR_HEX: dict[str, str] = {
    "exercise": "#E8D5B7",   # warm beige
    "quiz":     "#B5D5C5",   # soft green
    "exam":     "#C9B1D9",   # soft purple
}

PASSAGE_SUBJECT: dict[str, str] = {
    "p01": "先秦哲學",  "p02": "先秦哲學",  "p03": "先秦哲學",  "p04": "先秦哲學",
    "p05": "史傳文學",  "p06": "史傳文學",
    "p07": "唐宋散文",  "p08": "唐宋散文",  "p09": "唐宋散文",  "p10": "唐宋散文",
    "p11": "詩詞",      "p12": "詩詞",
}

EST_LABEL: dict[str, str] = {
    "exercise": "約 5 分鐘",
    "quiz":     "20 分鐘",
    "exam":     "45 分鐘",
}

_QUIZ_META: dict[str, dict] = {
    "exercise": dict(
        duration_seconds=None, max_attempts=None,
        pass_score=60, points_reward=5, min_points_required=0,
    ),
    "quiz": dict(
        duration_seconds=QUIZ_DURATION_S, max_attempts=3,
        pass_score=70, points_reward=15, min_points_required=10,
    ),
    "exam": dict(
        duration_seconds=EXAM_DURATION_S, max_attempts=2,
        pass_score=60, points_reward=50, min_points_required=50,
    ),
}

_MIN_SCORE: dict[str, int] = {
    "exercise": EXERCISE_MIN_SCORE,
    "quiz":     QUIZ_MIN_SCORE,
    "exam":     EXAM_MIN_SCORE,
}

_N_QUESTIONS: dict[str, int] = {
    "exercise": EXERCISE_Q,
    "quiz":     QUIZ_Q,
    "exam":     EXAM_Q,
}

# --- Helpers -----------------------------------------------------------------


def _new_quiz_id() -> str:
    return f"quiz-ai-{uuid.uuid4().hex[:8]}"


def _passage_label(passage_id: str) -> str:
    """Convert 'p07' -> '篇章07'."""
    return f"篇章{passage_id[1:]}" if passage_id.startswith("p") else passage_id


def _score(r: dict) -> int:
    """Return critique_score; treat NULL as 7 (manual questions assumed decent)."""
    return r.get("critique_score") or 7


def _cover_url(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/600/400"


def _primary_skill(r: dict) -> str | None:
    """First non-comparison tag; falls back to first tag if all are comparison."""
    tags = r.get("tags") or []
    non_cmp = [t for t in tags if t != "t-comparison"]
    if non_cmp:
        return non_cmp[0]
    return tags[0] if tags else None


def _diff_targets(quiz_type: str, n: int) -> tuple[int, int]:
    """
    Returns (n_easy, n_mid) slots for this quiz type.
    For exams: n_mid = n - n_easy (fill middle; hard fills remainder via _pick_questions).
    """
    if quiz_type == "exercise":
        n_easy = round(n * 0.7)     # 4 out of 5
    elif quiz_type == "quiz":
        n_easy = round(n * 0.4)     # 4 out of 10
    else:                            # exam
        n_easy = round(n * 0.15)    # 3 out of 20
    return (n_easy, n - n_easy)


# --- Question picker ---------------------------------------------------------


def _pick_questions(
    candidates: list[dict],
    n: int,
    n_easy: int,
    n_mid: int,
    diverse_skills: bool,
) -> list[dict] | None:
    """
    Pick exactly `n` questions from `candidates` targeting the difficulty split.

    Phases:
      1. Pick up to n_easy easy questions (distinct skills if diverse_skills)
      2. Pick up to n_mid  middle questions (distinct skills if diverse_skills)
      3. Fill remainder from any difficulty (distinct skills if diverse_skills)
      4. If still short and diverse_skills=True, relax the skill constraint

    Returns None when fewer than n candidates exist.
    """
    if len(candidates) < n:
        return None

    easy = [r for r in candidates if r.get("difficulty") == EASY]
    mid  = [r for r in candidates if r.get("difficulty") == MID]
    hard = [r for r in candidates if r.get("difficulty") == HARD]

    selected: list[dict] = []
    selected_ids: set[str] = set()
    used_skills: set[str] = set()

    def _take(pool: list[dict], limit: int, check_skill: bool) -> None:
        count = 0
        for r in pool:
            if count >= limit:
                break
            if r["id"] in selected_ids:
                continue
            if check_skill:
                sk = _primary_skill(r)
                if not sk or sk in used_skills:
                    continue
                used_skills.add(sk)
            selected.append(r)
            selected_ids.add(r["id"])
            count += 1

    _take(easy, n_easy, diverse_skills)
    _take(mid,  n_mid,  diverse_skills)
    _take(easy + mid + hard, n - len(selected), diverse_skills)

    # Phase 4: relax skill diversity if still short
    if len(selected) < n and diverse_skills:
        _take(easy + mid + hard, n - len(selected), False)

    return selected if len(selected) >= n else None


# --- Record builder ----------------------------------------------------------


def _make_record(
    *,
    quiz_type: str,
    title: str,
    description: str,
    passage_id: str | None,
    difficulty: int,
    question_ids: list[str],
    cover_image_url: str,
    subject_area: str,
    existing_id_map: dict[tuple, str],
    summary: dict[str, int],
) -> dict:
    key = (passage_id, quiz_type, title)
    meta = _QUIZ_META[quiz_type]
    record = {
        "id":                       existing_id_map.get(key) or _new_quiz_id(),
        "type":                     quiz_type,
        "title":                    title,
        "description":              description,
        "cover_image_url":          cover_image_url,
        "passage_id":               passage_id,
        "difficulty":               difficulty,
        "color_hex":                COLOR_HEX[quiz_type],
        "estimated_duration_label": EST_LABEL[quiz_type],
        "subject_area":             subject_area,
        "is_published":             True,
        "question_ids":             question_ids,
        **meta,
    }
    if existing_id_map.get(key):
        summary["updated"] += 1
    elif quiz_type == "exercise":
        summary["exercises"] += 1
    elif quiz_type == "quiz":
        summary["quizzes"] += 1
    else:
        summary["exams"] += 1
    return record


# --- Description text helpers ------------------------------------------------


def _passage_desc(quiz_type: str, label: str, n: int, min_score: int) -> str:
    if quiz_type == "exercise":
        return f"精選 {n} 條關於{label}的基礎練習題（評分 >= {min_score}/10）"
    if quiz_type == "quiz":
        return f"共 {n} 條{label}綜合測驗，限時 20 分鐘（評分 >= {min_score}/10）"
    return f"共 {n} 條{label}模擬考試，限時 45 分鐘（評分 >= {min_score}/10）"


def _skill_desc(quiz_type: str, label: str, n: int, min_score: int) -> str:
    if quiz_type == "exercise":
        return f"跨篇章精選 {n} 條【{label}】練習題（評分 >= {min_score}/10）"
    if quiz_type == "quiz":
        return f"跨篇章 {n} 條【{label}】綜合測驗，限時 20 分鐘（評分 >= {min_score}/10）"
    return f"跨篇章 {n} 條【{label}】模擬考試，限時 45 分鐘（評分 >= {min_score}/10）"


# --- Assembly per quiz type --------------------------------------------------


def _assemble_type(
    quiz_type: str,
    all_rows: list[dict],
    existing_id_map: dict[tuple, str],
    summary: dict[str, int],
) -> list[dict]:
    """
    Assemble by-passage and by-skill quizzes for a single quiz_type.
    usage_counts starts fresh so the resulting set satisfies MAX_REPEAT independently.
    """
    min_score = _MIN_SCORE[quiz_type]
    n         = _N_QUESTIONS[quiz_type]
    n_easy, n_mid = _diff_targets(quiz_type, n)

    eligible = [r for r in all_rows if _score(r) >= min_score]

    # Track how many times each question has been placed in this type's quizzes
    usage_counts: Counter = Counter()

    records: list[dict] = []

    # -- By-passage -----------------------------------------------------------
    by_passage: dict[str, list[dict]] = defaultdict(list)
    for r in eligible:
        pid = r.get("passage_id") or "unknown"
        by_passage[pid].append(r)

    for pid in sorted(by_passage.keys()):
        passage_rows = by_passage[pid]
        label = _passage_label(pid)
        subj  = PASSAGE_SUBJECT.get(pid, "文言文")
        slot  = 1

        while True:
            available = [r for r in passage_rows if usage_counts[r["id"]] < MAX_REPEAT]
            selected  = _pick_questions(available, n, n_easy, n_mid, diverse_skills=True)
            if selected is None:
                break

            base_title = (
                f"{label} 練習題"   if quiz_type == "exercise" else
                f"{label} 綜合測驗" if quiz_type == "quiz"     else
                f"{label} 模擬考試"
            )
            title = base_title if slot == 1 else f"{base_title} ({slot})"

            records.append(_make_record(
                quiz_type=quiz_type,
                title=title,
                description=_passage_desc(quiz_type, label, n, min_score),
                passage_id=pid,
                difficulty=EASY,
                question_ids=[r["id"] for r in selected],
                cover_image_url=_cover_url(f"passage_{pid}_{quiz_type}_{slot}"),
                subject_area=subj,
                existing_id_map=existing_id_map,
                summary=summary,
            ))
            for r in selected:
                usage_counts[r["id"]] += 1
            slot += 1

    # -- By-skill -------------------------------------------------------------
    by_skill: dict[str, list[dict]] = defaultdict(list)
    for r in eligible:
        sk = _primary_skill(r)
        if sk:
            by_skill[sk].append(r)

    for tag_id in sorted(by_skill.keys()):
        skill_rows  = by_skill[tag_id]
        skill_label = TAG_LABEL.get(tag_id, tag_id)
        img_slug    = tag_id.replace("t-", "skill_")
        slot        = 1

        while True:
            available = [r for r in skill_rows if usage_counts[r["id"]] < MAX_REPEAT]
            selected  = _pick_questions(available, n, n_easy, n_mid, diverse_skills=False)
            if selected is None:
                break

            base_title = (
                f"{skill_label} 練習題"   if quiz_type == "exercise" else
                f"{skill_label} 綜合測驗" if quiz_type == "quiz"     else
                f"{skill_label} 模擬考試"
            )
            title = base_title if slot == 1 else f"{base_title} ({slot})"

            records.append(_make_record(
                quiz_type=quiz_type,
                title=title,
                description=_skill_desc(quiz_type, skill_label, n, min_score),
                passage_id=None,
                difficulty=EASY,
                question_ids=[r["id"] for r in selected],
                cover_image_url=_cover_url(f"{img_slug}_{quiz_type}_{slot}"),
                subject_area=skill_label,
                existing_id_map=existing_id_map,
                summary=summary,
            ))
            for r in selected:
                usage_counts[r["id"]] += 1
            slot += 1

    return records


# --- Main entry point --------------------------------------------------------


def assemble_quizzes(
    dry_run: bool = False,
    strategies: list[str] | None = None,
) -> dict[str, Any]:
    """
    Fetch all active questions, assemble quiz records by passage and by skill
    for each quiz type (exercise, quiz, exam), then upsert into dsemcq_quizzes.

    strategies: kept for API compatibility; both passage and skill groupings are
                always applied for all quiz types regardless of this parameter.
    Returns a summary dict.
    """
    sb = get_supabase()

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

    # Attach skill tags
    q_ids = [r["id"] for r in rows]
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

    # Load existing quiz IDs for stable upsert (preserves FK references)
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

    # Assemble each quiz type independently (each has its own repeat budget)
    for quiz_type in ("exercise", "quiz", "exam"):
        records = _assemble_type(quiz_type, rows, existing_id_map, summary)
        to_upsert.extend(records)
        log.info(f"assembled_{quiz_type}", count=len(records))

    if not dry_run and to_upsert:
        sb.table("dsemcq_quizzes").upsert(to_upsert, on_conflict="id").execute()
        log.info("quizzes_assembled", **summary)
    else:
        log.info("assemble_dry_run", to_upsert=len(to_upsert), **summary)

    return {
        **summary,
        "total_new": summary["exercises"] + summary["quizzes"] + summary["exams"],
        "dry_run": dry_run,
        "strategies": ["passage", "skill"],
    }