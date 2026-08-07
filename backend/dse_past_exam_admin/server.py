"""DSE past-exam JSON uploader admin service.

Run:
    python -m uvicorn server:app --reload --port 8768
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from supabase import create_client

from config import settings

app = FastAPI(title="DSE Past Exam Admin API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_HERE = Path(__file__).parent
_TABLE = settings.dse_past_exam_table
_ALLOWED_SECTION_KEYS = {
    "designated_passages_data": "designated",
    "unseen_passages_data": "unseen",
}


class ImportRequest(BaseModel):
    source_file_name: str = Field(..., min_length=1)
    payload: dict[str, Any]
    dry_run: bool = False


class BatchDocument(BaseModel):
    source_file_name: str = Field(..., min_length=1)
    payload: dict[str, Any]


class BatchImportRequest(BaseModel):
    documents: list[BatchDocument] = Field(default_factory=list)
    dry_run: bool = False


def _get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_key)


def _coerce_int(value: Any, default: int | None = None) -> int | None:
    if value is None:
        return default
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return default
        if cleaned.isdigit() or (cleaned.startswith("-") and cleaned[1:].isdigit()):
            return int(cleaned)
    return default


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _question_type_norm(raw: str | None) -> str:
    if not raw:
        return "other"
    value = raw.strip().lower()

    aliases = {
        "mc": "mc",
        "multiple choice": "mc",
        "multiple-choice": "mc",
        "多項選擇": "mc",
        "多项选择": "mc",
        "t/f": "tf",
        "true/false": "tf",
        "true false": "tf",
        "判斷": "tf",
        "判断": "tf",
        "short": "short",
        "short answer": "short",
        "短答": "short",
        "短答題": "short",
        "短答题": "short",
        "long": "long",
        "long answer": "long",
        "長答": "long",
        "长答": "long",
        "structured": "structured",
        "結構": "structured",
        "结构": "structured",
        "matching": "matching",
        "配對": "matching",
        "配对": "matching",
        "cloze": "cloze",
        "填充": "cloze",
        "填空": "cloze",
        "table": "table",
        "表格": "table",
    }
    if value in aliases:
        return aliases[value]

    if "choice" in value or "選擇" in value or "选择" in value:
        return "mc"
    if "true" in value or "false" in value or "判斷" in value or "判断" in value:
        return "tf"
    if "short" in value or "短答" in value:
        return "short"
    if "long" in value or "長答" in value or "长答" in value:
        return "long"
    if "結構" in value or "结构" in value:
        return "structured"
    if "配對" in value or "配对" in value:
        return "matching"
    if "填空" in value or "cloze" in value:
        return "cloze"

    return "other"


def _source_year_from_filename(source_file_name: str) -> int | None:
    match = re.search(r"(20\d{2})", source_file_name)
    if not match:
        return None
    return int(match.group(1))


def _flatten_payload(payload: dict[str, Any], source_file_name: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    exam_metadata = payload.get("exam_metadata") or {}
    general_marking = payload.get("general_marking_guidelines") or {}

    source_file_year = _source_year_from_filename(source_file_name)
    exam_year = _coerce_int(exam_metadata.get("year"), default=source_file_year)
    if exam_year is None:
        raise HTTPException(status_code=422, detail="Cannot determine exam year from exam_metadata.year or source filename")

    paper_source = _clean_text(exam_metadata.get("paper_source"))

    rows: list[dict[str, Any]] = []
    anomalies: list[str] = []

    for section_key, section_type in _ALLOWED_SECTION_KEYS.items():
        passages = payload.get(section_key) or []
        if not isinstance(passages, list):
            anomalies.append(f"{section_key}: expected array, got {type(passages).__name__}")
            continue

        for passage in passages:
            if not isinstance(passage, dict):
                anomalies.append(f"{section_key}: passage item not object")
                continue

            passage_bucket = _clean_text(passage.get("passage_id")) or "unknown"
            passage_title = _clean_text(passage.get("passage_title")) or "(untitled)"
            author = _clean_text(passage.get("author"))
            passage_text_content = _clean_text(passage.get("text_content"))

            questions = passage.get("questions") or []
            if not isinstance(questions, list):
                anomalies.append(f"{section_type}/{passage_bucket}: questions not array")
                continue

            for q in questions:
                if not isinstance(q, dict):
                    anomalies.append(f"{section_type}/{passage_bucket}: question item not object")
                    continue

                question_number = _clean_text(q.get("question_number")) or "unknown"
                question_text = _clean_text(q.get("question_text")) or ""
                score = _coerce_int(q.get("score"), default=0) or 0
                question_type_raw = _clean_text(q.get("question_type"))
                question_type_norm = _question_type_norm(question_type_raw)

                marking = q.get("marking_scheme_data") or {}
                if not isinstance(marking, dict):
                    anomalies.append(
                        f"{section_type}/{passage_bucket}/{question_number}: marking_scheme_data not object"
                    )
                    marking = {}

                row = {
                    "exam_year": exam_year,
                    "paper_source": paper_source,
                    "section_type": section_type,
                    "passage_bucket": passage_bucket,
                    "passage_title": passage_title,
                    "author": author,
                    "passage_text_content": passage_text_content,
                    "question_number": question_number,
                    "question_text": question_text,
                    "score": max(score, 0),
                    "question_type_raw": question_type_raw,
                    "question_type_norm": question_type_norm,
                    "official_answer_key": _clean_text(marking.get("official_answer_key")),
                    "suggested_answer_text": _clean_text(marking.get("suggested_answer_text")),
                    "specific_marking_notes": _clean_text(marking.get("specific_marking_notes")),
                    "relies_on_general_rubric": marking.get("relies_on_general_rubric") if isinstance(marking.get("relies_on_general_rubric"), bool) else None,
                    "source_file": source_file_name,
                    "source_file_year": source_file_year,
                    "exam_metadata_json": exam_metadata,
                    "general_marking_guidelines_json": general_marking,
                    "passage_json": passage,
                    "question_json": q,
                    "marking_scheme_data_json": marking,
                }
                rows.append(row)

    summary = {
        "exam_year": exam_year,
        "source_file": source_file_name,
        "source_file_year": source_file_year,
        "total_rows": len(rows),
        "anomalies": anomalies,
    }
    return rows, summary


def _chunked(rows: list[dict[str, Any]], size: int = 300):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def _sample_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "exam_year": r["exam_year"],
            "section_type": r["section_type"],
            "passage_bucket": r["passage_bucket"],
            "passage_title": r["passage_title"],
            "question_number": r["question_number"],
            "score": r["score"],
            "question_type_norm": r["question_type_norm"],
            "source_file": r["source_file"],
        }
        for r in rows[:8]
    ]


def _run_batch(documents: list[BatchDocument], dry_run: bool) -> dict[str, Any]:
    if not documents:
        raise HTTPException(status_code=422, detail="No documents provided")

    all_rows: list[dict[str, Any]] = []
    file_summaries: list[dict[str, Any]] = []
    total_anomalies = 0

    for doc in documents:
        rows, summary = _flatten_payload(doc.payload, doc.source_file_name)
        all_rows.extend(rows)
        file_summaries.append(summary)
        total_anomalies += len(summary.get("anomalies") or [])

    result: dict[str, Any] = {
        "ok": True,
        "dry_run": dry_run,
        "batch_summary": {
            "files_count": len(documents),
            "total_rows": len(all_rows),
            "total_anomalies": total_anomalies,
        },
        "file_summaries": file_summaries,
        "sample": _sample_rows(all_rows),
    }

    if dry_run:
        result["imported_rows"] = 0
        return result

    if not all_rows:
        return {
            **result,
            "ok": False,
            "imported_rows": 0,
            "detail": "No question rows found across uploaded files",
        }

    sb = _get_supabase()
    try:
        for chunk in _chunked(all_rows):
            sb.table(_TABLE).upsert(
                chunk,
                on_conflict="exam_year,section_type,passage_bucket,question_number,source_file",
            ).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc

    result["imported_rows"] = len(all_rows)
    result["table"] = _TABLE
    return result


@app.get("/")
def dashboard():
    html_path = _HERE / "dashboard.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="dashboard.html not found")
    return FileResponse(str(html_path), media_type="text/html")


@app.get("/api/health")
def health_check() -> dict[str, Any]:
    try:
        sb = _get_supabase()
        sb.table(_TABLE).select("id", count="exact").limit(1).execute()
        return {"status": "ok", "table": _TABLE}
    except Exception as exc:
        return {"status": "error", "table": _TABLE, "detail": str(exc)}


@app.post("/api/preview")
def preview_import(req: ImportRequest) -> dict[str, Any]:
    rows, summary = _flatten_payload(req.payload, req.source_file_name)
    return {
        "ok": True,
        "summary": summary,
        "sample": _sample_rows(rows),
    }


@app.post("/api/import")
def run_import(req: ImportRequest) -> dict[str, Any]:
    rows, summary = _flatten_payload(req.payload, req.source_file_name)
    if req.dry_run:
        return {"ok": True, "dry_run": True, "summary": summary, "imported_rows": 0}

    if not rows:
        return {
            "ok": False,
            "dry_run": False,
            "summary": summary,
            "imported_rows": 0,
            "detail": "No question rows found",
        }

    sb = _get_supabase()
    try:
        for chunk in _chunked(rows):
            sb.table(_TABLE).upsert(
                chunk,
                on_conflict="exam_year,section_type,passage_bucket,question_number,source_file",
            ).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc

    return {
        "ok": True,
        "dry_run": False,
        "summary": summary,
        "imported_rows": len(rows),
        "table": _TABLE,
    }


@app.post("/api/preview-batch")
def preview_import_batch(req: BatchImportRequest) -> dict[str, Any]:
    return _run_batch(req.documents, dry_run=True)


@app.post("/api/import-batch")
def run_import_batch(req: BatchImportRequest) -> dict[str, Any]:
    return _run_batch(req.documents, dry_run=req.dry_run)
