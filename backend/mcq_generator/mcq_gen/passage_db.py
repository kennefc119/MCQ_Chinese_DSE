"""
Passage DB helpers — query Supabase dsemcq_passages directly by passage_id.

The `id` column in dsemcq_passages IS the passage_id (p01–p12), so lookups
are a direct .eq("id", passage_id) call — no title fuzzy-matching needed.
"""
from __future__ import annotations

import structlog
from functools import lru_cache

from .db.client import get_supabase

log = structlog.get_logger(__name__)


def get_passage_body(passage_id: str) -> str:
    """
    Return the full body text of a passage from Supabase dsemcq_passages.
    Raises KeyError if the passage is not found.
    """
    sb = get_supabase()
    resp = (
        sb.table("dsemcq_passages")
        .select("id,title,body")
        .eq("id", passage_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise KeyError(
            f"Supabase dsemcq_passages 找不到篇章 id={passage_id!r}。"
            "請確認 migration + seed 已執行，且篇章 ID 正確。"
        )
    body = rows[0].get("body", "")
    title = rows[0].get("title", passage_id)
    log.debug("passage_fetched", passage_id=passage_id, title=title, body_len=len(body))
    return body


def get_passage_title(passage_id: str) -> str:
    """Return the title of a passage from Supabase dsemcq_passages."""
    sb = get_supabase()
    resp = (
        sb.table("dsemcq_passages")
        .select("title")
        .eq("id", passage_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0].get("title", passage_id) if rows else passage_id


@lru_cache(maxsize=1)
def _title_to_id_map() -> dict[str, str]:
    """Build a title → passage_id reverse-lookup from the DB. Cached for process lifetime."""
    sb = get_supabase()
    rows = (
        sb.table("dsemcq_passages")
        .select("id,title")
        .execute()
        .data or []
    )
    return {r["title"]: r["id"] for r in rows}


def get_passage_id_by_title(title: str) -> str | None:
    """Return the passage_id for a given passage title, or None if not found."""
    return _title_to_id_map().get(title)
