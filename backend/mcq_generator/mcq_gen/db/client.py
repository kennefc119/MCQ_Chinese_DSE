"""Supabase 客戶端單例 — 使用 service-role key（繞過 RLS）。"""
from __future__ import annotations

from supabase import Client, create_client

from ..config import settings

_client: Client | None = None

_PAGE_SIZE = 1000  # Supabase default max per request


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def fetch_all(query_builder) -> list[dict]:
    """Execute a Supabase select query with automatic pagination to bypass the 1000-row default limit.

    Usage:
        rows = fetch_all(sb.table("my_table").select("id,name").eq("active", True))
    """
    all_rows: list[dict] = []
    offset = 0
    while True:
        resp = query_builder.range(offset, offset + _PAGE_SIZE - 1).execute()
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return all_rows
