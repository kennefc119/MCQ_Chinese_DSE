"""
Quiz Assembler — groups active questions into quiz records by (passage, skill).

Grouping key: (passage_id, skill_tag, quiz_type)
  Each unique combination produces as many non-overlapping quiz instances as
  the filtered pool allows.  A question is unique within a (passage, skill, type)
  but may appear in different combinations.

Filtering per quiz type (applied before assembly):
  exercise (5q)  : keep 50%, filter out 50%  — difficult questions removed first
  quiz     (10q) : keep 75%, filter out 25%  — difficult questions removed first
  exam     (20q) : no filter                 — use all eligible questions

Each run uses a different random seed so the combinations vary.
Existing quiz IDs are preserved so FK references stay intact.
"""
from __future__ import annotations

import random
import time
import uuid
from collections import defaultdict
from typing import Any

import structlog

from .db.client import fetch_all, get_supabase

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

# Keep ratio per quiz type — questions are randomly filtered before assembly,
# prioritising removal of difficult questions first.
_KEEP_RATIO: dict[str, float] = {
    "exercise": 0.50,   # keep 50%, filter out 50%
    "quiz":     0.75,   # keep 75%, filter out 25%
    "exam":     1.00,   # no filter
}

# Allowed difficulty range for questions in each quiz type.
# Questions outside the range are excluded before assembly.
_DIFF_RANGE: dict[str, tuple[int, int]] = {
    "exercise": (1, 3),   # stars 1-3
    "quiz":     (2, 4),   # stars 2-4
    "exam":     (3, 5),   # stars 3-5
}

# S3 cover image base URL (images are publicly accessible)
S3_BASE_URL = "https://tb6-mood.s3.ap-southeast-2.amazonaws.com/dse_chi/"

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


_CN_DIGITS = "零一二三四五六七八九"

def _to_chinese_num(n: int) -> str:
    """Convert positive integer to traditional Chinese number string (1-99)."""
    if n <= 0:
        return str(n)
    if n < 10:
        return _CN_DIGITS[n]
    if n < 20:
        return ("十" if n == 10 else f"十{_CN_DIGITS[n % 10]}")
    tens, ones = divmod(n, 10)
    return f"{_CN_DIGITS[tens]}十" + (_CN_DIGITS[ones] if ones else "")


def _new_quiz_id() -> str:
    return f"quiz-ai-{uuid.uuid4().hex[:8]}"


def _passage_label(passage_id: str) -> str:
    """Convert 'p07' -> '篇章07'."""
    return f"篇章{passage_id[1:]}" if passage_id.startswith("p") else passage_id


def _score(r: dict) -> int:
    """Return critique_score; treat NULL as 7 (manual questions assumed decent)."""
    return r.get("critique_score") or 7


def _fetch_s3_image_count() -> int:
    """
    Probe the S3 folder with HEAD requests to count sequential PNG images
    (1.png, 2.png, ...).  Uses binary search so it scales efficiently as the
    folder grows.  Requires only public read (GetObject) access — no AWS
    credentials needed.
    """
    import httpx

    def _exists(n: int) -> bool:
        try:
            r = httpx.head(f"{S3_BASE_URL}{n}.png", timeout=5)
            return r.status_code == 200
        except Exception:
            return False

    if not _exists(1):
        log.warning("s3_cover_image_1_not_found", url=f"{S3_BASE_URL}1.png")
        return 0  # no images in bucket — callers must handle None cover

    # Exponential scan to find an upper bound, then binary-search for the last image
    lo, hi = 1, 1
    while _exists(hi):
        hi *= 2

    while lo < hi - 1:
        mid = (lo + hi) // 2
        if _exists(mid):
            lo = mid
        else:
            hi = mid

    log.info("s3_cover_image_count", count=lo)
    return lo


class CoverImagePicker:
    """
    Assigns cover images from the S3 folder in a shuffled order, exhausting
    all available images before repeating.  One instance is created per quiz
    type so each type gets its own independent shuffle.
    Returns None when no images are available in the bucket.
    """

    def __init__(self, image_count: int) -> None:
        self._total = max(image_count, 0)
        self._queue: list[int] = []
        if self._total > 0:
            self._refill()

    def _refill(self) -> None:
        indices = list(range(1, self._total + 1))
        random.shuffle(indices)
        self._queue = indices

    def next(self) -> str | None:
        if self._total == 0:
            return None
        if not self._queue:
            self._refill()
        return f"{S3_BASE_URL}{self._queue.pop()}.png"


def _filter_pool(
    questions: list[dict],
    keep_ratio: float,
    rng: random.Random,
) -> list[dict]:
    """Filter questions by *keep_ratio*, prioritising removal of difficult ones.

    Within each difficulty level the specific questions removed are chosen
    randomly (controlled by *rng* so each run produces different combos).
    """
    if keep_ratio >= 1.0:
        return list(questions)

    n_keep = max(1, round(len(questions) * keep_ratio))
    if n_keep >= len(questions):
        return list(questions)

    # Group by difficulty — we remove from the hardest buckets first
    by_diff: dict[int, list[dict]] = defaultdict(list)
    for q in questions:
        by_diff[q.get("difficulty", 3)].append(q)

    to_remove = len(questions) - n_keep
    removed: set[str] = set()

    for diff in sorted(by_diff.keys(), reverse=True):
        group = list(by_diff[diff])
        rng.shuffle(group)
        for q in group:
            if to_remove <= 0:
                break
            removed.add(q["id"])
            to_remove -= 1
        if to_remove <= 0:
            break

    return [q for q in questions if q["id"] not in removed]


# --- Record builder ----------------------------------------------------------


def _make_record(
    *,
    quiz_type: str,
    title: str,
    description: str,
    passage_id: str | None,
    question_ids: list[str],
    cover_image_url: str | None,
    subject_area: str,
    existing_id_map: dict[tuple, str],
    summary: dict[str, int],
    title_id: int,          # 1-based sequence within (passage/skill, quiz_type)
) -> dict:
    key = (passage_id, quiz_type, title, title_id)
    meta = _QUIZ_META[quiz_type]
    record = {
        "id":                       existing_id_map.get(key) or _new_quiz_id(),
        "type":                     quiz_type,
        "title":                    title,
        "description":              description,
        "cover_image_url":          cover_image_url,
        "passage_id":               passage_id,
        "color_hex":                COLOR_HEX[quiz_type],
        "estimated_duration_label": EST_LABEL[quiz_type],
        "subject_area":             subject_area,
        "is_published":             True,
        "question_ids":             question_ids,
        "title_id":                 title_id,
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


def _passage_skill_desc(quiz_type: str, passage_label: str, skill_label: str, n: int, min_score: int) -> str:
    if quiz_type == "exercise":
        return f"精選 {n} 條關於{passage_label}【{skill_label}】的基礎練習題（評分 >= {min_score}/10）"
    if quiz_type == "quiz":
        return f"共 {n} 條{passage_label}【{skill_label}】綜合測驗，限時 20 分鐘（評分 >= {min_score}/10）"
    return f"共 {n} 條{passage_label}【{skill_label}】模擬考試，限時 45 分鐘（評分 >= {min_score}/10）"


# --- Assembly per quiz type --------------------------------------------------


def _assemble_type(
    quiz_type: str,
    all_rows: list[dict],
    existing_id_map: dict[tuple, str],
    summary: dict[str, int],
    passage_titles: dict[str, str] | None = None,
    picker: "CoverImagePicker | None" = None,
    existing_cover_map: "dict[str, str] | None" = None,
    rng: random.Random | None = None,
) -> list[dict]:
    """
    Assemble quizzes grouped by (passage, skill) for a single quiz_type.

    Each (passage, skill, type) combination produces as many non-overlapping
    quiz instances as the filtered pool allows.  A question is used at most
    once within the same (passage, skill, type) but may appear across different
    combinations.

    Filtering: exercise keeps 50%, quiz keeps 75%, exam keeps 100%.
    Difficult questions are filtered out first, then randomly within each level.
    """
    min_score  = _MIN_SCORE[quiz_type]
    n          = _N_QUESTIONS[quiz_type]
    keep_ratio = _KEEP_RATIO[quiz_type]

    diff_lo, diff_hi = _DIFF_RANGE[quiz_type]
    eligible = [
        r for r in all_rows
        if _score(r) >= min_score
        and diff_lo <= r.get("difficulty", 3) <= diff_hi
    ]

    if rng is None:
        rng = random.Random()

    records: list[dict] = []

    _ptitles = passage_titles or {}
    _cover_map = existing_cover_map or {}

    def _pick_cover(passage_id: str | None, title: str, title_id: int) -> str | None:
        key = (passage_id, quiz_type, title, title_id)
        existing_id = existing_id_map.get(key)
        if existing_id:
            existing = _cover_map.get(existing_id, "")
            if existing:
                return existing
        if picker is None:
            return None
        return picker.next()

    # Group by (passage_id, skill_tag) — a question with multiple tags appears
    # in multiple groups; it may be reused across different (passage, skill) combos.
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in eligible:
        pid = r.get("passage_id")
        if not pid:
            continue
        for tag in (r.get("tags") or []):
            groups[(pid, tag)].append(r)

    for (pid, tag_id) in sorted(groups.keys()):
        pool = groups[(pid, tag_id)]

        # Apply keep-ratio filter (removes difficult questions first, then random)
        filtered = _filter_pool(pool, keep_ratio, rng)

        # ── Stratified shuffle: interleave difficulty levels for variety ──
        by_diff: dict[int, list[dict]] = defaultdict(list)
        for q in filtered:
            by_diff[q.get("difficulty", 3)].append(q)
        for bucket in by_diff.values():
            rng.shuffle(bucket)

        # Round-robin across difficulty levels (low → high, repeat) so each
        # slice of N questions gets a spread of difficulties.
        stratified: list[dict] = []
        diff_keys = sorted(by_diff.keys())
        buckets = {k: list(by_diff[k]) for k in diff_keys}
        while any(buckets.values()):
            for k in diff_keys:
                if buckets[k]:
                    stratified.append(buckets[k].pop(0))
        filtered = stratified

        # Create as many non-overlapping instances as possible
        n_instances = len(filtered) // n
        if n_instances == 0:
            continue

        skill_label = TAG_LABEL.get(tag_id, tag_id)
        label = (_ptitles.get(pid) or _passage_label(pid)).removesuffix("（節錄）").strip()
        subj  = PASSAGE_SUBJECT.get(pid, "文言文")

        for i in range(n_instances):
            batch = filtered[i * n : (i + 1) * n]
            seq   = i + 1
            title = f"{label}【{skill_label}】"
            records.append(_make_record(
                quiz_type=quiz_type,
                title=title,
                description=_passage_skill_desc(quiz_type, label, skill_label, n, min_score),
                passage_id=pid,
                question_ids=[r["id"] for r in batch],
                cover_image_url=_pick_cover(pid, title, seq),
                subject_area=subj,
                existing_id_map=existing_id_map,
                summary=summary,
                title_id=seq,
            ))

    return records


# --- Main entry point --------------------------------------------------------


def assemble_quizzes(
    dry_run: bool = False,
    strategies: list[str] | None = None,
) -> dict[str, Any]:
    """
    Fetch all active questions, assemble quiz records grouped by
    (passage, skill, type), then upsert into dsemcq_quizzes.

    Each run uses a different random seed so the combinations vary.
    strategies: kept for API compatibility; ignored.
    Returns a summary dict.
    """
    sb = get_supabase()

    rows = fetch_all(
        sb.table("dsemcq_questions")
        .select("id,passage_id,difficulty,critique_score")
        .eq("is_active", True)
    )
    if not rows:
        log.warning("assemble_no_active_questions")
        return {"exercises": 0, "quizzes": 0, "exams": 0, "updated": 0,
                "total_new": 0, "dry_run": dry_run}

    # Attach skill tags — fetch all tags (avoids URL length limit with large .in_() lists)
    q_id_set = set(r["id"] for r in rows)
    all_tag_rows = fetch_all(
        sb.table("dsemcq_question_tags")
        .select("question_id,tag_id")
    )
    q_tags: dict[str, list[str]] = defaultdict(list)
    for tr in all_tag_rows:
        if tr["question_id"] in q_id_set:
            q_tags[tr["question_id"]].append(tr["tag_id"])
    for r in rows:
        r["tags"] = q_tags.get(r["id"], [])

    # Fetch real passage titles (id -> title) so quiz cards show proper names
    passage_title_rows = fetch_all(
        sb.table("dsemcq_passages")
        .select("id,title")
    )
    passage_titles: dict[str, str] = {p["id"]: p["title"] for p in passage_title_rows}

    # Load existing quiz IDs for stable upsert (preserves FK references)
    existing = fetch_all(
        sb.table("dsemcq_quizzes")
        .select("id,title,passage_id,type,title_id,cover_image_url")
    )
    existing_id_map: dict[tuple, str] = {}
    for e in existing:
        tid = e.get("title_id")
        # Primary key includes title_id so each quiz instance has a unique stable ID
        existing_id_map[(e.get("passage_id"), e.get("type"), e.get("title"), tid)] = e["id"]
        # Backward compat: old single quizzes stored with title_id=None also map to seq=1
        if tid is None:
            existing_id_map.setdefault(
                (e.get("passage_id"), e.get("type"), e.get("title"), 1), e["id"]
            )
    # quiz_id -> existing cover_image_url (for stable cover preservation)
    existing_cover_map: dict[str, str] = {
        e["id"]: (e.get("cover_image_url") or "")
        for e in existing
    }

    # Discover how many cover images exist in S3 (once per run)
    s3_image_count = _fetch_s3_image_count()

    # Use a time-based seed so each run produces different combinations
    seed = int(time.time() * 1000)
    rng = random.Random(seed)
    log.info("assemble_seed", seed=seed)

    summary: dict[str, int] = {"exercises": 0, "quizzes": 0, "exams": 0, "updated": 0}
    to_upsert: list[dict] = []

    # Assemble each quiz type independently
    for quiz_type in ("exercise", "quiz", "exam"):
        picker = CoverImagePicker(s3_image_count)
        records = _assemble_type(
            quiz_type, rows, existing_id_map, summary, passage_titles,
            picker=picker, existing_cover_map=existing_cover_map,
            rng=rng,
        )
        to_upsert.extend(records)
        log.info(f"assembled_{quiz_type}", count=len(records))

    # ── Normalise title_id: single quiz for a (type, title) combo → None ─────
    # Multiple quizzes keep their seq-based title_ids (1, 2, 3…) already set
    # by _make_record so the frontend can label them "師說 ①", "師說 ②" etc.
    title_groups: dict[tuple, list[dict]] = defaultdict(list)
    for record in to_upsert:
        title_groups[(record["type"], record["title"])].append(record)

    for group in title_groups.values():
        if len(group) == 1:
            group[0]["title_id"] = None   # only one — no numbering needed

    if not dry_run and to_upsert:
        # Batch upserts to avoid PostgREST payload size limits
        BATCH = 50
        for i in range(0, len(to_upsert), BATCH):
            chunk = to_upsert[i : i + BATCH]
            sb.table("dsemcq_quizzes").upsert(chunk, on_conflict="id").execute()
        log.info("quizzes_assembled", total_records=len(to_upsert), **summary)
    else:
        log.info("assemble_dry_run", to_upsert=len(to_upsert), **summary)

    return {
        **summary,
        "total_new": summary["exercises"] + summary["quizzes"] + summary["exams"],
        "dry_run": dry_run,
        "seed": seed,
        "strategies": ["passage_skill"],
    }