"""
Identify cross-passage questions (tagged t-comparison) and backfill cross_passage_id.

Detection strategy:
1. Find all questions with t-comparison tag
2. For each, check the stem + option text for passage title keywords
3. If a second passage (different from passage_id) is mentioned, assign cross_passage_id

This is a DRY RUN by default. Set DRY_RUN = False to actually update.
"""
from pathlib import Path
from dotenv import load_dotenv
import os, json

load_dotenv(Path(__file__).parent / ".env")

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = False  # Set to False to actually update

# Passage keywords (from dse_reference.py)
PASSAGE_KEYWORDS: dict[str, list[str]] = {
    "p01": ["論仁、論孝、論君子", "論仁論孝", "論語"],
    "p02": ["魚我所欲也", "魚我所欲"],
    "p03": ["逍遙遊"],
    "p04": ["勸學"],
    "p05": ["廉頗藺相如列傳", "廉頗藺相如", "廉頗", "藺相如"],
    "p06": ["出師表"],
    "p07": ["師說"],
    "p08": ["始得西山宴遊記", "始得西山", "西山宴遊"],
    "p09": ["岳陽樓記", "岳陽樓"],
    "p10": ["六國論"],
    "p11": ["唐詩三首", "月下獨酌", "登樓", "山居秋暝"],
    "p12": ["宋詞三首", "念奴嬌", "聲聲慢", "青玉案"],
}

# Also match passage titles from DB
PASSAGE_TITLES: dict[str, str] = {}


def fetch_all(query_builder):
    all_rows = []
    offset = 0
    while True:
        resp = query_builder.range(offset, offset + 999).execute()
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return all_rows


def detect_passages_in_text(text: str, exclude_pid: str | None = None) -> list[str]:
    """Find all passage IDs mentioned in text via keyword matching."""
    found = []
    for pid, keywords in PASSAGE_KEYWORDS.items():
        if pid == exclude_pid:
            continue
        for kw in keywords:
            if kw in text:
                found.append(pid)
                break
    # Also check DB titles
    for pid, title in PASSAGE_TITLES.items():
        if pid == exclude_pid or pid in found:
            continue
        if title in text:
            found.append(pid)
    return found


def main():
    # Load passage titles from DB
    passages = sb.table("dsemcq_passages").select("id,title").execute().data or []
    for p in passages:
        PASSAGE_TITLES[p["id"]] = p["title"]
    print(f"Loaded {len(passages)} passages\n")

    # Find all questions with t-comparison tag
    tag_rows = fetch_all(
        sb.table("dsemcq_question_tags").select("question_id,tag_id").eq("tag_id", "t-comparison")
    )
    comparison_qids = [r["question_id"] for r in tag_rows]
    print(f"Found {len(comparison_qids)} questions with t-comparison tag\n")

    if not comparison_qids:
        print("No cross-passage questions found.")
        return

    # Fetch those questions
    q_rows = fetch_all(
        sb.table("dsemcq_questions")
        .select("id,passage_id,cross_passage_id,stem")
        .in_("id", comparison_qids)
    )

    # Also fetch options for richer text matching
    opt_rows = fetch_all(
        sb.table("dsemcq_question_options")
        .select("question_id,text,explanation")
        .in_("question_id", comparison_qids)
    )
    opts_by_q: dict[str, list[dict]] = {}
    for o in opt_rows:
        opts_by_q.setdefault(o["question_id"], []).append(o)

    # Analyze each
    already_set = 0
    detected = 0
    ambiguous = 0
    no_match = 0
    updates: list[dict] = []

    for q in q_rows:
        qid = q["id"]
        pid = q.get("passage_id")
        existing_cross = q.get("cross_passage_id")

        if existing_cross:
            already_set += 1
            continue

        # Build full text for matching
        full_text = q.get("stem", "")
        for opt in opts_by_q.get(qid, []):
            full_text += " " + (opt.get("text", "") or "")
            full_text += " " + (opt.get("explanation", "") or "")

        other_passages = detect_passages_in_text(full_text, exclude_pid=pid)

        if len(other_passages) == 1:
            cross_pid = other_passages[0]
            detected += 1
            updates.append({"id": qid, "passage_id": pid, "cross_passage_id": cross_pid, "stem_preview": q["stem"][:60]})
            print(f"  ✅ {qid} ({pid}) → cross: {cross_pid}")
            print(f"     stem: {q['stem'][:80]}")
        elif len(other_passages) > 1:
            ambiguous += 1
            # Pick the most specific match (first one is fine — keywords are ordered by specificity)
            cross_pid = other_passages[0]
            updates.append({"id": qid, "passage_id": pid, "cross_passage_id": cross_pid, "stem_preview": q["stem"][:60]})
            print(f"  ⚠️  {qid} ({pid}) → cross: {cross_pid} (ambiguous: {other_passages})")
            print(f"     stem: {q['stem'][:80]}")
        else:
            no_match += 1
            print(f"  ❌ {qid} ({pid}) → no second passage detected")
            print(f"     stem: {q['stem'][:80]}")

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Total t-comparison questions: {len(q_rows)}")
    print(f"  Already have cross_passage_id: {already_set}")
    print(f"  Detected (single match):       {detected}")
    print(f"  Detected (ambiguous, took 1st): {ambiguous}")
    print(f"  No match found:                {no_match}")
    print(f"  To update:                     {len(updates)}")

    if not updates:
        print("\nNothing to update.")
        return

    if DRY_RUN:
        print(f"\n🧪 DRY RUN — no changes written. Set DRY_RUN = False to apply.")
    else:
        print(f"\n💾 Applying {len(updates)} updates...")
        for u in updates:
            sb.table("dsemcq_questions").update(
                {"cross_passage_id": u["cross_passage_id"]}
            ).eq("id", u["id"]).execute()
            print(f"  Updated {u['id']} → cross_passage_id={u['cross_passage_id']}")
        print(f"\n✅ Done — {len(updates)} questions updated.")


if __name__ == "__main__":
    main()
