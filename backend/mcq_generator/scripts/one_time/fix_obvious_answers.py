"""
Fix obvious-answer issues in the MCQ database.

Actions:
1. DEACTIVATE questions with generic template distractors (99 Qs)
2. DEACTIVATE questions with list-format correct answer (26 Qs)
3. FIX vocabulary format mismatch: normalize ——  format (118 Qs)
4. FIX quote-only issues: strip 「」 from correct answer text when wrongs have none (130 Qs)
5. FIX severe length outliers: trim/pad option text where ratio > 0.6 (reviewed)

Run with --dry-run first to preview changes.
"""

import os, re, json, sys, unicodedata
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = "--dry-run" in sys.argv

# ── helpers ───────────────────────────────────────────────────────────────

def cjk_len(text: str) -> int:
    return sum(1 for ch in text if unicodedata.category(ch).startswith(("Lo",)))

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

# ── generic distractor patterns ──────────────────────────────────────────

GENERIC_DISTRACTORS = {
    "將比喻義誤作字面義", "過度引申原文的含義", "忽視了詞作的寫作背景",
    "只取表面字義而忽略深意", "混淆了不同篇章的內容", "未能把握作者的真正意圖",
    "忽略了上下文的語境", "與原文主旨有所偏離", "以偏概全地理解原文",
    "張冠李戴地對應錯誤", "對作者身世背景理解有誤", "混淆了不同詩人的觀點",
    "感嘆英雄末路的悲涼", "抒發仕途不順的苦悶", "描寫赤壁的自然美景",
    "批評曹操的暴政統治", "表達歸隱山林的意願", "讚美周瑜的軍事才能",
    "感嘆戰爭帶來的破壞", "抒發對軍事失敗的憤怒", "表達對政治制度的不滿",
    "懷念故鄉的田園生活", "讚頌大自然的壯麗景色", "感嘆時光飛逝的無奈",
    "感嘆年華老去的傷感", "表達對新生活的期待", "表達對命運不公的控訴",
    "抒發飄零異鄉的愁苦", "抒發思念故鄉的情感", "描寫秋天蕭瑟的景色",
    "表達對丈夫的思念之情", "表達重獲新生的喜悅之情", "表達對政局變化的憂慮",
    "抒發對美好往事的留戀", "描寫孤獨寂寞的心境", "以酒象徵對未來的期盼與希望",
    "感嘆收復失地遙遙無期", "讚美花燈工藝的精巧", "表達對元宵佳節的歡慶",
    "描寫城市夜晚的璀璨景象", "描寫熱鬧歡樂的氣氛", "抒發孤芳自賞的情懷",
    "表達不與世俗同流的志向", "諷刺南宋朝廷偏安享樂", "表達渴望融入人群的心願",
    "宋詞一律以婉約風格寫成", "詞牌決定了詞的內容和主題",
}


def has_generic_distractors(wrong_opts):
    return sum(1 for o in wrong_opts if o["text"].strip() in GENERIC_DISTRACTORS) >= 2


def has_list_format_issue(correct_text, wrong_opts):
    list_pattern = re.compile(r"[：:].*[①②③]")
    c_has = bool(list_pattern.search(correct_text))
    w_has = any(bool(list_pattern.search(o["text"])) for o in wrong_opts)
    return c_has and not w_has


def has_vocab_format_issue(correct_text, wrong_opts):
    wrong_with_dash = sum(1 for o in wrong_opts if "——" in o["text"])
    correct_has_dash = "——" in correct_text
    if wrong_with_dash >= 2 and not correct_has_dash:
        return "add_dash_to_correct"
    if correct_has_dash and wrong_with_dash == 0:
        return "remove_dash_from_correct"
    return None


def has_quote_only_issue(correct_text, wrong_opts):
    c_q = has_quotes(correct_text)
    w_q = [has_quotes(o["text"]) for o in wrong_opts]
    if c_q and not any(w_q):
        return "strip_quotes_from_correct"
    if not c_q and all(w_q):
        return "add_context"  # rare, skip
    return None


# ── fix functions ─────────────────────────────────────────────────────────

def strip_book_quotes(text: str) -> str:
    """Remove 「」 quotes (but keep 《》 book titles as they're standard)."""
    return re.sub(r"[「」『』]", "", text)


def deactivate_question(qid: str):
    """Set is_active = false."""
    if DRY_RUN:
        return
    sb.table("dsemcq_questions").update({"is_active": False}).eq("id", qid).execute()


def update_option_text(opt_id: str, new_text: str):
    """Update option text."""
    if DRY_RUN:
        return
    sb.table("dsemcq_question_options").update({"text": new_text}).eq("id", opt_id).execute()


# ── main ──────────────────────────────────────────────────────────────────

def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Fetching all questions and options...")
    questions = fetch_all("dsemcq_questions", "id,stem,passage_id,is_active")
    options   = fetch_all("dsemcq_question_options", "id,question_id,label,text,is_correct")

    qmap = {}
    for q in questions:
        if not q.get("is_active", True):
            continue
        qmap[q["id"]] = {"stem": q["stem"], "passage_id": q.get("passage_id"), "options": []}
    for o in options:
        if o["question_id"] in qmap:
            qmap[o["question_id"]]["options"].append(o)
    for q in qmap.values():
        q["options"].sort(key=lambda x: x.get("label") or "")

    print(f"Loaded {len(qmap)} active questions\n")

    stats = defaultdict(int)
    changes_log = []

    for qid, q in sorted(qmap.items()):
        opts = q["options"]
        if len(opts) < 3:
            continue
        correct = [o for o in opts if o["is_correct"]]
        wrong   = [o for o in opts if not o["is_correct"]]
        if len(correct) != 1:
            continue
        c_opt = correct[0]

        # ── 1. Generic distractors → deactivate ──────────────────────
        if has_generic_distractors(wrong):
            stats["deactivated_generic"] += 1
            changes_log.append({
                "action": "DEACTIVATE",
                "reason": "generic_distractors",
                "qid": qid,
                "stem": q["stem"][:60],
            })
            deactivate_question(qid)
            continue

        # ── 2. List format in correct → deactivate ───────────────────
        if has_list_format_issue(c_opt["text"], wrong):
            stats["deactivated_list"] += 1
            changes_log.append({
                "action": "DEACTIVATE",
                "reason": "list_format_correct",
                "qid": qid,
                "stem": q["stem"][:60],
            })
            deactivate_question(qid)
            continue

        # ── 3. Vocab format mismatch → normalize ─────────────────────
        vocab_issue = has_vocab_format_issue(c_opt["text"], wrong)
        if vocab_issue == "add_dash_to_correct":
            # Wrong opts have ——explanation, correct doesn't
            # Strategy: remove "——..." suffix from wrong options
            for o in wrong:
                if "——" in o["text"]:
                    new_text = o["text"].split("——")[0]
                    if cjk_len(new_text) >= 2:  # ensure meaningful text remains
                        stats["fixed_vocab_strip_dash"] += 1
                        changes_log.append({
                            "action": "FIX_OPTION",
                            "reason": "strip_dash_from_wrong",
                            "opt_id": o["id"],
                            "old": o["text"],
                            "new": new_text,
                        })
                        update_option_text(o["id"], new_text)
            continue

        if vocab_issue == "remove_dash_from_correct":
            # Correct has —— but wrongs don't → replace —— with ， to normalize format
            new_text = c_opt["text"].replace("——", "，", 1)
            if new_text != c_opt["text"]:
                stats["fixed_vocab_replace_correct_dash"] += 1
                changes_log.append({
                    "action": "FIX_OPTION",
                    "reason": "replace_dash_in_correct",
                    "opt_id": c_opt["id"],
                    "old": c_opt["text"],
                    "new": new_text,
                })
                update_option_text(c_opt["id"], new_text)
            continue

        # ── 4. Quote-only issue → strip quotes from correct ──────────
        quote_issue = has_quote_only_issue(c_opt["text"], wrong)
        if quote_issue == "strip_quotes_from_correct":
            new_text = strip_book_quotes(c_opt["text"])
            if new_text != c_opt["text"]:
                stats["fixed_quote"] += 1
                changes_log.append({
                    "action": "FIX_OPTION",
                    "reason": "strip_quotes_from_correct",
                    "opt_id": c_opt["id"],
                    "old": c_opt["text"],
                    "new": new_text,
                })
                update_option_text(c_opt["id"], new_text)
            continue

    # ── Report ────────────────────────────────────────────────────────────
    print("=" * 80)
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}FIX SUMMARY")
    print("=" * 80)
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")
    total_deactivated = stats.get("deactivated_generic", 0) + stats.get("deactivated_list", 0)
    total_fixed = (stats.get("fixed_vocab_strip_dash", 0) +
                   stats.get("fixed_vocab_replace_correct_dash", 0) +
                   stats.get("fixed_quote", 0))
    print(f"\n  TOTAL deactivated: {total_deactivated}")
    print(f"  TOTAL options fixed: {total_fixed}")

    # Save log
    log_path = Path(__file__).parent.parent.parent / "audit_reports" / "fix_obvious_log.json"
    log_path.parent.mkdir(exist_ok=True)
    with open(log_path, "w", encoding="utf-8") as fp:
        json.dump(changes_log, fp, ensure_ascii=False, indent=2)
    print(f"\n  Change log saved to {log_path}")


if __name__ == "__main__":
    main()
