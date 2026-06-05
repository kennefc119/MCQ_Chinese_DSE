"""Quick DB distribution check — passage × skill × difficulty."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from mcq_gen.db.client import fetch_all, get_supabase

sb = get_supabase()

# Questions
q_data = fetch_all(sb.table("dsemcq_questions").select("id,passage_id,stem,difficulty").eq("is_active", True))
# Tags
t_data = fetch_all(sb.table("dsemcq_question_tags").select("question_id,tag_id"))

tags_by_q = {}
for row in t_data:
    tags_by_q.setdefault(row["question_id"], []).append(row["tag_id"])

# Build matrix
matrix = {}  # (passage, tag) -> count
diff_matrix = {}  # (passage, difficulty) -> count
for row in q_data:
    pid = row["passage_id"]
    diff = row["difficulty"]
    diff_matrix[(pid, diff)] = diff_matrix.get((pid, diff), 0) + 1
    for tag in tags_by_q.get(row["id"], []):
        matrix[(pid, tag)] = matrix.get((pid, tag), 0) + 1

passages = sorted(set(r["passage_id"] for r in q_data))
tags = ["t-meaning", "t-comprehension", "t-theme", "t-rhetoric", "t-character", "t-grammar", "t-context", "t-comparison"]
tag_labels = ["字詞", "理解", "主旨", "修辭", "人物", "語法", "背景", "跨篇"]

out = Path(__file__).parent / "_db_distribution.txt"
with open(out, "w", encoding="utf-8") as f:
    f.write(f"Total active questions: {len(q.data)}\n\n")
    
    # Passage × Skill matrix
    header = f"{'':>6}" + "".join(f"{l:>6}" for l in tag_labels) + f"{'TOTAL':>8}\n"
    f.write("PASSAGE × SKILL DISTRIBUTION\n")
    f.write(header)
    for p in passages:
        row_total = sum(matrix.get((p, t), 0) for t in tags)
        cells = "".join(f"{matrix.get((p, t), 0):>6}" for t in tags)
        f.write(f"{p:>6}{cells}{row_total:>8}\n")
    # Totals
    totals = "".join(f"{sum(matrix.get((p, t), 0) for p in passages):>6}" for t in tags)
    f.write(f"{'TOTAL':>6}{totals}{len(q.data):>8}\n")

    # Passage × Difficulty matrix
    f.write(f"\n\nPASSAGE × DIFFICULTY DISTRIBUTION\n")
    diff_labels = ["1最淺", "2淺", "3中", "4深", "5最深"]
    header2 = f"{'':>6}" + "".join(f"{l:>8}" for l in diff_labels) + f"{'TOTAL':>8}\n"
    f.write(header2)
    for p in passages:
        row_total = sum(diff_matrix.get((p, d), 0) for d in range(1, 6))
        cells = "".join(f"{diff_matrix.get((p, d), 0):>8}" for d in range(1, 6))
        f.write(f"{p:>6}{cells}{row_total:>8}\n")
    totals2 = "".join(f"{sum(diff_matrix.get((p, d), 0) for p in passages):>8}" for d in range(1, 6))
    f.write(f"{'TOTAL':>6}{totals2}{len(q.data):>8}\n")

    # List all stems by passage for dedup reference
    f.write(f"\n\n{'='*70}\nALL EXISTING STEMS BY PASSAGE\n{'='*70}\n")
    by_passage = {}
    for row in q.data:
        by_passage.setdefault(row["passage_id"], []).append(row)
    for p in passages:
        f.write(f"\n--- {p} ({len(by_passage.get(p, []))} questions) ---\n")
        for row in sorted(by_passage.get(p, []), key=lambda x: x["stem"]):
            ttags = tags_by_q.get(row["id"], [])
            f.write(f"  [{row['difficulty']}] {','.join(ttags):20s} {row['stem'][:100]}\n")

print(f"Distribution written to {out}")
