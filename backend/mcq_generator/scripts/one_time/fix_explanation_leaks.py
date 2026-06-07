"""
Fix option explanations that leak "工作紙" (worksheet) references.

Fetches all affected rows, applies regex-based rephrasing, previews changes,
then writes them back to Supabase.
"""

import os, re, sys, io
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv(Path(__file__).parent.parent.parent / ".env")

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# ---------------------------------------------------------------------------
# Replacement rules  — order matters (longer / more specific patterns first)
# ---------------------------------------------------------------------------
RULES: list[tuple[str, str]] = [
    # "與工作紙所列「X」及「Y」描寫一致" → remove tail
    (r"，與工作紙所列[^。，；]*", ""),
    # "與工作紙所列字義一致" → remove tail
    (r"，與工作紙[^。，；]*一致", ""),
    # "根據工作紙，" → ""
    (r"根據工作紙，", ""),
    # "工作紙「字詞解釋」明確指出" → "原文中"
    (r"工作紙「字詞解釋」明確指出", "原文中"),
    # "工作紙在" → ""
    (r"工作紙在", ""),
    # "工作紙對「X」的解釋為" → "「X」的意思是"
    (r"工作紙對「([^」]*)」的解釋為", r"「\1」的意思是"),
    # "工作紙對此詞註解亦以" → "此詞亦可解作"
    (r"工作紙對此詞註解亦以", "此詞亦可解作"),
    # "工作紙明確指出" → "文中可見"
    (r"工作紙明確指出", "文中可見"),
    # "工作紙明列為" → "此處屬"
    (r"工作紙明列為", "此處屬"),
    # "工作紙指出此處" → "此處"
    (r"工作紙指出此處", "此處"),
    # "工作紙指出此句" → "此句"
    (r"工作紙指出此句", "此句"),
    # "工作紙指出他" → "他"
    (r"工作紙指出他", "他"),
    # "工作紙指出蓮動" → "蓮動"
    (r"工作紙指出蓮動", "蓮動"),
    # "工作紙指出以" → "詩中以"
    (r"工作紙指出以", "詩中以"),
    # "原文及工作紙指出" → "原文指出"
    (r"原文及工作紙指出", "原文指出"),
    # "原文及工作紙強調" → "原文強調"
    (r"原文及工作紙強調", "原文強調"),
    # "原文與工作紙均強調" → "原文強調"
    (r"原文與工作紙均強調", "原文強調"),
    # "原文及工作紙明確將" → "原文中"
    (r"原文及工作紙明確將", "原文中"),
    # "篇章與工作紙強調" → "篇章強調"
    (r"篇章與工作紙強調", "篇章強調"),
    # "工作紙指出" generic fallback → "可見"
    (r"工作紙指出", "可見"),
    # "工作紙亦指出" → "同時"
    (r"工作紙亦指出", "同時"),
    # "工作紙亦概括為" → "意即"
    (r"工作紙亦概括為", "意即"),
    # "工作紙亦說明此為" → "此即"
    (r"工作紙亦說明此為", "此即"),
    # "工作紙亦說明" → ""
    (r"工作紙亦說明", ""),
    # "工作紙將此釋為" → "此處釋為"
    (r"工作紙將此釋為", "此處釋為"),
    # "工作紙將「X」解作" → "「X」解作"
    (r"工作紙將「([^」]*)」解作", r"「\1」解作"),
    # "工作紙將用典列於" → "用典見於"
    (r"工作紙將用典列於", "用典見於"),
    # "工作紙並指出" → "此外"
    (r"工作紙並指出", "此外"),
    # "工作紙並未指為" → "並非"
    (r"工作紙並未指為", "並非"),
    # "工作紙並無提及" → "並無提及"
    (r"工作紙並無提及", "並無提及"),
    # "又工作紙指出" → "而"
    (r"又工作紙指出", "而"),
    # "；工作紙亦指出" → "；"
    (r"；工作紙亦指出", "；"),
    # "且工作紙指出" → "且"
    (r"且工作紙指出", "且"),
    # "工作紙語譯亦以此句式說明X，" → "，"
    (r"，工作紙語譯亦以此句式說明[^，。]*，", "，"),
    # "工作紙字詞解釋亦把此詞解作" → "此詞解作"
    (r"工作紙字詞解釋亦把此詞解作", "此詞解作"),
    # "及工作紙釋義把" → "中"
    (r"及工作紙釋義把", "中"),
    # "工作紙字詞釋義將" → ""
    (r"工作紙字詞釋義將", ""),
    # "工作紙的分析中被並列為" → "可理解為"
    (r"在工作紙的分析中被並列為", "可理解為"),
    (r"工作紙的分析中被並列為", "可理解為"),
    # "工作紙對該句功能之分析" → "段落結構分析"
    (r"工作紙對該句功能之分析", "段落結構分析"),
    # "工作紙" catch-all
    (r"工作紙", "教材"),
    # "校本定義" → "解釋"
    (r"校本定義", "解釋"),
    (r"校本", ""),
    # "與教材分析高度一致" → ""
    (r"，與教材分析高度一致", ""),
    (r"與教材分析高度一致", ""),
]


def apply_rules(text: str) -> str:
    result = text
    for pattern, replacement in RULES:
        result = re.sub(pattern, replacement, result)
    # Cleanup artefacts
    result = re.sub(r"，，+", "，", result)
    result = re.sub(r"；；+", "；", result)
    result = re.sub(r"，。", "。", result)
    result = re.sub(r"；。", "。", result)
    return result.strip()


def main():
    dry_run = "--dry-run" in sys.argv

    rows = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            sb.table("dsemcq_question_options")
            .select("id,question_id,explanation")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows.extend(resp.data)
        if len(resp.data) < page_size:
            break
        offset += page_size

    print(f"Fetched {len(rows)} options total")

    leak_re = re.compile(r"工作紙|校本")
    hits = [r for r in rows if r.get("explanation") and leak_re.search(r["explanation"])]
    print(f"Found {len(hits)} options with leaky references\n")

    updates = []
    for h in hits:
        old = h["explanation"]
        new = apply_rules(old)
        changed = old != new
        still_leaks = leak_re.search(new)

        tag = ""
        if still_leaks:
            tag = " ⚠️  STILL LEAKS"
        if not changed:
            tag = " ⏭  NO CHANGE"

        updates.append({"id": h["id"], "old": old, "new": new, "changed": changed, "still_leaks": bool(still_leaks)})

        print(f"[{h['id']}]{tag}")
        print(f"  OLD: {old[:250]}")
        print(f"  NEW: {new[:250]}")
        print()

    remaining = sum(1 for u in updates if u["still_leaks"])
    changed_count = sum(1 for u in updates if u["changed"])
    print(f"Summary: {changed_count} changed, {remaining} still leaking")

    if dry_run:
        print("\n🔍 DRY RUN — no database writes.")
        return

    print(f"\nWriting {changed_count} updates to database...")
    success = 0
    for u in updates:
        if not u["changed"]:
            continue
        sb.table("dsemcq_question_options").update({"explanation": u["new"]}).eq("id", u["id"]).execute()
        success += 1
    print(f"✅ Updated {success} option explanations.")


if __name__ == "__main__":
    main()
