#!/usr/bin/env python3
"""
Cleanup MCQ option texts in Supabase:
1. Remove parenthesised hints/explanations from option text
2. Remove meaningless circled-number characters (①②③…⑳ etc.)

Two-phase approach:
  --preview   (default)  Show proposed changes without writing
  --apply                Write changes to Supabase
"""

import argparse
import os
import re
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

TABLE = "dsemcq_question_options"

# ── patterns ────────────────────────────────────────────────────────────
# Circled numbers U+2460–U+2473 (①–⑳) and U+3251–U+325F, U+32B1–U+32BF
CIRCLED_NUM_RE = re.compile(r"[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]")

# Parenthesised blocks – both full-width （…） and half-width (…)
# We match the outermost pair greedily, but avoid stripping option labels
# like "(A)" or single-char content that is part of the answer.
PAREN_RE = re.compile(r"[（(][^)）]{2,}[)）]")


def clean_text(raw: str) -> str:
    """Return cleaned text, or the original if nothing changed."""
    t = raw

    # 1. Remove circled numbers
    t = CIRCLED_NUM_RE.sub("", t)

    # 2. Remove parenthesised hints/explanations
    t = PAREN_RE.sub("", t)

    # 3. Collapse multiple spaces / trim
    t = re.sub(r"[ 　]+", " ", t).strip()

    # 4. Remove trailing punctuation artefacts like ", " or "，" left by removal
    t = re.sub(r"[,，;；]\s*$", "", t).strip()
    # Also handle leading artefacts
    t = re.sub(r"^[,，;；]\s*", "", t).strip()

    return t


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Write changes to Supabase"
    )
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Fetch ALL options (paginate in batches of 1000)
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

    print(f"Fetched {len(all_rows)} option rows total.\n")

    # Detect changes
    changes = []
    for row in all_rows:
        original = row["text"] or ""
        cleaned = clean_text(original)
        if cleaned != original:
            changes.append(
                {
                    "id": row["id"],
                    "question_id": row["question_id"],
                    "label": row["label"],
                    "original": original,
                    "cleaned": cleaned,
                }
            )

    if not changes:
        print("No options need cleaning. All good!")
        return

    # Show preview
    print(f"Found {len(changes)} options to clean:\n")
    print("=" * 80)
    for c in changes:
        print(f"  ID:       {c['id']}")
        print(f"  Question: {c['question_id']}  Label: {c['label']}")
        print(f"  BEFORE:   {c['original']}")
        print(f"  AFTER:    {c['cleaned']}")
        print("-" * 80)

    if not args.apply:
        print(f"\n** DRY RUN – {len(changes)} changes shown above. **")
        print("Re-run with --apply to write them to Supabase.")
        return

    # Apply
    print(f"\nApplying {len(changes)} updates …")
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
