"""
從 Supabase 拉取 12 篇課文並快取到 data/passages.json。
只需執行一次（或在課文更新後重新執行）：
    mcq-gen fetch-passages
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from .db.client import get_supabase

log = structlog.get_logger(__name__)

_OUTPUT = Path(__file__).parent.parent / "data" / "passages.json"


def fetch_and_cache_passages() -> dict[str, dict]:
    """從 Supabase dsemcq_passages 拉取全部課文，存到 data/passages.json。"""
    sb = get_supabase()
    resp = sb.table("dsemcq_passages").select("*").order("order_no").execute()
    rows = resp.data or []

    if not rows:
        raise RuntimeError("Supabase dsemcq_passages 回傳空資料，請確認 migration + seed 已執行。")

    passages: dict[str, dict] = {}
    for row in rows:
        pid = row["id"]
        passages[pid] = {
            "id": pid,
            "title": row.get("title", ""),
            "author": row.get("author", ""),
            "dynasty": row.get("dynasty", ""),
            "summary": row.get("summary", ""),
            "body": row.get("body", ""),
            "genre": row.get("genre", ""),
            "themes": row.get("themes", []),
        }

    _OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    _OUTPUT.write_text(json.dumps(passages, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("passages_cached", count=len(passages), path=str(_OUTPUT))
    return passages
