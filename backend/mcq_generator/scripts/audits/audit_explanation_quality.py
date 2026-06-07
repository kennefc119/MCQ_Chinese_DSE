#!/usr/bin/env python3
"""
Audit per-option explanations in dsemcq_question_options for reasonableness.

Checks across all 8000+ options:
1. CORRECT option's explanation says "錯誤" / "不正確" (contradicts is_correct=true)
2. WRONG option's explanation says "正確" without "不正確" (contradicts is_correct=false)
3. Explanation is too short (<15 chars) to be useful
4. Explanation doesn't start with expected pattern ("此選項正確" / "此選項錯誤")
5. Cross-check: correct option explanation references a different option as correct
"""

import os
import re
import json
from collections import defaultdict
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

REPORT_DIR = Path(__file__).parent.parent.parent / "audit_reports"
REPORT_DIR.mkdir(exist_ok=True)


def fetch_all(sb, table, select="*"):
    all_rows = []
    offset = 0
    batch = 1000
    while True:
        resp = sb.table(table).select(select).range(offset, offset + batch - 1).execute()
        rows = resp.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < batch:
            break
        offset += batch
    return all_rows


def audit_option(opt, all_opts_for_q):
    """Audit a single option's explanation. Returns list of issue strings."""
    issues = []
    expl = (opt["explanation"] or "").strip()
    is_correct = opt["is_correct"]
    text = (opt["text"] or "").strip()
    label = opt.get("label") or "?"

    # --- Check 1: too short ---
    if len(expl) < 15:
        issues.append(f"TOO_SHORT: explanation only {len(expl)} chars: '{expl}'")

    if not expl:
        return issues

    # --- Check 2: correct option says "錯誤" ---
    if is_correct:
        # Check first 20 chars for "錯誤" pattern
        head = expl[:30]
        if re.search(r"此選項錯誤|選項錯誤|此項錯誤|這是錯誤|錯誤[。，]", head):
            issues.append(f"CORRECT_SAYS_WRONG: correct option's explanation starts with error marker")

        # Check if it lacks any "正確" marker (might still be ok if explanation is substantive)
        # but if it explicitly says 錯誤 anywhere in first 40 chars, flag it
        if "錯誤" in expl[:40] and "不是錯誤" not in expl[:40] and "並非錯誤" not in expl[:40]:
            if "CORRECT_SAYS_WRONG" not in str(issues):
                issues.append(f"CORRECT_SAYS_WRONG: correct option explanation contains '錯誤' early")

    # --- Check 3: wrong option says "正確" ---
    if not is_correct:
        head = expl[:30]
        if re.search(r"此選項正確|選項正確|此項正確|這是正確|正確[。，]", head):
            # Make sure it's not "不正確"
            if "不正確" not in head and "並非正確" not in head:
                issues.append(f"WRONG_SAYS_CORRECT: wrong option's explanation starts with correct marker")

    # --- Check 4: explanation references another label as correct ---
    if is_correct and label and label != "?":
        # Check if explanation mentions another option label as correct
        other_labels = [o["label"] for o in all_opts_for_q if o["label"] and o["label"] != label]
        for ol in other_labels:
            patterns = [
                f"答案[是為]{ol}",
                f"正確答案[是為]{ol}",
                f"應選{ol}",
                f"{ol}[才是]正確",
            ]
            for pat in patterns:
                if re.search(pat, expl):
                    issues.append(f"REFERENCES_OTHER: correct option explanation references '{ol}' as the answer")

    return issues


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Fetching data...")
    questions = fetch_all(sb, "dsemcq_questions", "id, passage_id, stem")
    options = fetch_all(sb, "dsemcq_question_options", "id, question_id, label, text, is_correct, explanation")
    print(f"  {len(questions)} questions, {len(options)} options")

    q_map = {q["id"]: q for q in questions}
    opts_by_q = defaultdict(list)
    for o in options:
        opts_by_q[o["question_id"]].append(o)

    flagged = []
    stats = {"total_options": 0, "flagged_options": 0, "flagged_questions": set()}

    for qid, q_opts in opts_by_q.items():
        q_opts_sorted = sorted(q_opts, key=lambda x: x["label"] or x["id"])
        for opt in q_opts_sorted:
            stats["total_options"] += 1
            issues = audit_option(opt, q_opts_sorted)
            if issues:
                stats["flagged_options"] += 1
                stats["flagged_questions"].add(qid)
                q_info = q_map.get(qid, {})
                flagged.append({
                    "option_id": opt["id"],
                    "question_id": qid,
                    "passage_id": q_info.get("passage_id", "?"),
                    "stem": (q_info.get("stem") or "")[:100],
                    "label": opt.get("label") or "?",
                    "text": (opt["text"] or "")[:60],
                    "is_correct": opt["is_correct"],
                    "explanation": (opt["explanation"] or "")[:200],
                    "issues": issues,
                })

    # Sort: CORRECT_SAYS_WRONG and WRONG_SAYS_CORRECT first (most severe)
    def severity(item):
        s = 0
        for iss in item["issues"]:
            if "CORRECT_SAYS_WRONG" in iss:
                s += 100
            elif "WRONG_SAYS_CORRECT" in iss:
                s += 90
            elif "REFERENCES_OTHER" in iss:
                s += 80
            elif "TOO_SHORT" in iss:
                s += 10
        return -s

    flagged.sort(key=severity)

    # Save report
    report_path = REPORT_DIR / "option_explanation_audit.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(flagged, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*100}")
    print(f"AUDIT SUMMARY")
    print(f"  Total options checked: {stats['total_options']}")
    print(f"  Flagged options:       {stats['flagged_options']}")
    print(f"  Flagged questions:     {len(stats['flagged_questions'])}")
    print(f"  Report:                {report_path}")

    if flagged:
        # Group by issue type
        by_type = defaultdict(int)
        for f_item in flagged:
            for iss in f_item["issues"]:
                tag = iss.split(":")[0]
                by_type[tag] += 1
        print(f"\n  Issue breakdown:")
        for tag, count in sorted(by_type.items(), key=lambda x: -x[1]):
            print(f"    {tag}: {count}")

        print(f"\n{'='*100}")
        print("FLAGGED OPTIONS (most severe first):")
        print(f"{'='*100}")
        for f_item in flagged:
            correct_mark = "CORRECT" if f_item["is_correct"] else "WRONG"
            print(f"\n  Option:   {f_item['option_id']} [{correct_mark}]")
            print(f"  Question: {f_item['question_id']} (passage: {f_item['passage_id']})")
            print(f"  Stem:     {f_item['stem']}")
            print(f"  [{f_item['label']}] {f_item['text']}")
            print(f"  Expl:     {f_item['explanation']}")
            for iss in f_item["issues"]:
                print(f"    ⚠ {iss}")
            print(f"  {'-'*95}")


if __name__ == "__main__":
    main()
