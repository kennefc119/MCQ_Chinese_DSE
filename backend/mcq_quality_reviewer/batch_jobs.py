from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from workflow import scan_batch_questions


@dataclass
class BatchJob:
    job_id: str
    requested_count: int
    parallel_workers: int
    status: str = "running"
    claimed_count: int = 0
    results: list[dict[str, Any]] = field(default_factory=list)
    claim_errors: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: str | None = None
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def mark_claimed(self) -> None:
        with self.lock:
            self.claimed_count += 1

    def add_result(self, result: dict[str, Any]) -> None:
        with self.lock:
            self.results.append(result)

    def add_claim_error(self, error: dict[str, Any]) -> None:
        with self.lock:
            self.claim_errors.append(error)

    def finish(self, summary: dict[str, Any]) -> None:
        with self.lock:
            self.status = "completed_with_errors" if self.claim_errors else "completed"
            self.claimed_count = int(summary.get("claimed_count", self.claimed_count))
            self.completed_at = datetime.now(timezone.utc).isoformat()

    def fail(self, error: str) -> None:
        with self.lock:
            self.status = "completed_with_errors"
            self.error = error
            self.completed_at = datetime.now(timezone.utc).isoformat()

    def snapshot(self, since: int = 0) -> dict[str, Any]:
        with self.lock:
            results = self.results[since:]
            return {
                "job_id": self.job_id,
                "status": self.status,
                "requested_count": self.requested_count,
                "parallel_workers": self.parallel_workers,
                "claimed_count": self.claimed_count,
                "completed_count": len(self.results),
                "failed_count": sum(item.get("status") == "failed" for item in self.results),
                "skipped_claim_count": len(self.claim_errors),
                "claim_errors": list(self.claim_errors),
                "results": list(results),
                "next_cursor": len(self.results),
                "has_more": self.status == "running",
                "error": self.error,
                "created_at": self.created_at,
                "completed_at": self.completed_at,
            }


_jobs: dict[str, BatchJob] = {}
_jobs_lock = threading.Lock()


def start_batch_job(count: int, parallel_workers: int) -> dict[str, Any]:
    with _jobs_lock:
        if any(job.status == "running" for job in _jobs.values()):
            raise RuntimeError("A review batch is already running")
        job = BatchJob(
            job_id=uuid.uuid4().hex,
            requested_count=max(1, min(1000, count)),
            parallel_workers=max(1, min(100, parallel_workers)),
        )
        _jobs[job.job_id] = job

    thread = threading.Thread(
        target=_run_batch_job,
        args=(job,),
        name=f"mcq-batch-{job.job_id[:8]}",
        daemon=True,
    )
    thread.start()
    return job.snapshot()


def get_batch_job(job_id: str, since: int = 0) -> dict[str, Any] | None:
    with _jobs_lock:
        job = _jobs.get(job_id)
    return job.snapshot(max(0, since)) if job else None


def has_active_batch() -> bool:
    with _jobs_lock:
        return any(job.status == "running" for job in _jobs.values())


def _run_batch_job(job: BatchJob) -> None:
    try:
        scan_batch_questions(
            job.requested_count,
            job.parallel_workers,
            on_claimed=job.mark_claimed,
            on_result=job.add_result,
            on_claim_error=job.add_claim_error,
        )
        job.finish({"claimed_count": job.claimed_count})
    except Exception as exc:
        job.fail(str(exc))
