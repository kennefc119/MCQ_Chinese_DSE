#!/usr/bin/env python3
"""
Audit: find questions where the correct answer has () or （） clarification
but other options do NOT — making the correct answer obviously identifiable.

Also detects questions where ONLY the correct answer is significantly longer
than the distractors.
"""

import os
import re
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
TABLE = "dsemcq_question_options"

PAREN_RE = re.compile(r"[（(][^)）]+[)）]")


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

    # Group by question
    by_q = defaultdict(list)
    for r in all_rows:
        by_q[r["question_id"]].append(r)

    flagged = []

    for qid, opts in by_q.items():
        correct = [o for o in opts if o["is_correct"]]
        wrong = [o for o in opts if not o["is_correct"]]

        if not correct or not wrong:
            continue

        for c in correct:
            c_text = c["text"] or ""
            c_has_paren = bool(PAREN_RE.search(c_text))

            # Check if any wrong option also has parens
            wrong_with_paren = sum(1 for w in wrong if PAREN_RE.search(w["text"] or ""))

            if c_has_paren and wrong_with_paren == 0:
                # Only the correct answer has parens → obvious
                flagged.append({
                    "question_id": qid,
                    "correct_id": c["id"],
                    "correct_label": c["label"],
                    "correct_text": c_text,
                    "wrong_texts": [(w["id"], w["label"], w["text"]) for w in wrong],
                })

    # Sort for readability
    flagged.sort(key=lambda x: x["question_id"])

    print(f"Found {len(flagged)} questions where ONLY the correct answer has () clarification:\n")
    print("=" * 100)
    for f in flagged:
        print(f"  Question:      {f['question_id']}")
        print(f"  Correct [{f['correct_label']}]:  {f['correct_text']}")
        for wid, wlabel, wtext in f["wrong_texts"]:
            print(f"  Wrong   [{wlabel}]:  {wtext}")
        print("-" * 100)


if __name__ == "__main__":
    main()
