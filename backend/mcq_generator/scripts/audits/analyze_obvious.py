"""
Targeted analysis of obvious-answer issues, categorized by severity and type.
Then apply automated fixes to the database.
"""

import os, re, json, unicodedata
from pathlib import Path
from collections import Counter, defaultdict
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── helpers ───────────────────────────────────────────────────────────────

def cjk_len(text: str) -> int:
    return sum(1 for ch in text if unicodedata.category(ch).startswith(("Lo",)))

def clause_count(text: str) -> int:
    return len(re.split(r"[，,；;。、：:]", text))

def has_quotes(text: str) -> bool:
    return bool(re.search(r"[「」『』""''《》〈〉]", text))

def fetch_all(table: str, columns: str):
    rows, page_size, offset = [], 1000, 0
    while True:
        resp = sb.table(table).select(columns).range(offset, offset + page_size - 1).execute()
        rows.extend(resp.data)
        if len(resp.data) < page_size:
            break
        offset += page_size
    return rows

# ── generic/template distractor patterns ──────────────────────────────────

GENERIC_DISTRACTORS = [
    "將比喻義誤作字面義",
    "過度引申原文的含義",
    "忽視了詞作的寫作背景",
    "只取表面字義而忽略深意",
    "混淆了不同篇章的內容",
    "未能把握作者的真正意圖",
    "忽略了上下文的語境",
    "與原文主旨有所偏離",
    "以偏概全地理解原文",
    "張冠李戴地對應錯誤",
    "對作者身世背景理解有誤",
    "混淆了不同詩人的觀點",
    # Generic emotional descriptions that don't answer the question
    "感嘆英雄末路的悲涼",
    "抒發仕途不順的苦悶",
    "描寫赤壁的自然美景",
    "批評曹操的暴政統治",
    "表達歸隱山林的意願",
    "讚美周瑜的軍事才能",
    "感嘆戰爭帶來的破壞",
    "抒發對軍事失敗的憤怒",
    "表達對政治制度的不滿",
    "懷念故鄉的田園生活",
    "讚頌大自然的壯麗景色",
    "感嘆時光飛逝的無奈",
    "感嘆年華老去的傷感",
    "表達對新生活的期待",
    "表達對命運不公的控訴",
    "抒發飄零異鄉的愁苦",
    "抒發思念故鄉的情感",
    "描寫秋天蕭瑟的景色",
    "表達對丈夫的思念之情",
    "表達重獲新生的喜悅之情",
    "表達對政局變化的憂慮",
    "抒發對美好往事的留戀",
    "描寫孤獨寂寞的心境",
    "以酒象徵對未來的期盼與希望",
    "感嘆收復失地遙遙無期",
    "讚美花燈工藝的精巧",
    "表達對元宵佳節的歡慶",
    "描寫城市夜晚的璀璨景象",
    "描寫熱鬧歡樂的氣氛",
    "抒發孤芳自賞的情懷",
    "表達不與世俗同流的志向",
    "諷刺南宋朝廷偏安享樂",
    "表達渴望融入人群的心願",
    "宋詞一律以婉約風格寫成",
    "詞牌決定了詞的內容和主題",
]

def has_generic_distractors(wrong_opts):
    """Check if 2+ wrong options are generic template distractors."""
    generic_count = 0
    for o in wrong_opts:
        if o["text"].strip() in GENERIC_DISTRACTORS:
            generic_count += 1
    return generic_count >= 2

def has_vocabulary_format_issue(correct_opt, wrong_opts):
    """
    Vocabulary questions where correct = "X、Y" and wrongs = "X——字面直譯的意思"
    The format mismatch makes correct obvious.
    """
    wrong_with_dash = sum(1 for o in wrong_opts if "——" in o["text"])
    correct_has_dash = "——" in correct_opt["text"]
    if wrong_with_dash >= 2 and not correct_has_dash:
        return True
    if correct_has_dash and wrong_with_dash == 0:
        return True
    return False

def has_list_format_issue(correct_opt, wrong_opts):
    """
    Correct answer starts with a list/enumeration pattern like "各有不同：①..."
    while wrongs are simple sentences.
    """
    list_pattern = re.compile(r"[：:].*[①②③]")
    c_has_list = bool(list_pattern.search(correct_opt["text"]))
    w_has_list = any(bool(list_pattern.search(o["text"])) for o in wrong_opts)
    if c_has_list and not w_has_list:
        return True
    return False

def has_quote_format_issue(correct_opt, wrong_opts):
    """Correct is the ONLY option with/without quotes."""
    c_q = has_quotes(correct_opt["text"])
    w_q = [has_quotes(o["text"]) for o in wrong_opts]
    if c_q and not any(w_q):
        return True
    if not c_q and all(w_q):
        return True
    return False

def has_length_issue(correct_opt, wrong_opts, threshold=0.6):
    """Correct answer length differs by >threshold from mean of wrongs."""
    c_len = cjk_len(correct_opt["text"])
    w_lens = [cjk_len(o["text"]) for o in wrong_opts]
    if not w_lens:
        return False, 0
    mean_w = sum(w_lens) / len(w_lens)
    if mean_w == 0 and c_len == 0:
        return False, 0
    if mean_w == 0:
        return True, 1.0
    ratio = abs(c_len - mean_w) / max(mean_w, 1)
    return ratio > threshold, ratio


def analyze():
    print("Fetching all questions and options from Supabase...")
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
    for q in qmap.values():
        q["options"].sort(key=lambda x: x.get("label") or "")

    print(f"Loaded {len(qmap)} active questions\n")

    # ── Categorize ────────────────────────────────────────────────────────
    cat_generic    = []   # Wrong options are template distractors → deactivate
    cat_vocab_fmt  = []   # Vocabulary format mismatch → fix format
    cat_list_fmt   = []   # List/enum in correct only → deactivate (can't auto-fix)
    cat_quote_only = []   # Quote format issue only → fix by removing quotes
    cat_length     = []   # Length outlier only → review
    cat_mixed      = []   # Multiple issues

    for qid, q in sorted(qmap.items()):
        opts = q["options"]
        if len(opts) < 3:
            continue
        correct = [o for o in opts if o["is_correct"]]
        wrong   = [o for o in opts if not o["is_correct"]]
        if len(correct) != 1:
            continue
        correct_opt = correct[0]

        issues = set()
        if has_generic_distractors(wrong):
            issues.add("GENERIC")
        if has_vocabulary_format_issue(correct_opt, wrong):
            issues.add("VOCAB_FMT")
        if has_list_format_issue(correct_opt, wrong):
            issues.add("LIST_FMT")
        if has_quote_format_issue(correct_opt, wrong):
            issues.add("QUOTE")
        length_issue, length_ratio = has_length_issue(correct_opt, wrong)
        if length_issue:
            issues.add("LENGTH")

        if not issues:
            continue

        entry = {
            "qid": qid,
            "passage_id": q["passage_id"],
            "stem": q["stem"],
            "correct": correct_opt,
            "wrong": wrong,
            "issues": issues,
            "length_ratio": length_ratio if length_issue else 0,
        }

        if "GENERIC" in issues:
            cat_generic.append(entry)
        elif "VOCAB_FMT" in issues:
            cat_vocab_fmt.append(entry)
        elif "LIST_FMT" in issues:
            cat_list_fmt.append(entry)
        elif issues == {"QUOTE"}:
            cat_quote_only.append(entry)
        elif issues == {"LENGTH"}:
            cat_length.append(entry)
        else:
            cat_mixed.append(entry)

    print("=" * 80)
    print("CATEGORY SUMMARY")
    print("=" * 80)
    print(f"  GENERIC distractors (deactivate):    {len(cat_generic)}")
    print(f"  VOCAB format mismatch (fix ——):      {len(cat_vocab_fmt)}")
    print(f"  LIST format in correct only (deact): {len(cat_list_fmt)}")
    print(f"  QUOTE-only issue (fix quotes):       {len(cat_quote_only)}")
    print(f"  LENGTH-only issue (review):          {len(cat_length)}")
    print(f"  MIXED issues:                        {len(cat_mixed)}")
    total = len(cat_generic) + len(cat_vocab_fmt) + len(cat_list_fmt) + len(cat_quote_only) + len(cat_length) + len(cat_mixed)
    print(f"  TOTAL flagged:                       {total}")
    print()

    # Passage breakdown
    passage_counts = defaultdict(int)
    for entries in [cat_generic, cat_vocab_fmt, cat_list_fmt, cat_quote_only, cat_length, cat_mixed]:
        for e in entries:
            passage_counts[e["passage_id"]] += 1
    print("By passage:")
    for pid, cnt in sorted(passage_counts.items(), key=lambda x: -x[1]):
        print(f"  {pid}: {cnt}")
    print()

    # ── Show samples ──────────────────────────────────────────────────────
    for cat_name, cat_list in [
        ("GENERIC DISTRACTORS", cat_generic[:5]),
        ("VOCAB FORMAT", cat_vocab_fmt[:5]),
        ("LIST FORMAT", cat_list_fmt[:5]),
        ("QUOTE ONLY", cat_quote_only[:5]),
        ("LENGTH ONLY", cat_length[:5]),
    ]:
        if cat_list:
            print(f"\n--- {cat_name} samples ---")
            for e in cat_list:
                print(f"  [{e['qid']}] {e['stem'][:60]}...")
                print(f"    ✓ ({e['correct']['label']}): {e['correct']['text']}")
                for o in e["wrong"]:
                    print(f"    ✗ ({o['label']}): {o['text']}")
                print()

    return {
        "generic": cat_generic,
        "vocab_fmt": cat_vocab_fmt,
        "list_fmt": cat_list_fmt,
        "quote_only": cat_quote_only,
        "length": cat_length,
        "mixed": cat_mixed,
    }


if __name__ == "__main__":
    results = analyze()
