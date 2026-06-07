"""
Fix English text in question options and stems.

Targets:
1. Roman numeral stems (I/II/III) → 一/二/三  (3 questions: stems + all 4 options each)
2. English word "story" in option → remove
3. Pinyin "huán" in option → convert to Chinese
"""
import os, re, json, sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

DRY_RUN = "--dry-run" in sys.argv
changes = []

def update_option(opt_id, new_text):
    if not DRY_RUN:
        sb.table("dsemcq_question_options").update({"text": new_text}).eq("id", opt_id).execute()

def update_stem(qid, new_stem):
    if not DRY_RUN:
        sb.table("dsemcq_questions").update({"stem": new_stem}).eq("id", qid).execute()

def roman_to_chinese(text):
    """Replace Roman numeral references with Chinese numbering."""
    # Full replacements for option text patterns
    # Order matters: longest matches first to avoid partial replacements
    replacements = [
        ("I、II 和 III", "一、二和三"),
        ("只有 III", "只有三"),
        ("只有 II 和 III", "只有二和三"),
        ("只有 I 和 III", "只有一和三"),
        ("只有 I 和 II", "只有一和二"),
        ("只有 II", "只有二"),
        ("只有 I", "只有一"),
        ("III", "三"),
        ("II", "二"),
    ]
    result = text
    for old, new in replacements:
        result = result.replace(old, new)
    return result

def roman_stem_to_chinese(text):
    """Replace Roman numerals in stems: I. → 一、, II. → 二、, III. → 三、"""
    result = text
    # Replace "III." first (longest match), then "II.", then "I."
    result = re.sub(r"\bIII\.\s*", "三、", result)
    result = re.sub(r"\bII\.\s*", "二、", result)
    result = re.sub(r"\bI\.\s*", "一、", result)
    # Also handle without period: standalone III, II, I followed by newline or Chinese
    result = re.sub(r"(?<!\w)III(?!\w)", "三", result)
    result = re.sub(r"(?<!\w)II(?!\w)", "二", result)
    # Be careful with standalone I - only replace when it looks like a numeral
    # (preceded by newline or start, not part of a word)
    return result

def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Fixing English text in options and stems...\n")

    # ── 1. Fix Roman numeral questions ────────────────────────────────────
    roman_qids = ["q-ai-p03-34e8e8", "q-ai-p03-618adc", "q-ai-p03-e0a5a4"]

    for qid in roman_qids:
        # Fix stem
        q = sb.table("dsemcq_questions").select("id,stem").eq("id", qid).execute().data[0]
        old_stem = q["stem"]
        new_stem = roman_stem_to_chinese(old_stem)
        if new_stem != old_stem:
            print(f"STEM {qid}:")
            print(f"  OLD: {old_stem[:120]}")
            print(f"  NEW: {new_stem[:120]}")
            changes.append({"action": "FIX_STEM", "qid": qid, "old": old_stem, "new": new_stem})
            update_stem(qid, new_stem)

        # Fix options
        opts = sb.table("dsemcq_question_options").select("id,text").eq("question_id", qid).execute().data
        for o in opts:
            old_text = o["text"]
            new_text = roman_to_chinese(old_text)
            if new_text != old_text:
                print(f"  OPT {o['id']}: {old_text} → {new_text}")
                changes.append({"action": "FIX_OPTION", "opt_id": o["id"], "old": old_text, "new": new_text})
                update_option(o["id"], new_text)
        print()

    # ── 2. Fix "story" option ─────────────────────────────────────────────
    opt_id = "q-ai-p10-108522-opt1"
    o = sb.table("dsemcq_question_options").select("id,text").eq("id", opt_id).execute().data
    if o:
        old_text = o[0]["text"]
        # "相同——都指故事（story）" → "相同，都指故事"
        new_text = "相同，都指故事"
        print(f"ENGLISH 'story': {old_text} → {new_text}")
        changes.append({"action": "FIX_OPTION", "opt_id": opt_id, "old": old_text, "new": new_text})
        update_option(opt_id, new_text)
    print()

    # ── 3. Fix pinyin "huán" option ───────────────────────────────────────
    opt_id = "q-ai-p12-abc076-opt0"
    o = sb.table("dsemcq_question_options").select("id,text").eq("id", opt_id).execute().data
    if o:
        old_text = o[0]["text"]
        # "讀作「huán」（還是）" → "讀作「還」（粵音「環」），解作還是"
        new_text = "讀作「還」（粵音「環」），解作還是"
        print(f"PINYIN: {old_text} → {new_text}")
        changes.append({"action": "FIX_OPTION", "opt_id": opt_id, "old": old_text, "new": new_text})
        update_option(opt_id, new_text)

    # Also check sibling options for the same question for pinyin
    siblings = sb.table("dsemcq_question_options").select("id,text").eq("question_id", "q-ai-p12-abc076").execute().data
    for s in siblings:
        if s["id"] == opt_id:
            continue
        if re.search(r"[A-Za-z]{2,}", s["text"]):
            old_text = s["text"]
            # "讀作「hái」（仍然）" → "讀作「還」（粵音「晒」），解作仍然"
            if "hái" in old_text:
                new_text = "讀作「還」（粵音「咍」），解作仍然"
            else:
                new_text = re.sub(r"[A-Za-z]+", "", old_text).strip()
            print(f"PINYIN sibling: {old_text} → {new_text}")
            changes.append({"action": "FIX_OPTION", "opt_id": s["id"], "old": old_text, "new": new_text})
            update_option(s["id"], new_text)
    print()

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Total changes: {len(changes)}")

    log_path = Path(__file__).parent.parent.parent / "audit_reports" / "fix_english_log.json"
    log_path.parent.mkdir(exist_ok=True)
    with open(log_path, "w", encoding="utf-8") as fp:
        json.dump(changes, fp, ensure_ascii=False, indent=2)
    print(f"Log saved to {log_path}")

if __name__ == "__main__":
    main()
