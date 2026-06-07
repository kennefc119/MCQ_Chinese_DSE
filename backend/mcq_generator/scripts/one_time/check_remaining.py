"""Quick check of remaining issues after first fix pass."""
import os, re, unicodedata
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

def fetch_all(table, columns):
    rows, ps, off = [], 1000, 0
    while True:
        r = sb.table(table).select(columns).range(off, off+ps-1).execute()
        rows.extend(r.data)
        if len(r.data)<ps: break
        off += ps
    return rows

def cjk_len(t): return sum(1 for c in t if unicodedata.category(c).startswith(("Lo",)))
def has_quotes(t): return bool(re.search(r"[「」『』]", t))

questions = fetch_all("dsemcq_questions", "id,stem,passage_id,is_active")
options = fetch_all("dsemcq_question_options", "id,question_id,label,text,is_correct")

qmap = {}
for q in questions:
    if not q.get("is_active", True): continue
    qmap[q["id"]] = {"stem": q["stem"], "passage_id": q.get("passage_id"), "options": []}
for o in options:
    if o["question_id"] in qmap:
        qmap[o["question_id"]]["options"].append(o)

# Remaining quote issues
print("=== REMAINING QUOTE-ONLY ISSUES (correct has 「」, wrongs don't) ===")
quote_count = 0
for qid, q in sorted(qmap.items()):
    opts = q["options"]
    correct = [o for o in opts if o["is_correct"]]
    wrong = [o for o in opts if not o["is_correct"]]
    if len(correct) != 1 or len(opts) < 3: continue
    c = correct[0]
    c_q = has_quotes(c["text"])
    w_q = [has_quotes(o["text"]) for o in wrong]
    if c_q and not any(w_q):
        quote_count += 1
        if quote_count <= 5:
            print(f"  {qid}: correct={c['text']}")
            for o in wrong:
                print(f"    wrong: {o['text']}")
            print()
print(f"  Total: {quote_count}\n")

# Check if remaining quote issues have 《》 (book titles, shouldn't strip)
print("=== CHECKING if remaining quotes are 《》 book titles vs 「」 ===")
only_book = 0
has_bracket = 0
for qid, q in sorted(qmap.items()):
    opts = q["options"]
    correct = [o for o in opts if o["is_correct"]]
    wrong = [o for o in opts if not o["is_correct"]]
    if len(correct) != 1 or len(opts) < 3: continue
    c = correct[0]
    c_has_bracket = bool(re.search(r"[「」『』]", c["text"]))
    c_has_book = bool(re.search(r"[《》〈〉]", c["text"]))
    w_any_q = any(has_quotes(o["text"]) for o in wrong)
    if not w_any_q:
        if c_has_bracket:
            has_bracket += 1
        elif c_has_book and not c_has_bracket:
            only_book += 1
print(f"  Still has 「」brackets: {has_bracket}")
print(f"  Only has 《》books: {only_book}")

# Length distribution
print("\n=== LENGTH OUTLIER DISTRIBUTION ===")
length_buckets = {"46-60%": 0, "61-80%": 0, "81-100%": 0, ">100%": 0}
length_details = []
for qid, q in sorted(qmap.items()):
    opts = q["options"]
    correct = [o for o in opts if o["is_correct"]]
    wrong = [o for o in opts if not o["is_correct"]]
    if len(correct) != 1 or len(opts) < 3: continue
    c = correct[0]
    c_len = cjk_len(c["text"])
    w_lens = [cjk_len(o["text"]) for o in wrong]
    if not w_lens: continue
    mean_w = sum(w_lens) / len(w_lens)
    if mean_w == 0: continue
    ratio = abs(c_len - mean_w) / mean_w
    if ratio <= 0.45: continue
    if ratio <= 0.6:
        length_buckets["46-60%"] += 1
    elif ratio <= 0.8:
        length_buckets["61-80%"] += 1
    elif ratio <= 1.0:
        length_buckets["81-100%"] += 1
    else:
        length_buckets[">100%"] += 1
    if ratio > 0.8:
        length_details.append((qid, c_len, mean_w, ratio, c["text"], [(o["label"], o["text"]) for o in wrong]))

for bucket, count in length_buckets.items():
    print(f"  {bucket}: {count}")

print(f"\n=== WORST LENGTH OUTLIERS (>80% diff) - {len(length_details)} total, showing 10 ===")
for qid, cl, mw, r, ct, wrongs in sorted(length_details, key=lambda x: -x[3])[:10]:
    print(f"  {qid}: correct={cl}字, wrongs_mean={mw:.0f}字 ({r:.0%})")
    print(f"    ✓ {ct}")
    for lbl, txt in wrongs:
        print(f"    ✗ ({lbl}) {txt}")
    print()
