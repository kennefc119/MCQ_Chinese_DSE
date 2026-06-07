#!/usr/bin/env python3
"""
Fix 9 options where ONLY the correct answer has () clarification,
making it obviously identifiable. We either:
  - Remove the parenthetical entirely (when redundant), or
  - Integrate the meaning into the sentence naturally (when needed for sense).
"""

import argparse
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
TABLE = "dsemcq_question_options"

# ── Manual fixes ────────────────────────────────────────────────────────
# Each entry: (option_id, old_text, new_text)
FIXES = [
    # q-ai-p02-04512c: 「動詞（做）」→ integrate meaning
    (
        "q-ai-p02-04512c-opt0",
        "不同：前兩個「為」是介詞，第三個是動詞（做）",
        "不同：前兩個「為」是介詞，第三個是動詞，解作「做」",
    ),
    # q-ai-p02-177733: 「惻隱（仁）」「羞惡（義）」→ integrate
    (
        "q-ai-p02-177733-opt0",
        "兩句分別論證不同善端的普遍性——前者指惻隱（仁），後者指羞惡（義），合證善性人皆有之",
        "兩句分別論證不同善端的普遍性——前者指惻隱之心，後者指羞惡之心，合證善性人皆有之",
    ),
    # q-ai-p03-6006f3: 「助詞（的）」→ integrate
    (
        "q-ai-p03-6006f3-opt0",
        "「子之言」的「之」是助詞（的）",
        "「子之言」的「之」是助詞，解作「的」",
    ),
    # q-ai-p05-edd4df: 「道義（理）」→ remove paren, redundant
    (
        "q-ai-p05-edd4df-opt0",
        "外交鬥爭中道義（理）比利益更重要",
        "外交鬥爭中道義比利益更重要",
    ),
    # q-ai-p06-032de8: 「轉折（卻）」→ integrate
    (
        "q-ai-p06-032de8-opt0",
        "「創業未半，而中道崩殂」，轉折（卻）",
        "「創業未半，而中道崩殂」，「而」表轉折",
    ),
    # q-ai-p06-77e7bc: 「目的（來）」→ integrate
    (
        "q-ai-p06-77e7bc-opt0",
        "「以光先帝遺德」中「以」表目的（來）",
        "「以光先帝遺德」中「以」表目的，解作「來」",
    ),
    # q-ai-p07-71e3b1: 「有的（人）」→ integrate
    (
        "q-ai-p07-71e3b1-opt0",
        "「或」是不定代詞，意為「有的（人）」",
        "「或」是不定代詞，意為「有的人」",
    ),
    # q-ai-p09-88014e: correct answer has (a) label style — leave structure
    # but the paren here is "(a)" which is a label, not a hint.
    # Actually: "三種不同用法：(a) 結構助詞「的」"
    # The (a) is a label format. The other options don't use this pattern → remove label
    (
        "q-ai-p09-88014e-opt0",
        "三種不同用法：(a) 結構助詞「的」",
        "三種不同用法，包括結構助詞「的」",
    ),
    # q-ai-p09-d8f4b1: "(a)「則」是判斷副詞" → remove (a) label
    (
        "q-ai-p09-d8f4b1-opt0",
        "(a)「則」是判斷副詞",
        "「則」是判斷副詞",
    ),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"Planned fixes: {len(FIXES)}\n")
    print("=" * 90)

    for opt_id, old, new in FIXES:
        # Verify current value
        resp = sb.table(TABLE).select("id, text").eq("id", opt_id).execute()
        row = resp.data[0] if resp.data else None

        if not row:
            print(f"  ⚠ {opt_id} NOT FOUND in DB — skipping")
            print("-" * 90)
            continue

        current = row["text"]
        if current != old:
            print(f"  ⚠ {opt_id} text mismatch!")
            print(f"    Expected: {old}")
            print(f"    Actual:   {current}")
            print("-" * 90)
            continue

        print(f"  ID:     {opt_id}")
        print(f"  BEFORE: {old}")
        print(f"  AFTER:  {new}")

        if args.apply:
            sb.table(TABLE).update({"text": new}).eq("id", opt_id).execute()
            print("  ✓ Updated")

        print("-" * 90)

    if not args.apply:
        print(f"\n** DRY RUN — re-run with --apply to write changes. **")
    else:
        print(f"\nDone. {len(FIXES)} options updated.")


if __name__ == "__main__":
    main()
