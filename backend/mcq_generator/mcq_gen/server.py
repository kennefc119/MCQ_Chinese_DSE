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
    Run one pipeline cycle (1 question).
    Returns the saved question + full LLM call traces.
    """
    reset_traces()
    log.info("generate_start", passage=req.passage_id, dry_run=req.dry_run)

    try:
        results = run_pipeline(count=1, passage=req.passage_id, dry_run=req.dry_run)
    except Exception as exc:
        log.error("generate_error", error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    traces = get_traces()

    if not results:
        raise HTTPException(status_code=500, detail="Pipeline 未產生任何結果")

    return {
        "question": results[0].model_dump(),
        "traces": traces,
    }


# ─── Entry point ──────────────────────────────────────────────────────────────


def start_server(port: int = 8765, reload: bool = False) -> None:
    uvicorn.run(
        "mcq_gen.server:app",
        host="127.0.0.1",
        port=port,
        reload=reload,
        log_level="info",
    )
