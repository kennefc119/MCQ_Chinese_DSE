"""
本地 FastAPI dashboard server。

啟動方式：
    mcq-gen serve          # 預設 port 8765
    mcq-gen serve --port 9000 --reload
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

_PASSAGES_FILE = Path(__file__).parent.parent / "data" / "passages.json"


# ─── Request / Response models ────────────────────────────────────────────────


class GenerateRequest(BaseModel):
    passage_id: str | None = None
    dry_run: bool = True
    count: int = 1   # 1–20 questions per batch


class AssembleRequest(BaseModel):
    dry_run: bool = True
    strategies: list[str] = ["passage", "skill", "difficulty"]


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/api/passages")
def list_passages() -> list[dict[str, Any]]:
    """Return all cached passages (run `mcq-gen fetch-passages` first)."""
    if not _PASSAGES_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="passages.json 不存在 — 請先執行 `mcq-gen fetch-passages`",
        )
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


@app.get("/api/stats")
def get_stats() -> dict[str, Any]:
    """Return current DB question distribution stats."""
    stats = fetch_db_stats()
    return stats.model_dump()


@app.post("/api/generate")
def generate(req: GenerateRequest) -> dict[str, Any]:
    """
    Run N pipeline cycles (1–20 questions).
    Returns all saved questions + full LLM call traces for each.
    """
    count = max(1, min(20, req.count))
    reset_traces()
    log.info("generate_start", passage=req.passage_id, dry_run=req.dry_run, count=count)

    try:
        results = run_pipeline(count=count, passage=req.passage_id, dry_run=req.dry_run)
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
