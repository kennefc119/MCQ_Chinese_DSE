"""
本地 FastAPI dashboard server。

啟動方式：
    mcq-gen serve          # 預設 port 8765
    mcq-gen serve --port 9000 --reload
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from .db.stats import fetch_db_stats
from .graph import run_pipeline
from .llm import get_traces, reset_traces
from .quiz_assembler import assemble_quizzes

log = structlog.get_logger(__name__)

app = FastAPI(title="MCQ Generator API", version="1.0")

# Allow file:// origin (HTML opened directly from filesystem)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Shared-secret middleware (for /api/* called from the mobile app via the
#     dsemcq-mcq-proxy Edge Function). When MCQ_ADMIN_SECRET is set in the
#     environment, every /api/* request must carry a matching X-Admin-Secret
#     header. Requests without the env var (local dashboard use) are unaffected.
# ────────────────────────────────────────────────────────────────────────────
_ADMIN_SECRET = os.getenv("MCQ_ADMIN_SECRET", "").strip()


@app.middleware("http")
async def admin_secret_guard(request: Request, call_next):
    # Only guard JSON API routes; leave dashboard / static fetches open
    if _ADMIN_SECRET and request.url.path.startswith("/api/"):
        provided = request.headers.get("x-admin-secret", "")
        # Allow CORS preflight through without the secret
        if request.method != "OPTIONS" and provided != _ADMIN_SECRET:
            return JSONResponse({"detail": "forbidden"}, status_code=403)
    return await call_next(request)


_PASSAGES_FILE = Path(__file__).parent.parent / "data" / "passages.json"
_DASHBOARD_FILE = Path(__file__).parent.parent / "dashboard.html"


# ─── Root: serve dashboard ───────────────────────────────────────────────────


@app.get("/", response_class=HTMLResponse)
def serve_dashboard() -> HTMLResponse:
    """Serve the MCQ Generator dashboard HTML."""
    if not _DASHBOARD_FILE.exists():
        raise HTTPException(status_code=404, detail="dashboard.html not found")
    return HTMLResponse(content=_DASHBOARD_FILE.read_text(encoding="utf-8"))


# ─── Request / Response models ────────────────────────────────────────────────


class GenerateRequest(BaseModel):
    passage_id: str | None = None
    forced_difficulty: int | None = None   # 1-5; None = 讓策略師自行決定
    forced_skill: str | None = None        # Skill enum 字串（如「修辭手法」）；None = 自行決定
    dry_run: bool = True
    count: int = 1   # 1–20 questions per batch


class AssembleRequest(BaseModel):
    dry_run: bool = True
    strategies: list[str] = ["passage", "skill", "difficulty"]


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/api/skills")
def list_skills() -> list[dict[str, str]]:
    """Return all available 考核能力 (skill) options for the dashboard."""
    from .schemas import Skill
    return [{"value": s.value, "label": s.value} for s in Skill]


@app.get("/api/passages")
def list_passages() -> list[dict[str, Any]]:
    """Return passages from Supabase dsemcq_passages (source of truth)."""
    from .db.client import get_supabase
    sb = get_supabase()
    try:
        resp = (
            sb.table("dsemcq_passages")
            .select("id,title,author,dynasty")
            .order("id")
            .execute()
        )
        rows = resp.data or []
        return [
            {
                "id": r.get("id", ""),
                "title": r.get("title", r.get("id", "")),
                "author": r.get("author", ""),
                "dynasty": r.get("dynasty", ""),
            }
            for r in rows
        ]
    except Exception as exc:
        # Fallback to local cache if Supabase is unavailable
        if _PASSAGES_FILE.exists():
            passages: dict[str, Any] = json.loads(_PASSAGES_FILE.read_text(encoding="utf-8"))
            return [
                {
                    "id": k,
                    "title": v.get("title", k),
                    "author": v.get("author", ""),
                    "dynasty": v.get("dynasty", ""),
                }
                for k, v in passages.items()
            ]
        raise HTTPException(
            status_code=503,
            detail=f"無法連接 Supabase: {exc}",
        ) from exc


@app.get("/api/stats")
def get_stats() -> dict[str, Any]:
    """Return current DB question distribution stats."""
    stats = fetch_db_stats()
    return stats.model_dump()


@app.get("/api/breakdown")
def get_breakdown() -> dict[str, Any]:
    """
    Return a per-passage breakdown suitable for the 題庫總覽 tab:
      • questions.total / active / by_skill / by_difficulty  (active questions only)
      • quizzes.exercise / quiz / exam                       (published quizzes by type)
    Also includes a special 'cross_passage' bucket for questions without a passage.
    """
    from .db.client import get_supabase
    from .db.stats import _DIFFICULTY_MAP, _TAG_TO_SKILL
    from collections import defaultdict

    sb = get_supabase()

    # 1. Passages (for labels)
    passage_rows = (
        sb.table("dsemcq_passages").select("id,title").execute().data or []
    )
    passage_label: dict[str, str] = {r["id"]: r.get("title", r["id"]) for r in passage_rows}

    # 2. All questions + active flag
    q_rows = (
        sb.table("dsemcq_questions")
        .select("id,passage_id,difficulty,is_active")
        .execute()
        .data or []
    )

    # 3. Question → skill tags
    tag_rows = (
        sb.table("dsemcq_question_tags").select("question_id,tag_id").execute().data or []
    )
    q_tags: dict[str, list[str]] = defaultdict(list)
    for t in tag_rows:
        q_tags[t["question_id"]].append(t["tag_id"])

    # 4. Published quizzes (type + passage_id)
    quiz_rows = (
        sb.table("dsemcq_quizzes")
        .select("id,type,passage_id,is_published")
        .execute()
        .data or []
    )

    # Aggregate questions per passage
    PassageBucket = lambda: {
        "total": 0, "active": 0,
        "by_skill": defaultdict(int),
        "by_difficulty": {"最淺": 0, "淺": 0, "中": 0, "深": 0, "最深": 0},
    }
    q_buckets: dict[str, Any] = defaultdict(PassageBucket)

    for q in q_rows:
        pid = q.get("passage_id") or "__cross__"
        b = q_buckets[pid]
        b["total"] += 1
        active = q.get("is_active", True)
        if not active:
            continue
        b["active"] += 1
        diff_label = _DIFFICULTY_MAP.get(q.get("difficulty") or 2, None)
        if diff_label:
            b["by_difficulty"][diff_label.value] = b["by_difficulty"].get(diff_label.value, 0) + 1
        for tag_id in q_tags.get(q["id"], []):
            skill = _TAG_TO_SKILL.get(tag_id)
            if skill:
                b["by_skill"][skill.value] += 1

    # Aggregate quizzes per passage
    # quiz_counts[passage_id][type] = count
    quiz_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"exercise": 0, "quiz": 0, "exam": 0})
    for qz in quiz_rows:
        pid = qz.get("passage_id") or "__cross__"
        qtype = qz.get("type", "")
        if qtype in quiz_counts[pid]:
            quiz_counts[pid][qtype] += 1

    # Build result list — all known passages first, then any extra from q_buckets
    seen_pids: set[str] = set()
    result_passages = []

    ordered_pids = [r["id"] for r in passage_rows] + [
        pid for pid in q_buckets if pid not in {r["id"] for r in passage_rows} and pid != "__cross__"
    ]

    for pid in ordered_pids:
        seen_pids.add(pid)
        b = q_buckets.get(pid, PassageBucket())
        result_passages.append({
            "passage_id": pid,
            "passage_title": passage_label.get(pid, pid),
            "questions": {
                "total": b["total"],
                "active": b["active"],
                "by_skill": dict(b["by_skill"]),
                "by_difficulty": b["by_difficulty"],
            },
            "quizzes": quiz_counts.get(pid, {"exercise": 0, "quiz": 0, "exam": 0}),
        })

    # Cross-passage bucket
    cb = q_buckets.get("__cross__", PassageBucket())
    cross = {
        "questions": {
            "total": cb["total"],
            "active": cb["active"],
            "by_skill": dict(cb["by_skill"]),
            "by_difficulty": cb["by_difficulty"],
        },
        "quizzes": quiz_counts.get("__cross__", {"exercise": 0, "quiz": 0, "exam": 0}),
    }

    return {"passages": result_passages, "cross_passage": cross}


@app.post("/api/generate")
def generate(req: GenerateRequest) -> dict[str, Any]:
    """
    Run N pipeline cycles (1–20 questions).
    Returns all saved questions + full LLM call traces for each.
    """
    count = max(1, min(100, req.count))
    reset_traces()
    log.info("generate_start", passage=req.passage_id, dry_run=req.dry_run, count=count)

    try:
        results = run_pipeline(
            count=count,
            passage=req.passage_id,
            difficulty=req.forced_difficulty,
            skill=req.forced_skill,
            dry_run=req.dry_run,
        )
    except Exception as exc:
        log.error("generate_error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    traces = get_traces()
    total_tokens = sum(t.get("total_tokens", 0) for t in traces)

    if not results:
        raise HTTPException(status_code=500, detail="Pipeline 未產生任何結果")

    return {
        "questions": [q.model_dump() for q in results],
        "traces": traces,
        "total_tokens": total_tokens,
    }


@app.get("/api/assemble-preview")
def assemble_preview() -> dict[str, Any]:
    """
    Show a dry-run breakdown of what the assembler sees:
    total active questions, per-passage counts per pool, and what would be assembled.
    Does NOT write to the database.
    """
    from .db.client import get_supabase
    from .quiz_assembler import (
        EXERCISE_MIN_SCORE, EXERCISE_Q,
        QUIZ_MIN_SCORE, QUIZ_Q,
        EXAM_MIN_SCORE, EXAM_Q,
        _passage_label,
    )
    from collections import defaultdict

    sb = get_supabase()
    rows = (
        sb.table("dsemcq_questions")
        .select("id,passage_id,difficulty,critique_score,is_active")
        .execute()
        .data or []
    )

    total = len(rows)
    active = [r for r in rows if r.get("is_active")]
    inactive = total - len(active)

    def _score(r):
        return r.get("critique_score") or 7  # NULL treated as 7

    def _pool(min_score):
        p = defaultdict(list)
        for r in active:
            if _score(r) >= min_score:
                pid = r.get("passage_id") or "unknown"
                p[pid].append(r["id"])
        return p

    ex_pool   = _pool(EXERCISE_MIN_SCORE)
    quiz_pool = _pool(QUIZ_MIN_SCORE)
    exam_pool = _pool(EXAM_MIN_SCORE)

    # Per-passage summary
    all_pids = sorted(set(
        list(ex_pool.keys()) + list(quiz_pool.keys()) + list(exam_pool.keys())
    ))
    passages = []
    for pid in all_pids:
        ec = len(ex_pool.get(pid, []))
        qc = len(quiz_pool.get(pid, []))
        xc = len(exam_pool.get(pid, []))
        passages.append({
            "passage_id": pid,
            "label": _passage_label(pid),
            f"exercise_pool (need {EXERCISE_Q})": ec,
            f"quiz_pool (need {QUIZ_Q})": qc,
            f"exam_pool (need 5)": xc,
            "would_make_exercise": ec >= EXERCISE_Q,
            "would_make_quiz": qc >= QUIZ_Q,
        })

    exam_eligible = [pid for pid, qids in exam_pool.items() if len(qids) >= 5]
    would_make_exam = len(exam_eligible) >= 3

    score_dist: dict[str, int] = {}
    for r in active:
        s = str(_score(r))
        score_dist[s] = score_dist.get(s, 0) + 1

    return {
        "total_questions": total,
        "active_questions": len(active),
        "inactive_questions": inactive,
        "score_distribution": dict(sorted(score_dist.items())),
        "passages": passages,
        "would_make_exam": would_make_exam,
        "exam_eligible_passages": exam_eligible,
        "thresholds": {
            "exercise": f"≥{EXERCISE_Q} questions with score≥{EXERCISE_MIN_SCORE} per passage",
            "quiz":     f"≥{QUIZ_Q} questions with score≥{QUIZ_MIN_SCORE} per passage",
            "exam":     f"≥3 passages each with ≥5 questions at score≥{EXAM_MIN_SCORE}",
        },
    }


@app.get("/api/db-check")
def db_check() -> dict[str, Any]:
    """
    Diagnose Supabase table status: existence, row counts, active question count.
    Returns per-table status so the dashboard can show clear guidance.
    """
    from .db.client import get_supabase
    sb = get_supabase()
    result: dict[str, Any] = {}

    tables = [
        ("dsemcq_questions", "questions"),
        ("dsemcq_quizzes",   "quizzes"),
        ("dsemcq_passages",  "passages"),
    ]
    for table, key in tables:
        try:
            resp = sb.table(table).select("id", count="exact").limit(1).execute()
            count = resp.count if resp.count is not None else len(resp.data or [])
            result[key] = {"exists": True, "count": count}
        except Exception as exc:
            result[key] = {"exists": False, "error": str(exc)}

    # Active question count specifically (needed for assembler)
    try:
        resp = sb.table("dsemcq_questions").select("id", count="exact").eq("is_active", True).limit(1).execute()
        active = resp.count if resp.count is not None else len(resp.data or [])
        result["active_questions"] = active
    except Exception:
        result["active_questions"] = 0

    return result


@app.post("/api/dismiss-all-quizzes")
def dismiss_all_quizzes() -> dict[str, Any]:
    """
    Hard-delete ALL rows from dsemcq_quizzes.
    Use this to wipe the assembled quiz pool so a fresh assemble run starts clean.
    """
    from .db.client import get_supabase
    sb = get_supabase()
    try:
        count_resp = (
            sb.table("dsemcq_quizzes")
            .select("id", count="exact")
            .limit(1)
            .execute()
        )
        count = count_resp.count or 0
        sb.table("dsemcq_quizzes").delete().neq("id", "").execute()
        log.info("dismissed_all_quizzes", deleted=count)
        return {"deleted": count, "message": f"已刪除 {count} 條組卷記錄"}
    except Exception as exc:
        log.error("dismiss_all_error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/assemble")
def assemble(req: AssembleRequest) -> dict[str, Any]:
    """
    Auto-assemble quizzes/exams/exercises from all active questions.
    Applies passage-grouping rules and creates dsemcq_quizzes rows.
    """
    log.info("assemble_start", dry_run=req.dry_run)
    try:
        summary = assemble_quizzes(dry_run=req.dry_run, strategies=req.strategies)
    except Exception as exc:
        log.error("assemble_error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return summary


# ─── Entry point ──────────────────────────────────────────────────────────────


def start_server(port: int = 8765, reload: bool = False) -> None:
    uvicorn.run(
        "mcq_gen.server:app",
        host="127.0.0.1",
        port=port,
        reload=reload,
        log_level="info",
    )
