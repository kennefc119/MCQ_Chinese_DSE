"""One-time backfill for dsemcq_nd_passages.word_count."""
from __future__ import annotations

import re

from supabase import create_client

from config import settings

TABLE = "dsemcq_nd_passages"


def get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_key)


def count_words(content: str) -> int:
    tokens = re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]", content)
    return len(tokens)


def main() -> None:
    sb = get_supabase()
    rows = sb.table(TABLE).select("id,body").order("id").execute().data or []
    print(f"Loaded {len(rows)} rows from {TABLE}")
    updated = 0
    for row in rows:
        body = str(row.get("body") or "")
        word_count = count_words(body)
        sb.table(TABLE).update({"word_count": word_count}).eq("id", row["id"]).execute()
        updated += 1
    print(f"Updated word_count for {updated} rows")


if __name__ == "__main__":
    main()