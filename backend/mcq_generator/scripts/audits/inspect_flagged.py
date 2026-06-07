#!/usr/bin/env python3
"""Show full details for flagged questions to manually verify passage assignment."""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

FLAGGED = [
    "q-ai-p05-89ecd5",
    "q-ai-p05-fdc2c3",
    "q-ai-p07-712489",
    "q-ai-p07-7f7287",
    "q-ai-p07-81c679",
    "q-ai-p09-9f74c9",
    "q-ai-p10-027f56",
]

for qid in FLAGGED:
    q = sb.table("dsemcq_questions").select("id, passage_id, stem, explanation").eq("id", qid).execute().data[0]
    opts = sb.table("dsemcq_question_options").select("id, label, text, is_correct").eq("question_id", qid).execute().data

    print(f"{'='*100}")
    print(f"ID:         {q['id']}")
    print(f"Passage:    {q['passage_id']}")
    print(f"Stem:       {q['stem']}")
    print(f"Explanation:{q['explanation'][:200] if q['explanation'] else 'N/A'}...")
    for o in sorted(opts, key=lambda x: x["label"] or ""):
        correct = "✓" if o["is_correct"] else " "
        print(f"  [{correct}] {o['label'] or '?':2s} {o['text']}")
    print()
