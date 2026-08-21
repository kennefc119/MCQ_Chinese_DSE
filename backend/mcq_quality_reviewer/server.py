from __future__ import annotations

import json
import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, model_validator

from config import HOST, PORT
from local_audit import (
    DB_PATH,
    get_audit,
    list_audits,
    mark_pushed,
    mark_rejected,
    audit_history_by_question,
    clear_audit_history,
    pending_audit_ids,
    latest_audits_by_question,
    latest_audit_statuses,
    recover_interrupted_audits,
    summary,
    update_proposal,
)
from runtime_settings import get_runtime_settings, update_runtime_settings
from batch_jobs import get_batch_job, has_active_batch, start_batch_job
from supabase_repository import (
    apply_proposal,
    count_questions,
    fetch_all_questions,
    fetch_question_headers,
    fetch_question_page,
    fetch_questions_by_ids,
)
from workflow import re_audit_question, scan_batch_questions, scan_next_question


HERE = Path(__file__).parent
_workflow_lock = threading.Lock()
_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    recover_interrupted_audits()
    yield


app = FastAPI(title="MCQ Quality Reviewer", lifespan=lifespan)


@app.exception_handler(Exception)
async def api_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    _log.exception("Unhandled reviewer request error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "retryable": True,
            "path": request.url.path,
        },
    )


class SettingsUpdate(BaseModel):
    critic_bot: str = Field(min_length=1)
    corrector_bot: str = Field(min_length=1)
    max_revise_iterations: int = Field(ge=1, le=5)


class ProposalEdit(BaseModel):
    question_stem: str = Field(min_length=1, max_length=2000)
    option_texts: list[str] = Field(min_length=4, max_length=4)
    option_explanations: list[str] = Field(min_length=4, max_length=4)


class BatchScanRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=1000)
    parallel_workers: int = Field(default=4, ge=1, le=100)


class BulkDecisionCriteria(BaseModel):
    status: Literal["pending"] = "pending"
    min_score: int = Field(ge=1, le=10)


class BulkDecisionRequest(BaseModel):
    audit_ids: list[int] | None = Field(default=None, min_length=1, max_length=1000)
    criteria: BulkDecisionCriteria | None = None
    decision: Literal["approve", "reject"]

    @model_validator(mode="after")
    def require_selection(self):
        if self.audit_ids is None and self.criteria is None:
            raise ValueError("audit_ids or criteria is required")
        if self.audit_ids is not None and self.criteria is not None:
            raise ValueError("Use audit_ids or criteria, not both")
        return self


@app.get("/")
def dashboard() -> FileResponse:
    return FileResponse(HERE / "dashboard.html", media_type="text/html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "audit_db": str(DB_PATH), "questions": count_questions()}


@app.get("/api/summary")
def audit_summary() -> dict[str, Any]:
    return {**summary(), "total_questions": count_questions()}


@app.post("/api/audit-history/clear")
def clear_local_audit_history() -> dict[str, Any]:
    if not _workflow_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Cannot clear history during a review operation")
    try:
        if has_active_batch():
            raise HTTPException(status_code=409, detail="Cannot clear history while a batch is running")
        deleted_count = clear_audit_history()
        return {"ok": True, "deleted_count": deleted_count}
    finally:
        _workflow_lock.release()


@app.get("/api/settings")
def reviewer_settings() -> dict[str, Any]:
    return get_runtime_settings()


@app.post("/api/settings")
def save_reviewer_settings(req: SettingsUpdate) -> dict[str, Any]:
    if has_active_batch():
        raise HTTPException(status_code=409, detail="Settings cannot change during a review batch")
    if not _workflow_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Settings cannot change during a scan")
    try:
        updated = update_runtime_settings(
            critic_bot=req.critic_bot,
            corrector_bot=req.corrector_bot,
            max_revise_iterations=req.max_revise_iterations,
        )
        return {"ok": True, "settings": updated}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        _workflow_lock.release()


@app.get("/api/reviews")
def reviews(status: str | None = Query(default=None)) -> list[dict[str, Any]]:
    return list_audits(status)


@app.get("/api/questions")
def question_inventory(status: str | None = Query(default=None)) -> list[dict[str, Any]]:
    """Return exactly one row per question currently in Supabase."""
    latest_by_question = latest_audits_by_question()
    history_by_question = audit_history_by_question()
    inventory: list[dict[str, Any]] = []

    for question in fetch_all_questions():
        question_id = question["question_id"]
        audit = latest_by_question.get(question_id)
        display_status = _display_status(audit)
        if status and not _matches_inventory_filter(display_status, status):
            continue

        audit_original = audit.get("original") if audit else None
        comparison_original = (
            audit_original
            if audit and audit.get("push_status") != "pushed" and audit_original
            else question
        )
        inventory.append({
            "id": audit["id"] if audit else None,
            "audit_id": audit["id"] if audit else None,
            "question_id": question_id,
            "passage_id": question["passage_id"],
            "original": comparison_original,
            "current": question,
            "proposed": audit.get("proposed") if audit else None,
            "audit_status": audit["audit_status"] if audit else "unscanned",
            "display_status": display_status,
            "approval_status": audit["approval_status"] if audit else "not_required",
            "push_status": audit["push_status"] if audit else "not_pushed",
            "original_score": audit.get("original_score") if audit else None,
            "final_score": audit.get("final_score") if audit else None,
            "critic_comments": audit.get("critic_comments") if audit else None,
            "revision_instructions": audit.get("revision_instructions") if audit else None,
            "iterations_done": audit.get("iterations_done", 0) if audit else 0,
            "proposal_edit_count": audit.get("proposal_edit_count", 0) if audit else 0,
            "error_message": audit.get("error_message") if audit else None,
            "scanned_at": audit.get("scanned_at") if audit else None,
            "traces": audit.get("traces") if audit else [],
            "history": history_by_question.get(question_id, []),
        })

    return inventory


@app.get("/api/questions/page")
def question_inventory_page(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=40, ge=10, le=100),
    status: str | None = Query(default=None),
) -> dict[str, Any]:
    """Return one database question chunk with one row per question."""
    latest_for_filter = latest_audit_statuses() if status else {}
    if status:
        candidates = [
            question
            for question in fetch_question_headers()
            if _matches_inventory_filter(
                _display_status(latest_for_filter.get(question["question_id"])),
                status,
            )
        ]
        total = len(candidates)
        selected = candidates[offset:offset + limit]
        page_questions = fetch_questions_by_ids(
            [question["question_id"] for question in selected]
        )
    else:
        total = count_questions()
        page_questions = fetch_question_page(offset, limit)

    question_ids = {question["question_id"] for question in page_questions}
    latest = latest_audits_by_question(question_ids)
    history = audit_history_by_question(question_ids)
    rows = _build_inventory_rows(page_questions, latest, history)
    return {
        "rows": rows,
        "offset": offset,
        "limit": limit,
        "total": total,
        "has_more": offset + len(rows) < total,
    }


def _build_inventory_rows(
    questions: list[dict[str, Any]],
    latest_by_question: dict[str, dict[str, Any]],
    history_by_question: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for question in questions:
        question_id = question["question_id"]
        audit = latest_by_question.get(question_id)
        display_status = _display_status(audit)
        audit_original = audit.get("original") if audit else None
        comparison_original = (
            audit_original
            if audit and audit.get("push_status") != "pushed" and audit_original
            else question
        )
        rows.append({
            "id": audit["id"] if audit else None,
            "audit_id": audit["id"] if audit else None,
            "question_id": question_id,
            "passage_id": question["passage_id"],
            "original": comparison_original,
            "current": question,
            "proposed": audit.get("proposed") if audit else None,
            "audit_status": audit["audit_status"] if audit else "unscanned",
            "display_status": display_status,
            "approval_status": audit["approval_status"] if audit else "not_required",
            "push_status": audit["push_status"] if audit else "not_pushed",
            "original_score": audit.get("original_score") if audit else None,
            "final_score": audit.get("final_score") if audit else None,
            "critic_comments": audit.get("critic_comments") if audit else None,
            "revision_instructions": audit.get("revision_instructions") if audit else None,
            "iterations_done": audit.get("iterations_done", 0) if audit else 0,
            "proposal_edit_count": audit.get("proposal_edit_count", 0) if audit else 0,
            "error_message": audit.get("error_message") if audit else None,
            "scanned_at": audit.get("scanned_at") if audit else None,
            "traces": audit.get("traces") if audit else [],
            "history": history_by_question.get(question_id, []),
        })
    return rows


def _display_status(audit: dict[str, Any] | None) -> str:
    if not audit:
        return "unscanned"
    if audit.get("push_status") == "pushed":
        return "pushed"
    if audit.get("audit_status") == "passed":
        return "passed"
    if audit.get("approval_status") == "pending":
        return "pending"
    if audit.get("audit_status") == "failed":
        return "failed"
    if audit.get("approval_status") == "rejected":
        return "rejected"
    return "unscanned"


def _matches_inventory_filter(display_status: str, status: str) -> bool:
    if status == "unscanned":
        return display_status in {"unscanned", "failed"}
    if status == "audited":
        return display_status in {"passed", "pushed"}
    return display_status == status


@app.post("/api/scan-next")
def scan_next() -> dict[str, Any]:
    if not _workflow_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A scan is already running")
    try:
        if has_active_batch():
            raise HTTPException(status_code=409, detail="A review batch is already running")
        result = scan_next_question()
        return result or {"status": "complete", "message": "No unscanned questions remain"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        _workflow_lock.release()


@app.post("/api/scan-batch", status_code=202)
def scan_batch(req: BatchScanRequest) -> dict[str, Any]:
    if not _workflow_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A scan is already running")
    try:
        try:
            return start_batch_job(req.count, req.parallel_workers)
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    finally:
        _workflow_lock.release()


@app.get("/api/scan-batch/{job_id}")
def scan_batch_status(
    job_id: str,
    since: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    snapshot = get_batch_job(job_id, since=since)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Batch job not found")
    return snapshot


@app.get("/api/reviews/selectable")
def selectable_reviews(
    min_score: int = Query(default=7, ge=1, le=10),
) -> dict[str, Any]:
    audit_ids = pending_audit_ids(min_score)
    return {"status": "pending", "min_score": min_score, "count": len(audit_ids)}


@app.post("/api/reviews/bulk-decision")
def bulk_decision(req: BulkDecisionRequest) -> dict[str, Any]:
    """Apply one decision to selected pending proposals independently."""
    if not _workflow_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another review operation is running")

    audit_ids = (
        pending_audit_ids(req.criteria.min_score)
        if req.criteria is not None
        else list(req.audit_ids or [])
    )
    succeeded: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    try:
        for audit_id in dict.fromkeys(audit_ids):
            audit = get_audit(audit_id)
            if not audit:
                failed.append({"audit_id": audit_id, "error": "Review not found"})
                continue
            if audit["approval_status"] != "pending":
                failed.append({
                    "audit_id": audit_id,
                    "question_id": audit["question_id"],
                    "error": "Review is not pending approval",
                })
                continue

            try:
                if req.decision == "approve":
                    if not audit.get("proposed"):
                        raise ValueError("Review has no stored proposal")
                    apply_proposal(
                        question_id=audit["question_id"],
                        original_hash=audit["original_hash"],
                        proposal=audit["proposed"],
                        score=int(audit["final_score"] or 0),
                    )
                    mark_pushed(audit_id)
                    action = "pushed"
                else:
                    if not mark_rejected(audit_id):
                        raise ValueError("Review could not be rejected")
                    action = "rejected"
                succeeded.append({
                    "audit_id": audit_id,
                    "question_id": audit["question_id"],
                    "action": action,
                })
            except Exception as exc:
                failed.append({
                    "audit_id": audit_id,
                    "question_id": audit["question_id"],
                    "error": str(exc),
                })
    finally:
        _workflow_lock.release()

    return {
        "decision": req.decision,
        "requested_count": len(audit_ids),
        "succeeded_count": len(succeeded),
        "failed_count": len(failed),
        "succeeded": succeeded,
        "failed": failed,
    }


@app.post("/api/reviews/{audit_id}/re-audit")
def re_audit(audit_id: int) -> dict[str, Any]:
    if has_active_batch():
        raise HTTPException(status_code=409, detail="A review batch is already running")
    with _workflow_lock:
        audit = get_audit(audit_id)
        if not audit:
            raise HTTPException(status_code=404, detail="Review not found")
        if audit["audit_status"] == "scanning":
            raise HTTPException(status_code=409, detail="This question is already being audited")
        try:
            result = re_audit_question(audit["question_id"], previous_audit_id=audit_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result


@app.put("/api/reviews/{audit_id}/proposal")
def edit_proposal(audit_id: int, req: ProposalEdit) -> dict[str, Any]:
    if not _workflow_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Cannot edit while another review operation is running")
    try:
        try:
            review = update_proposal(
                audit_id,
                question_stem=req.question_stem,
                option_texts=req.option_texts,
                option_explanations=req.option_explanations,
            )
            if review is None:
                raise HTTPException(status_code=404, detail="Review not found")
            return {"success": True, "review": review}
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        _workflow_lock.release()


@app.post("/api/reviews/{audit_id}/reject")
def reject(audit_id: int) -> dict[str, Any]:
    if not mark_rejected(audit_id):
        raise HTTPException(status_code=409, detail="Review is not pending approval")
    return {"success": True, "audit_id": audit_id}


@app.post("/api/reviews/{audit_id}/approve")
def approve(audit_id: int) -> dict[str, Any]:
    with _workflow_lock:
        audit = get_audit(audit_id)
        if not audit:
            raise HTTPException(status_code=404, detail="Review not found")
        if audit["approval_status"] != "pending" or not audit.get("proposed"):
            raise HTTPException(status_code=409, detail="Review is not pending approval")
        try:
            apply_proposal(
                question_id=audit["question_id"],
                original_hash=audit["original_hash"],
                proposal=audit["proposed"],
                score=int(audit["final_score"] or 0),
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        mark_pushed(audit_id)
    return {"success": True, "audit_id": audit_id, "question_id": audit["question_id"]}


@app.get("/api/export-audit")
def export_audit() -> JSONResponse:
    return JSONResponse(
        content=json.loads(json.dumps(list_audits(), ensure_ascii=False, default=str)),
        headers={"Content-Disposition": "attachment; filename=mcq-quality-audit.json"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host=HOST, port=PORT, reload=True)