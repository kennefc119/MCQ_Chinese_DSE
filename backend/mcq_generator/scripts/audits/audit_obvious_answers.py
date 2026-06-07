"""
Audit & fix MCQ options where the correct answer is obviously distinguishable.

Checks for:
1. Format mismatch: correct answer uses different punctuation, brackets, or
   formatting style compared to the wrong answers.
2. Length outlier: correct answer is significantly longer or shorter than
   the other options (measured in Chinese characters).
3. Structural outlier: correct answer has a different sentence structure
   (e.g., different number of clauses, different delimiter pattern).
"""

import os, re, json, unicodedata
from pathlib import Path
from collections import Counter
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── helpers ───────────────────────────────────────────────────────────────

def cjk_len(text: str) -> int:
    """Count CJK characters (ignoring punctuation/spaces)."""
    return sum(1 for ch in text if unicodedata.category(ch).startswith(("Lo",)))


def punct_signature(text: str) -> str:
    """Extract punctuation/symbol skeleton for format comparison."""
    return "".join(ch for ch in text if unicodedata.category(ch).startswith(("P", "S")))


def clause_count(text: str) -> int:
    """Count clauses by splitting on Chinese commas / semicolons / periods."""
    return len(re.split(r"[，,；;。、：:]", text))


def has_quotes(text: str) -> bool:
    return bool(re.search(r"[「」『』""''《》〈〉]", text))


def ends_with_period(text: str) -> bool:
    return text.rstrip().endswith(("。", ".", "；"))


def starts_with_number(text: str) -> bool:
    return bool(re.match(r"^[①②③④⑤⑥⑦⑧⑨⑩\d（\(]", text.strip()))


def roman_numeral_pattern(text: str) -> bool:
    return bool(re.match(r"^[IiⅠⅱⅢⅳVv]", text.strip()))


# ── fetch all questions with their options ────────────────────────────────

def fetch_all(table: str, columns: str):
    rows, page_size, offset = [], 1000, 0
    while True:
        resp = sb.table(table).select(columns).range(offset, offset + page_size - 1).execute()
        rows.extend(resp.data)
        if len(resp.data) < page_size:
            break
        offset += page_size
    return rows


def build_question_map():
    """Return {question_id: {stem, options: [{label, text, is_correct, id}]}}."""
    questions = fetch_all("dsemcq_questions", "id,stem,passage_id,is_active")
    options   = fetch_all("dsemcq_question_options", "id,question_id,label,text,is_correct")

    qmap = {}
    for q in questions:
        if not q.get("is_active", True):
            continue
        qmap[q["id"]] = {"stem": q["stem"], "passage_id": q.get("passage_id"), "options": []}

    for o in options:
        qid = o["question_id"]
        if qid in qmap:
            qmap[qid]["options"].append(o)

    # sort options by label
    for q in qmap.values():
        q["options"].sort(key=lambda x: x.get("label") or "")

    return qmap


# ── detectors ─────────────────────────────────────────────────────────────

def detect_length_outlier(correct_opt, wrong_opts, threshold_ratio=0.45):
    """Flag if correct answer's CJK length differs from mean of wrongs by >threshold."""
    c_len = cjk_len(correct_opt["text"])
    w_lens = [cjk_len(o["text"]) for o in wrong_opts]
    if not w_lens:
        return None
    mean_w = sum(w_lens) / len(w_lens)
    if mean_w == 0 and c_len == 0:
        return None
    if mean_w == 0:
        return f"correct={c_len}字, wrongs all 0字"

    ratio = abs(c_len - mean_w) / max(mean_w, 1)
    if ratio > threshold_ratio:
        return f"correct={c_len}字, wrongs mean={mean_w:.0f}字 (diff {ratio:.0%})"
    return None


def detect_format_mismatch(correct_opt, wrong_opts):
    """Flag if correct answer has different punctuation/quote/structure pattern."""
    issues = []

    # Check quote usage
    c_quotes = has_quotes(correct_opt["text"])
    w_quotes = [has_quotes(o["text"]) for o in wrong_opts]
    if c_quotes != all(w_quotes) and c_quotes != any(w_quotes):
        # correct is the only one with/without quotes
        if c_quotes and not any(w_quotes):
            issues.append("only correct has quotes「」")
        elif not c_quotes and all(w_quotes):
            issues.append("only correct lacks quotes「」")

    # Check ending punctuation
    c_period = ends_with_period(correct_opt["text"])
    w_periods = [ends_with_period(o["text"]) for o in wrong_opts]
    if c_period and not any(w_periods):
        issues.append("only correct ends with period")
    elif not c_period and all(w_periods):
        issues.append("only correct lacks ending period")

    # Check numbering/bullet style
    c_num = starts_with_number(correct_opt["text"])
    w_nums = [starts_with_number(o["text"]) for o in wrong_opts]
    if c_num and not any(w_nums):
        issues.append("only correct starts with number")
    elif not c_num and all(w_nums):
        issues.append("only correct lacks leading number")

    return "; ".join(issues) if issues else None


def detect_structure_outlier(correct_opt, wrong_opts):
    """Flag if correct answer has a distinctly different clause count."""
    c_clauses = clause_count(correct_opt["text"])
    w_clauses = [clause_count(o["text"]) for o in wrong_opts]

    if not w_clauses:
        return None

    # Check if all wrongs have the same clause count but correct differs
    w_counter = Counter(w_clauses)
    most_common_count, most_common_freq = w_counter.most_common(1)[0]
    if most_common_freq == len(w_clauses) and c_clauses != most_common_count:
        return f"correct has {c_clauses} clauses, all wrongs have {most_common_count}"

    return None


def detect_punct_skeleton_outlier(correct_opt, wrong_opts):
    """Flag if correct answer's punctuation skeleton is unique among options."""
    c_sig = punct_signature(correct_opt["text"])
    w_sigs = [punct_signature(o["text"]) for o in wrong_opts]

    # If all wrongs share a signature but correct differs
    if len(set(w_sigs)) == 1 and c_sig != w_sigs[0] and len(c_sig) != len(w_sigs[0]):
        return f"punct skeleton differs: correct='{c_sig}' vs wrongs='{w_sigs[0]}'"
    return None


# ── main audit ────────────────────────────────────────────────────────────

def audit():
    print("Fetching all questions and options from Supabase...")
    qmap = build_question_map()
    print(f"Loaded {len(qmap)} active questions\n")

    flagged = []

    for qid, q in sorted(qmap.items()):
        opts = q["options"]
        if len(opts) < 3:
            continue

        correct = [o for o in opts if o["is_correct"]]
        wrong   = [o for o in opts if not o["is_correct"]]

        if len(correct) != 1:
            continue

        correct_opt = correct[0]
        issues = []

        # Run all detectors
        r = detect_length_outlier(correct_opt, wrong, threshold_ratio=0.45)
        if r:
            issues.append(("LENGTH", r))

        r = detect_format_mismatch(correct_opt, wrong)
        if r:
            issues.append(("FORMAT", r))

        r = detect_structure_outlier(correct_opt, wrong)
        if r:
            issues.append(("STRUCTURE", r))

        r = detect_punct_skeleton_outlier(correct_opt, wrong)
        if r:
            issues.append(("PUNCT", r))

        if issues:
            flagged.append({
                "question_id": qid,
                "passage_id": q["passage_id"],
                "stem": q["stem"],
                "correct_label": correct_opt["label"],
                "correct_text": correct_opt["text"],
                "wrong_texts": {o["label"]: o["text"] for o in wrong},
                "issues": issues,
            })

    # ── report ────────────────────────────────────────────────────────────
    print(f"{'='*80}")
    print(f"AUDIT COMPLETE: {len(flagged)} questions flagged out of {len(qmap)}")
    print(f"{'='*80}\n")

    for i, f in enumerate(flagged, 1):
        print(f"[{i}] {f['question_id']}  (passage: {f['passage_id']})")
        print(f"    STEM: {f['stem'][:80]}...")
        print(f"    CORRECT ({f['correct_label']}): {f['correct_text']}")
        for lbl, txt in f["wrong_texts"].items():
            print(f"    WRONG   ({lbl}): {txt}")
        for tag, detail in f["issues"]:
            print(f"    ⚠ {tag}: {detail}")
        print()

    # Save JSON report
    report_path = Path(__file__).parent.parent.parent / "audit_reports" / "obvious_answers_audit.json"
    report_path.parent.mkdir(exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as fp:
        json.dump(flagged, fp, ensure_ascii=False, indent=2)
    print(f"Report saved to {report_path}")

    return flagged


if __name__ == "__main__":
    audit()
