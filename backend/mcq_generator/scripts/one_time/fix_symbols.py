#!/usr/bin/env python3
"""
Replace symbols in option texts:
  ＝  →  即   (means / is equivalent to)
  →   →  、 or ，  (sequence / flow)

Two-phase: --preview (default), --apply
"""

import argparse
import os
import re
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
TABLE = "dsemcq_question_options"


def fetch_all(sb):
    all_rows = []
    offset = 0
    batch = 1000
    while True:
        resp = (
            sb.table(TABLE)
            .select("id, question_id, label, text")
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


SYMBOL_RE = re.compile(r"[＝→]")


def clean_text(raw: str) -> str:
    """Replace ＝ with 即, → with 、 (lists) or ， (clauses)."""
    t = raw

    # 1. Replace ＝ with 即
    t = t.replace("＝", "即")

    # 2. Replace →
    # Normalise spacing around →
    t = re.sub(r"\s*→\s*", "→", t)

    # Smart replacement: if text after → starts with a clause connector
    # or the preceding segment is long, use ，(comma) instead of 、
    parts = t.split("→")
    if len(parts) > 1:
        result = parts[0]
        for part in parts[1:]:
            # Use ， for clause-like continuations
            if re.match(r"(再|以|然後|接著|最後|從而|舉|由|先)", part) or len(result.split("、")[-1].split("，")[-1]) > 5:
                result += "，" + part
            else:
                result += "、" + part
        t = result

    # Clean up: double or conflicting punctuation
    t = re.sub(r"、[，,]", "，", t)
    t = re.sub(r"[，,]、", "、", t)
    t = re.sub(r"、{2,}", "、", t)

    # Trim
    t = t.strip()

    return t


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    all_rows = fetch_all(sb)
    print(f"Fetched {len(all_rows)} options.\n")

    changes = []
    for row in all_rows:
        original = row["text"] or ""
        if not SYMBOL_RE.search(original):
            continue
        cleaned = clean_text(original)
        if cleaned != original:
            changes.append({
                "id": row["id"],
                "question_id": row["question_id"],
                "label": row["label"],
                "original": original,
                "cleaned": cleaned,
            })

    if not changes:
        print("No options need changes.")
        return

    changes.sort(key=lambda c: c["question_id"])
    print(f"Found {len(changes)} options to update:\n")
    print("=" * 100)
    for c in changes:
        print(f"  ID:     {c['id']}")
        print(f"  BEFORE: {c['original']}")
        print(f"  AFTER:  {c['cleaned']}")
        print("-" * 100)

    if not args.apply:
        print(f"\n** DRY RUN — {len(changes)} changes. Re-run with --apply to write. **")
        return

    ok = 0
    fail = 0
    for c in changes:
        try:
            sb.table(TABLE).update({"text": c["cleaned"]}).eq("id", c["id"]).execute()
            ok += 1
        except Exception as e:
            print(f"  FAILED {c['id']}: {e}")
            fail += 1

    print(f"\nDone. {ok} updated, {fail} failed.")


if __name__ == "__main__":
    main()
