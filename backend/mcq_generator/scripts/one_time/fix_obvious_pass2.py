"""
Second fix pass for remaining obvious-answer issues.

1. Fix remaining 17 quote issues (missed in pass 1 due to VOCAB taking precedence)
2. Deactivate extreme length outliers (>100% diff ratio - wrong opts are 1-3 chars)
"""

import os, re, json, sys, unicodedata
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

DRY_RUN = "--dry-run" in sys.argv

def cjk_len(t): return sum(1 for c in t if unicodedata.category(c).startswith(("Lo",)))
def has_quotes(t): return bool(re.search(r"[「」『』]", t))

def fetch_all(table, columns):
    rows, ps, off = [], 1000, 0
    while True:
        r = sb.table(table).select(columns).range(off, off+ps-1).execute()
        rows.extend(r.data)
        if len(r.data)<ps: break
        off += ps
    return rows

def strip_book_quotes(text):
    return re.sub(r"[「」『』]", "", text)

stats = defaultdict(int)
changes = []

def deactivate_question(qid, reason):
    stats[f"deactivated_{reason}"] += 1
    changes.append({"action": "DEACTIVATE", "reason": reason, "qid": qid})
    if not DRY_RUN:
        sb.table("dsemcq_questions").update({"is_active": False}).eq("id", qid).execute()

def update_option(opt_id, old_text, new_text, reason):
    stats[f"fixed_{reason}"] += 1
    changes.append({"action": "FIX_OPTION", "reason": reason, "opt_id": opt_id, "old": old_text, "new": new_text})
    if not DRY_RUN:
        sb.table("dsemcq_question_options").update({"text": new_text}).eq("id", opt_id).execute()

def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Pass 2: Fixing remaining issues...")
    questions = fetch_all("dsemcq_questions", "id,stem,passage_id,is_active")
    options = fetch_all("dsemcq_question_options", "id,question_id,label,text,is_correct")

    qmap = {}
    for q in questions:
        if not q.get("is_active", True): continue
        qmap[q["id"]] = {"stem": q["stem"], "passage_id": q.get("passage_id"), "options": []}
    for o in options:
        if o["question_id"] in qmap:
            qmap[o["question_id"]]["options"].append(o)

    print(f"Loaded {len(qmap)} active questions\n")

    for qid, q in sorted(qmap.items()):
        opts = q["options"]
        if len(opts) < 3: continue
        correct = [o for o in opts if o["is_correct"]]
        wrong = [o for o in opts if not o["is_correct"]]
        if len(correct) != 1: continue
        c = correct[0]

        # ── 1. Fix remaining quote issues ────────────────────────────
        c_has_bracket = bool(re.search(r"[「」『』]", c["text"]))
        w_any_bracket = any(bool(re.search(r"[「」『』]", o["text"])) for o in wrong)
        if c_has_bracket and not w_any_bracket:
            new_text = strip_book_quotes(c["text"])
            if new_text != c["text"]:
                update_option(c["id"], c["text"], new_text, "quote_pass2")

        # ── 2. Deactivate extreme length outliers ────────────────────
        c_len = cjk_len(c["text"])
        w_lens = [cjk_len(o["text"]) for o in wrong]
        if not w_lens: continue
        mean_w = sum(w_lens) / len(w_lens)
        if mean_w == 0: continue
        ratio = abs(c_len - mean_w) / mean_w

        # Deactivate if ratio > 100% (correct is 2x+ or 0.5x- the wrongs)
        if ratio > 1.0:
            deactivate_question(qid, "extreme_length")

    print("=" * 80)
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}PASS 2 SUMMARY")
    print("=" * 80)
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")

    log_path = Path(__file__).parent.parent.parent / "audit_reports" / "fix_obvious_pass2_log.json"
    log_path.parent.mkdir(exist_ok=True)
    with open(log_path, "w", encoding="utf-8") as fp:
        json.dump(changes, fp, ensure_ascii=False, indent=2)
    print(f"\n  Log saved to {log_path}")

if __name__ == "__main__":
    main()
