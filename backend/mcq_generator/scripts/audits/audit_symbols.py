#!/usr/bin/env python3
"""
Audit: find option texts containing symbols like =, ＝, →, ＞, ＜, etc.
that should be replaced with meaningful Chinese text.
"""

import os
import re
from collections import Counter
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
TABLE = "dsemcq_question_options"

# Symbols to look for (excluding 「」 which are normal Chinese quotation marks)
SYMBOL_RE = re.compile(r"[=＝→←＞＜≠≥≤⇒⇐►▸▹▻➜➤➡⟶↔]")


def fetch_all(sb):
    all_rows = []
    offset = 0
    batch = 1000
    while True:
        resp = (
            sb.table(TABLE)
            .select("id, question_id, label, text, is_correct")
            .range(offset, offset + batch - 1)
            .execute()
        )
        rows = resp.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < batch:
            break
        offset += batch
    return all_rows


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    all_rows = fetch_all(sb)
    print(f"Fetched {len(all_rows)} options.\n")

    # Find options with symbols
    flagged = []
    symbol_counts = Counter()

    for row in all_rows:
        text = row["text"] or ""
        matches = SYMBOL_RE.findall(text)
        if matches:
            for m in matches:
                symbol_counts[m] += 1
            flagged.append(row)

    print(f"Symbol frequency:")
    for sym, count in symbol_counts.most_common():
        print(f"  '{sym}' (U+{ord(sym):04X}): {count} occurrences")

    print(f"\nFound {len(flagged)} options with symbols:\n")
    print("=" * 100)
    for row in sorted(flagged, key=lambda r: r["question_id"]):
        correct = "✓" if row["is_correct"] else " "
        print(f"  [{correct}] {row['id']:40s}  {row['text']}")
    print("=" * 100)


if __name__ == "__main__":
    main()
