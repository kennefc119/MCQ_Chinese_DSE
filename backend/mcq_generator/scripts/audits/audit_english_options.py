"""
Audit: find all question options that contain English text.
Reports option id, text, and context so we can plan replacements.
"""
import os, re, json
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

def fetch_all(table, columns):
    rows, ps, off = [], 1000, 0
    while True:
        r = sb.table(table).select(columns).range(off, off + ps - 1).execute()
        rows.extend(r.data)
        if len(r.data) < ps:
            break
        off += ps
    return rows

# Match runs of 2+ ASCII letters (ignores single letters like A/B/C/D labels)
ENGLISH_RE = re.compile(r"[A-Za-z]{2,}")

# Whitelist: common abbreviations/proper nouns that are acceptable in Chinese context
WHITELIST = {"vs", "VS", "DSE"}

def has_english(text):
    """Return list of English words found in text."""
    matches = ENGLISH_RE.findall(text)
    return [m for m in matches if m not in WHITELIST]

def main():
    print("Fetching data...")
    questions = fetch_all("dsemcq_questions", "id,stem,passage_id,is_active")
    options = fetch_all("dsemcq_question_options", "id,question_id,label,text,is_correct")

    active_qids = {q["id"] for q in questions if q.get("is_active", True)}
    qmap = {q["id"]: q for q in questions if q["id"] in active_qids}

    # Group options by question
    q_opts = defaultdict(list)
    for o in options:
        if o["question_id"] in active_qids:
            q_opts[o["question_id"]].append(o)

    flagged = []
    for qid in sorted(active_qids):
        opts = q_opts.get(qid, [])
        for o in opts:
            eng_words = has_english(o["text"])
            if eng_words:
                flagged.append({
                    "question_id": qid,
                    "passage_id": qmap[qid].get("passage_id"),
                    "stem": qmap[qid]["stem"],
                    "option_id": o["id"],
                    "label": o.get("label"),
                    "text": o["text"],
                    "is_correct": o["is_correct"],
                    "english_words": eng_words,
                    "all_options": [(x.get("label"), x["text"], x["is_correct"]) for x in sorted(opts, key=lambda x: x.get("label") or "")],
                })

    print(f"\nFound {len(flagged)} options with English across {len(set(f['question_id'] for f in flagged))} questions\n")

    # Group by type of English
    for i, f in enumerate(flagged):
        print(f"[{i+1}] {f['option_id']}  (Q: {f['question_id']}, passage: {f['passage_id']})")
        print(f"    STEM: {f['stem'][:80]}")
        print(f"    OPTION ({f['label']}, correct={f['is_correct']}): {f['text']}")
        print(f"    ENGLISH: {f['english_words']}")
        print()

    # Save JSON
    out = Path(__file__).parent.parent.parent / "audit_reports" / "english_options_audit.json"
    out.parent.mkdir(exist_ok=True)
    with open(out, "w", encoding="utf-8") as fp:
        json.dump(flagged, fp, ensure_ascii=False, indent=2)
    print(f"Report saved to {out}")

if __name__ == "__main__":
    main()
