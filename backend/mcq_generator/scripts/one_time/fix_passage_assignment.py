#!/usr/bin/env python3
"""Fix misassigned questions to correct passages."""

import argparse
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# Verified fixes (FK constraint: single passage_id only, pick primary):
# q-ai-p05-89ecd5: About 諸葛亮's loyalty (p06出師表) + 孔子's 君子 (p01論語)
#   → p06 primary (question is about 諸葛亮's character, 出師表 is the base text)
# q-ai-p05-fdc2c3: Compares 出師表(p06) + 岳陽樓記(p09) + 六國論(p10)
#   → p06 primary (出師表 is named first and is the structural anchor)
# q-ai-p09-9f74c9: Compares 范仲淹(p09) + 柳宗元(p08)
#   → p09 primary (current, "本文" refers to 岳陽樓記, comparison to p08)
#   Actually p09 is already correct — it says 本文=范仲淹, just cross-refs p08.
#   Keep as p09.
FIXES = [
    ("q-ai-p05-89ecd5", "p05", "p06"),
    ("q-ai-p05-fdc2c3", "p05", "p06"),
    # q-ai-p09-9f74c9: already p09 which is correct (本文=范仲淹's 岳陽樓記)
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    for qid, old_pid, new_pid in FIXES:
        # Verify current value
        r = sb.table("dsemcq_questions").select("id, passage_id, stem").eq("id", qid).execute()
        q = r.data[0]
        print(f"  {qid}")
        print(f"    Stem:    {q['stem'][:70]}...")
        print(f"    Current: {q['passage_id']}")
        print(f"    Fix to:  {new_pid}")

        if q["passage_id"] != old_pid:
            print(f"    ⚠ Current passage_id ({q['passage_id']}) != expected ({old_pid}) — skipping")
            continue

        if args.apply:
            sb.table("dsemcq_questions").update({"passage_id": new_pid}).eq("id", qid).execute()
            print(f"    ✓ Updated")
        print()

    if not args.apply:
        print(f"** DRY RUN — {len(FIXES)} fixes shown. Re-run with --apply. **")
    else:
        print(f"Done. {len(FIXES)} questions reassigned.")


if __name__ == "__main__":
    main()
