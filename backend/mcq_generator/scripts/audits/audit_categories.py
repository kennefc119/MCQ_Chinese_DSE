"""
Audit question category tags by analyzing stem content.
Classifies each question based on keyword patterns in the stem,
compares with the assigned tag, and fixes mismatches in the DB.

Categories (tag_id → label):
  t-meaning       字詞解釋    Word/phrase meaning
  t-comprehension  句意理解    Content comprehension
  t-theme          主旨        Theme summary
  t-rhetoric       修辭        Rhetoric techniques
  t-character      人物分析    Character analysis
  t-grammar        句式語法    Grammar / sentence structure
  t-context        背景知識    Background knowledge
  t-comparison     比較閱讀    Cross-passage comparison
"""

import os, re, json, sys
from pathlib import Path
from collections import defaultdict, Counter
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

DRY_RUN = "--dry-run" in sys.argv

def fetch_all(table, columns):
    rows, ps, off = [], 1000, 0
    while True:
        r = sb.table(table).select(columns).range(off, off + ps - 1).execute()
        rows.extend(r.data)
        if len(r.data) < ps: break
        off += ps
    return rows

# ── Classification rules ──────────────────────────────────────────────────
# Conservative: only flag when HIGH confidence the current tag is wrong.
# Each rule returns the REQUIRED tag if the stem clearly belongs to that category.
# Rules check for very specific keyword combos, not broad patterns.

def classify_stem(stem: str) -> str | None:
    """Return the best-matching tag_id, or None if uncertain."""

    # ── 1. 跨篇章比較 — mentions multiple passages/authors explicitly ────
    #    Must be about comparing ACROSS different works, not within one passage
    cross_passage_patterns = [
        r"跨篇章",
        r"(?:比較|對比).*[兩三](?:篇|首)",
        r"[兩三](?:篇|首).*(?:比較|不同|共同|各自)",
        r"(?:《[^》]+》).*(?:《[^》]+》).*(?:比較|不同|相同|異同|共同)",
        r"三首詞.*(?:比較|不同|相同|異同|各自|各有|共同)",
        r"三位作者.*(?:比較|不同|各自|各有)",
    ]
    for p in cross_passage_patterns:
        if re.search(p, stem):
            return "t-comparison"

    # ── 2. 修辭手法 — explicitly about rhetoric techniques ───────────────
    #    Must mention 修辭/手法/technique names explicitly
    rhetoric_patterns = [
        r"(?:修辭|寫作|表達|抒情|論證|說理)手法",
        r"運用了(?:甚麼|什麼|哪[一種個]).*(?:手法|修辭|技巧)",
        r"(?:甚麼|什麼|哪[一種個]).*(?:修辭|手法)",
        r"(?:比喻|明喻|暗喻|借喻|排比|對偶|對比|襯托|反襯|誇張|擬人|借代|反問|設問|反語|反復|頂真|疊字|互文|起興|用典).*(?:手法|效果|作用)",
        r"以.*(?:喻|比|襯).*(?:說明|突出|表達|反映)",
    ]
    for p in rhetoric_patterns:
        if re.search(p, stem):
            return "t-rhetoric"

    # ── 3. 句式語法 — about grammar, sentence structure, function words ──
    grammar_patterns = [
        r"句式",
        r"語[法序]",
        r"倒裝",
        r"被動[句式]",
        r"判斷句",
        r"省略句",
        r"[「『][之而於以者所乎焉其為矣哉也][」』].*(?:字|的).*(?:用法|功能|作用)",
        r"[「『][^」』]{1,2}[」』]字的用法",
        r"虛詞.*(?:用法|功能|語氣)",
        r"(?:連詞|介詞|助詞|代詞|副詞|語氣詞).*(?:用法|功能)",
        r"詞性",
        r"詞類活用",
        r"名詞用作",
        r"動詞用作",
        r"形容詞用作",
        r"活用為(?:動詞|名詞|形容詞|副詞)",
        r"[「『][^」』]+[」』]中.*[「『][^」』]{1,2}[」』].*(?:用法|詞性)",
    ]
    for p in grammar_patterns:
        if re.search(p, stem):
            return "t-grammar"

    # ── 4. 人物分析 — character traits, image, personality ────────────────
    character_patterns = [
        r"(?:人物|作者).*(?:形象|特[點徵色]|性格|品[格質德])",
        r"(?:形象|性格|品[格質德]).*(?:人物|作者)",
        r"塑造.*(?:形象|人物)",
        r"甚麼(?:形象|性格)",
        r"(?:為人|待人).*(?:態度|方式|特[點徵])",
    ]
    for p in character_patterns:
        if re.search(p, stem):
            return "t-character"

    # ── 5. 背景知識 — historical/biographical background ─────────────────
    context_patterns = [
        r"背景知識",
        r"(?:寫作|創作|歷史|時代)背景",
        r"(?:哪個|甚麼|什麼).*(?:朝代|時期|年代|時代)",
        r"(?:烏台詩案|靖康之變|安史之亂)",
        r"(?:科舉|古文運動|新法|變法|黨爭)",
        r"(?:儒家|道家|法家|墨家|名家).*(?:思想|學說|主張)",
        r"性善論|性惡論",
        r"(?:紀傳體|編年體|國別體)",
        r"詞牌",
        r"(?:豪放派|婉約派)",
        r"(?:甚麼|什麼)(?:節日|事件|戰役)",
        r"生平|人生經歷",
        r"(?:出身|籍貫|身世)",
        r"四書",
        r"五經",
        r"《論語》.*(?:編纂|成書|屬於|是.*書)",
        r"《孟子》.*(?:編纂|成書|屬於|是.*書)",
        r"語言風格",
    ]
    for p in context_patterns:
        if re.search(p, stem):
            return "t-context"

    # ── 6. 主旨歸納 — theme, central idea ────────────────────────────────
    theme_patterns = [
        r"主旨",
        r"主題",
        r"中心(?:思想|論點|觀點)",
        r"核心(?:觀點|思想|論點|精神)",
        r"全[文篇詞].*(?:要旨|大意|立場|觀點)",
        r"歸納.*(?:要旨|中心|觀點)",
    ]
    for p in theme_patterns:
        if re.search(p, stem):
            return "t-theme"

    # ── 7. 字詞解釋 — specific word/phrase meaning ───────────────────────
    #    Very tight: quoted word + explicit meaning question, no rhetoric/grammar keywords
    meaning_patterns = [
        r"[「『][^」』]{1,8}[」』].*(?:的意思|的含義|是甚麼意思|是什麼意思|解作甚麼|解作什麼|指甚麼|指什麼)(?!.*(?:修辭|手法|用法|句式))",
        r"(?:甚麼|什麼)意思.*[「『][^」』]+[」』]",
        r"古今異義",
        r"通假字",
    ]
    for p in meaning_patterns:
        if re.search(p, stem):
            # Double-check: if rhetoric or grammar keywords present, skip
            if re.search(r"修辭|手法|論證|用法|句式|語法|詞性", stem):
                continue
            return "t-meaning"

    # ── 8. 內容理解 — general comprehension (catch-all, only for clear cases)
    #    Exclude if question is about word meaning/explanation
    comprehension_patterns = [
        r"根據.*(?:下列|以下).*(?:哪[一項個]|何者).*(?:正確|恰當|貼切|準確)",
        r"下列.*(?:哪[一項個]|何者).*(?:正確|恰當|貼切|準確)",
    ]
    for p in comprehension_patterns:
        if re.search(p, stem):
            # Don't override if question is specifically about word meaning
            if re.search(r"(?:詞語|字詞|加點|文言字詞).*(?:解釋|意思|含義)", stem):
                return "t-meaning"
            return "t-comprehension"

    # No confident match — return None (leave current tag)
    return None


def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Auditing question category tags...\n")

    questions = fetch_all("dsemcq_questions", "id,stem,passage_id,is_active")
    q_tags_raw = fetch_all("dsemcq_question_tags", "question_id,tag_id")

    active_qs = {q["id"]: q for q in questions if q.get("is_active", True)}
    print(f"Active questions: {len(active_qs)}")

    # Build current tag map: question_id → tag_id
    current_tags = {}
    for qt in q_tags_raw:
        if qt["question_id"] in active_qs:
            current_tags[qt["question_id"]] = qt["tag_id"]

    tagged = set(current_tags.keys())
    untagged = set(active_qs.keys()) - tagged
    print(f"Tagged: {len(tagged)}, Untagged: {len(untagged)}")

    # Classify all active questions
    mismatches = []
    unclassified = []
    correct_count = 0
    new_tags = []  # for untagged questions

    for qid, q in sorted(active_qs.items()):
        predicted = classify_stem(q["stem"])
        current = current_tags.get(qid)

        if predicted is None:
            if current is None:
                unclassified.append(qid)
            continue

        if current is None:
            # Untagged → assign predicted
            new_tags.append({"qid": qid, "predicted": predicted, "stem": q["stem"]})
        elif current != predicted:
            mismatches.append({
                "qid": qid,
                "passage_id": q["passage_id"],
                "stem": q["stem"],
                "current_tag": current,
                "predicted_tag": predicted,
            })
        else:
            correct_count += 1

    print(f"\nCorrectly tagged: {correct_count}")
    print(f"Mismatches: {len(mismatches)}")
    print(f"Untagged (now classified): {len(new_tags)}")
    print(f"Unclassified (no rule match): {len(unclassified)}")

    # ── Mismatch breakdown ────────────────────────────────────────────────
    if mismatches:
        print(f"\n{'='*80}")
        print("MISMATCH BREAKDOWN")
        print(f"{'='*80}")
        transition_counts = Counter()
        for m in mismatches:
            transition_counts[(m["current_tag"], m["predicted_tag"])] += 1

        for (old, new), cnt in transition_counts.most_common():
            print(f"  {old} → {new}: {cnt}")

        print(f"\n--- Sample mismatches (first 20) ---")
        for m in mismatches[:20]:
            print(f"  [{m['qid']}] {m['current_tag']} → {m['predicted_tag']}")
            print(f"    {m['stem'][:100]}")
            print()

    # ── Apply fixes ───────────────────────────────────────────────────────
    fix_count = 0

    # Fix mismatches: delete old tag, insert new tag
    for m in mismatches:
        fix_count += 1
        if not DRY_RUN:
            # Delete the old tag assignment
            sb.table("dsemcq_question_tags").delete().eq(
                "question_id", m["qid"]
            ).eq("tag_id", m["current_tag"]).execute()
            # Insert the new tag (skip if already exists)
            try:
                sb.table("dsemcq_question_tags").insert(
                    {"question_id": m["qid"], "tag_id": m["predicted_tag"]}
                ).execute()
            except Exception:
                pass  # already has this tag

    # Add tags for untagged questions
    for nt in new_tags:
        fix_count += 1
        if not DRY_RUN:
            sb.table("dsemcq_question_tags").insert(
                {"question_id": nt["qid"], "tag_id": nt["predicted"]}
            ).execute()

    print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Total fixes applied: {fix_count}")
    print(f"  Tag updates (mismatches): {len(mismatches)}")
    print(f"  Tag inserts (untagged):   {len(new_tags)}")

    # ── Save log ──────────────────────────────────────────────────────────
    log = {
        "mismatches": mismatches,
        "new_tags": new_tags,
        "unclassified_count": len(unclassified),
    }
    log_path = Path(__file__).parent.parent.parent / "audit_reports" / "category_audit_log.json"
    log_path.parent.mkdir(exist_ok=True)
    with open(log_path, "w", encoding="utf-8") as fp:
        json.dump(log, fp, ensure_ascii=False, indent=2)
    print(f"Log saved to {log_path}")


if __name__ == "__main__":
    main()
