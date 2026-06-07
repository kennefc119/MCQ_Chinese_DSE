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
from .graph import run_correction_pipeline, run_pipeline
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


class CorrectRequest(BaseModel):
    question_id: str | None = None  # None = correct all flagged questions
    dry_run: bool = True


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
    from .db.client import fetch_all, get_supabase
    from .db.stats import _DIFFICULTY_MAP, _TAG_TO_SKILL
    from collections import defaultdict

    sb = get_supabase()

    # 1. Passages (for labels)
    passage_rows = fetch_all(
        sb.table("dsemcq_passages").select("id,title")
    )
    passage_label: dict[str, str] = {r["id"]: r.get("title", r["id"]) for r in passage_rows}

    # 2. All questions + active flag
    q_rows = fetch_all(
        sb.table("dsemcq_questions")
        .select("id,passage_id,difficulty,is_active")
    )

    # 3. Question → skill tags
    tag_rows = fetch_all(
        sb.table("dsemcq_question_tags").select("question_id,tag_id")
    )
    q_tags: dict[str, list[str]] = defaultdict(list)
    for t in tag_rows:
        q_tags[t["question_id"]].append(t["tag_id"])

    # 4. Published quizzes (type + passage_id)
    quiz_rows = fetch_all(
        sb.table("dsemcq_quizzes")
        .select("id,type,passage_id,is_published")
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
    per (passage, skill) group counts per pool, and how many quiz instances
    each group would produce.  Does NOT write to the database.
    """
    from .db.client import fetch_all, get_supabase
    from .quiz_assembler import (
        EXERCISE_MIN_SCORE, EXERCISE_Q,
        QUIZ_MIN_SCORE, QUIZ_Q,
        EXAM_MIN_SCORE, EXAM_Q,
        TAG_LABEL, _KEEP_RATIO,
        _passage_label,
    )
    from collections import defaultdict

    sb = get_supabase()
    rows = fetch_all(
        sb.table("dsemcq_questions")
        .select("id,passage_id,difficulty,critique_score,is_active")
    )
    tag_rows = fetch_all(
        sb.table("dsemcq_question_tags")
        .select("question_id,tag_id")
    )

    # Build question → tags map
    q_tags: dict[str, list[str]] = defaultdict(list)
    for t in tag_rows:
        q_tags[t["question_id"]].append(t["tag_id"])

    total = len(rows)
    active = [r for r in rows if r.get("is_active")]
    inactive = total - len(active)

    def _score(r):
        return r.get("critique_score") or 7

    def _pools_by_group(min_score):
        """Group eligible active questions by (passage_id, tag_id)."""
        groups: dict[tuple[str, str], list[str]] = defaultdict(list)
        for r in active:
            if _score(r) >= min_score:
                pid = r.get("passage_id") or "unknown"
                for tag in q_tags.get(r["id"], []):
                    groups[(pid, tag)].append(r["id"])
        return groups

    ex_groups   = _pools_by_group(EXERCISE_MIN_SCORE)
    quiz_groups = _pools_by_group(QUIZ_MIN_SCORE)
    exam_groups = _pools_by_group(EXAM_MIN_SCORE)

    # Per (passage, skill) summary
    all_keys = sorted(set(
        list(ex_groups.keys()) + list(quiz_groups.keys()) + list(exam_groups.keys())
    ))
    groups_summary = []
    for (pid, tag_id) in all_keys:
        ec = len(ex_groups.get((pid, tag_id), []))
        qc = len(quiz_groups.get((pid, tag_id), []))
        xc = len(exam_groups.get((pid, tag_id), []))
        skill_label = TAG_LABEL.get(tag_id, tag_id)
        # After filtering: exercise keeps 50%, quiz keeps 75%, exam keeps 100%
        ex_after = max(1, round(ec * _KEEP_RATIO["exercise"])) if ec else 0
        qz_after = max(1, round(qc * _KEEP_RATIO["quiz"])) if qc else 0
        groups_summary.append({
            "passage_id": pid,
            "label": _passage_label(pid),
            "skill": skill_label,
            "exercise_pool": ec,
            "exercise_after_filter": ex_after,
            "exercise_instances": ex_after // EXERCISE_Q,
            "quiz_pool": qc,
            "quiz_after_filter": qz_after,
            "quiz_instances": qz_after // QUIZ_Q,
            "exam_pool": xc,
            "exam_instances": xc // EXAM_Q,
        })

    score_dist: dict[str, int] = {}
    for r in active:
        s = str(_score(r))
        score_dist[s] = score_dist.get(s, 0) + 1

    return {
        "total_questions": total,
        "active_questions": len(active),
        "inactive_questions": inactive,
        "score_distribution": dict(sorted(score_dist.items())),
        "groups": groups_summary,
        "thresholds": {
            "exercise": f"≥{EXERCISE_Q} questions with score≥{EXERCISE_MIN_SCORE} per (passage,skill), keep 50%",
            "quiz":     f"≥{QUIZ_Q} questions with score≥{QUIZ_MIN_SCORE} per (passage,skill), keep 75%",
            "exam":     f"≥{EXAM_Q} questions with score≥{EXAM_MIN_SCORE} per (passage,skill), no filter",
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


# ─── Correction Workflow ──────────────────────────────────────────────────────


@app.get("/api/flagged")
def list_flagged() -> list[dict[str, Any]]:
    """Return all questions flagged by users (user_flag_count > 0)."""
    from .db.flagged import fetch_flagged_questions

    flagged = fetch_flagged_questions()
    return [
        {
            "question_id": fq.question_id,
            "passage_id": fq.passage_id,
            "stem": fq.stem,
            "difficulty": fq.difficulty,
            "is_active": fq.is_active,
            "critique_score": fq.critique_score,
            "user_flag_count": fq.user_flag_count,
            "user_flag_comments": fq.user_flag_comments,
            "options": fq.options,
            "tags": fq.tags,
        }
        for fq in flagged
    ]


@app.post("/api/correct")
def correct(req: CorrectRequest) -> dict[str, Any]:
    """
    Run the correction workflow for flagged questions.
    Processes each flagged question through Corrector → Critic loop.
    Each result includes per-question LLM traces for dashboard display.
    """
    log.info(
        "correct_start",
        question_id=req.question_id,
        dry_run=req.dry_run,
    )

    try:
        results = run_correction_pipeline(
            question_id=req.question_id,
            dry_run=req.dry_run,
        )
    except Exception as exc:
        log.error("correct_error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Aggregate total tokens across all questions
    total_tokens = sum(r.get("total_tokens", 0) for r in results)

    return {
        "results": results,
        "total_tokens": total_tokens,
    }


# ─── Runtime Settings ────────────────────────────────────────────────────────


class SettingsUpdate(BaseModel):
    poe_bot_name: str | None = None
    poe_bot_strategist: str | None = None
    poe_bot_drafter: str | None = None
    poe_bot_critic: str | None = None
    poe_bot_corrector: str | None = None
    max_revise_iterations: int | None = None
    sleep_between_cycles_seconds: float | None = None
    default_source_tag: str | None = None


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    """Return current runtime settings (no secrets exposed)."""
    from .config import settings as cfg
    return {
        "poe_bot_name": cfg.poe_bot_name,
        "poe_bot_strategist": cfg.poe_bot_strategist or "",
        "poe_bot_drafter": cfg.poe_bot_drafter or "",
        "poe_bot_critic": cfg.poe_bot_critic or "",
        "poe_bot_corrector": cfg.poe_bot_corrector or "",
        "resolved_bots": {
            "strategist": cfg.strategist_bot,
            "drafter": cfg.drafter_bot,
            "critic": cfg.critic_bot,
            "corrector": cfg.corrector_bot,
        },
        "max_revise_iterations": cfg.max_revise_iterations,
        "sleep_between_cycles_seconds": cfg.sleep_between_cycles_seconds,
        "default_source_tag": cfg.default_source_tag,
        "max_cycles_per_run": cfg.max_cycles_per_run,
    }


@app.post("/api/settings")
def update_settings(req: SettingsUpdate) -> dict[str, Any]:
    """
    Update runtime settings AND persist to .env file.
    Changes survive server restarts.
    """
    from .config import settings as cfg

    changed: list[str] = []

    if req.poe_bot_name is not None and req.poe_bot_name.strip():
        cfg.poe_bot_name = req.poe_bot_name.strip()
        changed.append("poe_bot_name")

    # For per-role bots, empty string means "use default fallback"
    if req.poe_bot_strategist is not None:
        cfg.poe_bot_strategist = req.poe_bot_strategist.strip() or None
        changed.append("poe_bot_strategist")

    if req.poe_bot_drafter is not None:
        cfg.poe_bot_drafter = req.poe_bot_drafter.strip() or None
        changed.append("poe_bot_drafter")

    if req.poe_bot_critic is not None:
        cfg.poe_bot_critic = req.poe_bot_critic.strip() or None
        changed.append("poe_bot_critic")

    if req.poe_bot_corrector is not None:
        cfg.poe_bot_corrector = req.poe_bot_corrector.strip() or None
        changed.append("poe_bot_corrector")

    if req.max_revise_iterations is not None:
        val = max(1, min(5, req.max_revise_iterations))
        cfg.max_revise_iterations = val
        changed.append("max_revise_iterations")

    if req.sleep_between_cycles_seconds is not None:
        cfg.sleep_between_cycles_seconds = max(0.0, req.sleep_between_cycles_seconds)
        changed.append("sleep_between_cycles_seconds")

    if req.default_source_tag is not None and req.default_source_tag.strip():
        cfg.default_source_tag = req.default_source_tag.strip()
        changed.append("default_source_tag")

    # Persist to .env file
    if changed:
        _persist_settings_to_env(cfg)

    log.info("settings_updated", changed=changed, persisted=bool(changed))

    return {
        "ok": True,
        "changed": changed,
        "settings": get_settings(),
    }


def _persist_settings_to_env(cfg) -> None:
    """Write current settings back to .env, preserving comments and secrets."""
    from .config import _HERE

    env_path = _HERE / ".env"
    if not env_path.exists():
        return

    lines = env_path.read_text(encoding="utf-8").splitlines()

    # Map of ENV_VAR_NAME → new value (only non-secret settings)
    updates: dict[str, str] = {
        "POE_BOT_NAME": cfg.poe_bot_name,
        "POE_BOT_STRATEGIST": cfg.poe_bot_strategist or "",
        "POE_BOT_DRAFTER": cfg.poe_bot_drafter or "",
        "POE_BOT_CRITIC": cfg.poe_bot_critic or "",
        "POE_BOT_CORRECTOR": cfg.poe_bot_corrector or "",
        "MAX_REVISE_ITERATIONS": str(cfg.max_revise_iterations),
        "SLEEP_BETWEEN_CYCLES_SECONDS": str(cfg.sleep_between_cycles_seconds),
        "DEFAULT_SOURCE_TAG": cfg.default_source_tag,
    }

    seen: set[str] = set()
    new_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        # Skip empty or comment lines — keep as-is
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue

        # Parse KEY=VALUE
        if "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                value = updates[key]
                # If value is empty, comment out the line
                if value:
                    new_lines.append(f"{key}={value}")
                else:
                    new_lines.append(f"# {key}=")
                seen.add(key)
                continue

        new_lines.append(line)

    # Append any new keys not already in the file
    for key, value in updates.items():
        if key not in seen and value:
            new_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


# ─── Entry point ──────────────────────────────────────────────────────────────


def start_server(port: int = 8765, reload: bool = False) -> None:
    uvicorn.run(
        "mcq_gen.server:app",
        host="127.0.0.1",
        port=port,
        reload=reload,
        log_level="info",
    )
