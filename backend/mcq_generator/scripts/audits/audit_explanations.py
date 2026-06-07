"""
Audit & fix question/option explanations that leak source references.

Scans dsemcq_questions.explanation and dsemcq_question_options.explanation
for keywords like "DSE past paper", "worksheet", "工作紙", "歷屆試題", etc.
Reports matches and optionally applies fixes.
"""

import os, re, json
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------------------------------------------------------------------
# 1. Keywords to detect (case-insensitive for English, exact for Chinese)
# ---------------------------------------------------------------------------
LEAK_PATTERNS = [
    # English
    r"DSE\s*past\s*paper",
    r"past\s*paper",
    r"worksheet",
    r"work\s*sheet",
    r"school\s*worksheet",
    r"exam\s*paper",
    r"mock\s*exam",
    r"mock\s*paper",
    r"practice\s*paper",
    r"sample\s*paper",
    r"exam\s*question",
    r"past\s*exam",
    r"marking\s*scheme",
    # Chinese
    r"工作紙",
    r"歷屆試題",
    r"歷屆",
    r"模擬試卷",
    r"模擬試題",
    r"試卷",
    r"考試卷",
    r"past\s*year",
]

COMBINED_RE = re.compile("|".join(LEAK_PATTERNS), re.IGNORECASE)


def fetch_all(table: str, columns: str):
    """Fetch all rows from a table, handling Supabase pagination."""
    rows = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            sb.table(table)
            .select(columns)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def scan_and_report():
    """Scan all explanations and report leaky ones."""
    # --- Question-level explanations ---
    questions = fetch_all("dsemcq_questions", "id,explanation")
    print(f"Fetched {len(questions)} questions")

    q_hits = []
    for q in questions:
        exp = q.get("explanation") or ""
        if COMBINED_RE.search(exp):
            matches = COMBINED_RE.findall(exp)
            q_hits.append({"id": q["id"], "explanation": exp, "matches": matches})

    # --- Option-level explanations ---
    options = fetch_all("dsemcq_question_options", "id,question_id,explanation")
    print(f"Fetched {len(options)} options")

    o_hits = []
    for o in options:
        exp = o.get("explanation") or ""
        if COMBINED_RE.search(exp):
            matches = COMBINED_RE.findall(exp)
            o_hits.append({
                "id": o["id"],
                "question_id": o["question_id"],
                "explanation": exp,
                "matches": matches,
            })

    # --- Report ---
    print("\n" + "=" * 70)
    print(f"QUESTION-LEVEL LEAKS: {len(q_hits)}")
    print("=" * 70)
    for h in q_hits:
        print(f"\n  [{h['id']}]  matched: {h['matches']}")
        print(f"  explanation: {h['explanation'][:300]}")

    print("\n" + "=" * 70)
    print(f"OPTION-LEVEL LEAKS: {len(o_hits)}")
    print("=" * 70)
    for h in o_hits:
        print(f"\n  [{h['id']}] (question {h['question_id']})  matched: {h['matches']}")
        print(f"  explanation: {h['explanation'][:300]}")

    print("\n" + "=" * 70)
    print(f"TOTAL LEAKS: {len(q_hits)} questions + {len(o_hits)} options = {len(q_hits) + len(o_hits)}")
    print("=" * 70)

    return q_hits, o_hits


if __name__ == "__main__":
    q_hits, o_hits = scan_and_report()
