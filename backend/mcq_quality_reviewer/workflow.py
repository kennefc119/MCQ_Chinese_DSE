from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import threading
from typing import Any, Callable

import structlog

from config import settings
from local_audit import claim_question, complete_audit, fail_audit, scanned_question_ids
from mcq_gen.db.flagged import FlaggedQuestion
from mcq_gen.db.stats import _DIFFICULTY_MAP, _TAG_TO_SKILL
from mcq_gen.schemas import Difficulty, Draft, DraftOption, Skill, Spec
from proactive_corrector import run_proactive_corrector
from reviewer_critic import run_reviewer_critic
from reviewer_llm import get_traces, reset_traces
from supabase_repository import (
    fetch_next_unscanned,
    fetch_question,
    iter_question_headers,
    question_hash,
)

log = structlog.get_logger(__name__)


def scan_next_question() -> dict[str, Any] | None:
    claimed = _claim_next_question()
    if claimed is None:
        return None
    question, audit_id = claimed
    return _run_audit(question, audit_id)


def scan_batch_questions(
    count: int,
    parallel_workers: int,
    *,
    on_claimed: Callable[[], None] | None = None,
    on_result: Callable[[dict[str, Any]], None] | None = None,
    on_claim_error: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    requested_count = max(1, min(1000, count))
    worker_count = max(1, min(100, parallel_workers))

    def run_claimed(item: tuple[dict[str, Any], int]) -> dict[str, Any]:
        question, audit_id = item
        try:
            return _run_audit(question, audit_id)
        except Exception as exc:
            return {
                "audit_id": audit_id,
                "question_id": question["question_id"],
                "status": "failed",
                "error": str(exc),
            }

    results: list[dict[str, Any]] = []
    results_lock = threading.Lock()
    claimed_count = 0

    def record_result(future) -> None:
        try:
            result = future.result()
        except Exception as exc:
            # A future must never prevent sibling results from being emitted.
            result = {"status": "failed", "error": str(exc)}
        with results_lock:
            results.append(result)
        if on_result:
            try:
                on_result(result)
            except Exception as exc:
                log.error("batch_result_callback_failed", error=str(exc))

    with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="mcq-audit") as executor:
        # Claim and submit one question at a time. The first hydrated question
        # enters the pool immediately; later Supabase claims do not block its
        # LLM call or its completion callback.
        for item in _iter_claimed_questions(
            requested_count,
            on_claim_error=on_claim_error,
        ):
            claimed_count += 1
            if on_claimed:
                on_claimed()
            future = executor.submit(run_claimed, item)
            future.add_done_callback(record_result)

    return {
        "requested_count": requested_count,
        "claimed_count": claimed_count,
        "completed_count": len(results),
        "failed_count": sum(result.get("status") == "failed" for result in results),
        "parallel_workers": worker_count,
        "total_tokens": sum(int(result.get("total_tokens") or 0) for result in results),
        "results": results,
    }


def _claim_next_question() -> tuple[dict[str, Any], int] | None:
    excluded_ids = scanned_question_ids()
    while True:
        question = fetch_next_unscanned(excluded_ids)
        if question is None:
            return None
        audit_id = claim_question(question, question_hash(question))
        if audit_id is not None:
            return question, audit_id
        excluded_ids.add(question["question_id"])


def _iter_claimed_questions(
    max_count: int,
    *,
    on_claim_error: Callable[[dict[str, Any]], None] | None = None,
):
    """Yield claimed questions without repeating the full Supabase scan."""
    excluded_ids = scanned_question_ids()
    claimed_count = 0
    try:
        for header in iter_question_headers():
            if claimed_count >= max_count:
                return
            question_id = header["question_id"]
            if question_id in excluded_ids:
                continue

            try:
                question = fetch_question(question_id)
                if question is None:
                    excluded_ids.add(question_id)
                    continue
                audit_id = claim_question(question, question_hash(question))
            except Exception as exc:
                excluded_ids.add(question_id)
                if on_claim_error:
                    on_claim_error({
                        "phase": "question_claim",
                        "question_id": question_id,
                        "error": str(exc),
                    })
                continue
            if audit_id is None:
                excluded_ids.add(question_id)
                continue

            excluded_ids.add(question_id)
            claimed_count += 1
            yield question, audit_id
    except Exception as exc:
        if on_claim_error:
            on_claim_error({
                "phase": "question_headers",
                "error": str(exc),
            })


def re_audit_question(question_id: str, previous_audit_id: int | None = None) -> dict[str, Any]:
    question = fetch_question(question_id)
    if question is None:
        raise ValueError("Question no longer exists in Supabase")

    audit_id = claim_question(
        question,
        question_hash(question),
        re_audit_of=previous_audit_id,
    )
    if audit_id is None:
        raise RuntimeError("This question is already being audited")
    return _run_audit(question, audit_id)


def _run_audit(question: dict[str, Any], audit_id: int) -> dict[str, Any]:
    correction_iterations = 0
    reset_traces()
    try:
        spec = _build_spec(question)
        original_draft = _build_draft(question, spec)
        original_critique = _run_traced(
            lambda: run_reviewer_critic(
                spec=spec,
                draft=original_draft,
                question_id=question["question_id"],
                is_correction=True,
            ),
            workflow_agent="critic",
            workflow_iteration=0,
            phase="initial_audit",
        )

        if original_critique.score >= 7:
            traces = get_traces()
            complete_audit(
                audit_id,
                audit_status="passed",
                approval_status="not_required",
                original_score=original_critique.score,
                final_score=original_critique.score,
                critic_comments=original_critique.comments,
                revision_instructions=original_critique.revision_instructions,
                proposed=None,
                traces=traces,
                total_tokens=_total_tokens(traces),
                iterations_done=0,
            )
            return {
                "audit_id": audit_id,
                "question_id": question["question_id"],
                "status": "passed",
                "iterations": 0,
                "llm_runs": len(traces),
                "total_tokens": _total_tokens(traces),
            }

        current_draft = original_draft
        current_critique = original_critique
        for iteration in range(1, settings.max_revise_iterations + 1):
            correction_iterations = iteration
            proactive_findings = (
                "主動題庫審核發現："
                f"{current_critique.comments}\n修改指示：{current_critique.revision_instructions}"
            )
            flagged = _as_corrector_input(question, current_draft, proactive_findings)
            current_draft = _run_traced(
                lambda: run_proactive_corrector(flagged, spec, iteration=iteration - 1),
                workflow_agent="corrector",
                workflow_iteration=iteration,
                phase="correction",
            )
            current_critique = _run_traced(
                lambda: run_reviewer_critic(
                    spec=spec,
                    draft=current_draft,
                    iteration=iteration - 1,
                    question_id=question["question_id"],
                    is_correction=True,
                ),
                workflow_agent="critic",
                workflow_iteration=iteration,
                phase="correction",
            )
            if current_critique.score >= 7:
                break

        traces = get_traces()
        proposal = {
            "question_stem": current_draft.question_stem,
            "options": [option.model_dump() for option in current_draft.options],
            "mapped_spec": current_draft.mapped_spec.model_dump(mode="json"),
        }
        complete_audit(
            audit_id,
            audit_status="correction_proposed",
            approval_status="pending",
            original_score=original_critique.score,
            final_score=current_critique.score,
            critic_comments=current_critique.comments,
            revision_instructions=current_critique.revision_instructions,
            proposed=proposal,
            traces=traces,
            total_tokens=_total_tokens(traces),
            iterations_done=correction_iterations,
        )
        return {
            "audit_id": audit_id,
            "question_id": question["question_id"],
            "status": "correction_proposed",
            "score": current_critique.score,
            "iterations": correction_iterations,
            "llm_runs": len(traces),
            "total_tokens": _total_tokens(traces),
        }
    except Exception as exc:
        traces = get_traces()
        fail_audit(
            audit_id,
            str(exc),
            traces=traces,
            total_tokens=_total_tokens(traces),
            iterations_done=correction_iterations,
        )
        raise


def _run_traced(
    call: Any,
    *,
    workflow_agent: str,
    workflow_iteration: int,
    phase: str,
) -> Any:
    trace_start = len(get_traces())
    try:
        return call()
    finally:
        traces = get_traces()
        for trace in traces[trace_start:]:
            trace.update({
                "workflow_agent": workflow_agent,
                "workflow_iteration": workflow_iteration,
                "phase": phase,
            })


def _build_spec(question: dict[str, Any]) -> Spec:
    difficulty = _DIFFICULTY_MAP.get(question["difficulty"], Difficulty.MEDIUM)
    skill = Skill.COMPREHENSION
    for tag_id in question["tags"]:
        mapped = _TAG_TO_SKILL.get(tag_id)
        if mapped:
            skill = mapped
            break
    return Spec(
        passage=question["passage_id"],
        cross_passage=question.get("cross_passage_id"),
        difficulty=difficulty,
        skill_tested=skill,
        special_notes="",
        reasoning="主動題庫品質審核",
    )


def _build_draft(question: dict[str, Any], spec: Spec) -> Draft:
    return Draft(
        question_stem=question["stem"],
        options=[
            DraftOption(
                text=option.get("text", ""),
                is_correct=bool(option.get("is_correct")),
                explanation=option.get("explanation", ""),
            )
            for option in question["options"]
        ],
        mapped_spec=spec,
    )


def _as_corrector_input(
    question: dict[str, Any],
    draft: Draft,
    findings: str,
) -> FlaggedQuestion:
    return FlaggedQuestion(
        question_id=question["question_id"],
        passage_id=question["passage_id"],
        cross_passage_id=question.get("cross_passage_id"),
        stem=draft.question_stem,
        difficulty=question["difficulty"],
        source=question["source"],
        is_active=question["is_active"],
        critique_score=question.get("critique_score"),
        user_flag_count=1,
        user_flag_comments=findings,
        options=[option.model_dump() for option in draft.options],
        tags=question["tags"],
    )


def _total_tokens(traces: list[dict[str, Any]]) -> int:
    return sum(int(trace.get("total_tokens") or 0) for trace in traces)