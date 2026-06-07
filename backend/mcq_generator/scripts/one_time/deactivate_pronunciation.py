"""
Find and deactivate questions about pronunciation of words.
"""
import os, re, json, sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

DRY_RUN = "--dry-run" in sys.argv

PRONUNCIATION_PATTERNS = [
    r"讀作",
    r"讀音",
    r"怎[麼樣]讀",
    r"怎[麼樣]念",
    r"應讀",
    r"應怎[麼樣]讀",
    r"粵音",
    r"粵語讀音",
    r"普通話讀音",
    r"發音",
    r"音讀",
    r"聲調",
    r"讀法",
    r"正確[的]?讀音",
    r"正確[的]?發音",
    r"注音",
    r"拼音",
    r"讀[成為]甚[麼麽]",
    r"念[成為]甚[麼麽]",
    r"怎讀",
    r"怎念",
]

COMBINED_RE = re.compile("|".join(PRONUNCIATION_PATTERNS))

def fetch_all(table, columns):
    rows, ps, off = [], 1000, 0
    while True:
        r = sb.table(table).select(columns).range(off, off + ps - 1).execute()
        rows.extend(r.data)
        if len(r.data) < ps: break
        off += ps
    return rows

def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Scanning for pronunciation questions...\n")
    questions = fetch_all("dsemcq_questions", "id,stem,passage_id,is_active")

    active = [q for q in questions if q.get("is_active", True)]
    print(f"Active questions: {len(active)}")

    flagged = []
    for q in active:
        if COMBINED_RE.search(q["stem"]):
            flagged.append(q)

    print(f"Pronunciation questions found: {len(flagged)}\n")

    for i, q in enumerate(flagged, 1):
        print(f"[{i}] {q['id']}  (passage: {q['passage_id']})")
        print(f"    {q['stem'][:100]}")
        print()

    if not DRY_RUN and flagged:
        for q in flagged:
            sb.table("dsemcq_questions").update({"is_active": False}).eq("id", q["id"]).execute()
        print(f"Deactivated {len(flagged)} questions.")
    elif DRY_RUN:
        print(f"[DRY RUN] Would deactivate {len(flagged)} questions.")

    log_path = Path(__file__).parent.parent.parent / "audit_reports" / "deactivated_pronunciation.json"
    log_path.parent.mkdir(exist_ok=True)
    with open(log_path, "w", encoding="utf-8") as fp:
        json.dump([{"id": q["id"], "passage_id": q["passage_id"], "stem": q["stem"]} for q in flagged], fp, ensure_ascii=False, indent=2)
    print(f"Log saved to {log_path}")

if __name__ == "__main__":
    main()
