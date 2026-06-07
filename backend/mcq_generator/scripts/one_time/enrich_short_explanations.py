#!/usr/bin/env python3
"""
Enrich too-short option explanations using GPT-4o-mini.
Groups by question so the LLM sees full context (stem + all options).

Usage:
  python enrich_short_explanations.py             # preview only
  python enrich_short_explanations.py --apply      # write to Supabase
  python enrich_short_explanations.py --resume     # resume from checkpoint
"""

import argparse
import json
import os
import time
from collections import defaultdict
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_KEY = os.environ["OPENAI_API_KEY"]

REPORT_DIR = Path(__file__).parent.parent.parent / "audit_reports"
CHECKPOINT_FILE = REPORT_DIR / "enrich_checkpoint.json"
MIN_EXPLANATION_LEN = 15

SYSTEM_PROMPT = """你是DSE中國語文科的資深教師，負責為選擇題的每個選項撰寫解釋。

要求：
1. 解釋須清楚說明該選項為何正確或錯誤
2. 需引用原文或具體理由，讓學生明白背後的邏輯
3. 長度約40-80字，簡明扼要但有足夠內容
4. 語氣平實，適合中學生閱讀
5. 錯誤選項的解釋應指出錯在哪裏，並說明正確理解是甚麼
6. 正確選項的解釋應說明為何此選項最準確

回覆格式（純JSON，不加markdown）：
{
  "option_id_1": "enriched explanation",
  "option_id_2": "enriched explanation"
}"""

USER_TEMPLATE = """題目：{stem}

選項：
{options_text}

以下選項的解釋太簡短，請為它們撰寫更詳盡的解釋：
{short_options}

請為上述每個選項撰寫更充實的解釋。"""


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


def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_checkpoint(data):
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = OpenAI(api_key=OPENAI_KEY)

    print("Fetching data...")
    questions = fetch_all(sb, "dsemcq_questions", "id, passage_id, stem")
    options = fetch_all(sb, "dsemcq_question_options", "id, question_id, label, text, is_correct, explanation")
    print(f"  {len(questions)} questions, {len(options)} options")

    q_map = {q["id"]: q for q in questions}
    opts_by_q = defaultdict(list)
    for o in options:
        opts_by_q[o["question_id"]].append(o)

    # Find short explanations
    short_opts = []
    for o in options:
        expl = (o["explanation"] or "").strip()
        if len(expl) < MIN_EXPLANATION_LEN:
            short_opts.append(o)

    # Group by question
    short_by_q = defaultdict(list)
    for o in short_opts:
        short_by_q[o["question_id"]].append(o)

    print(f"  {len(short_opts)} short explanations across {len(short_by_q)} questions")

    # Load checkpoint
    checkpoint = load_checkpoint() if args.resume else {}
    enriched_all = dict(checkpoint)

    remaining_qs = [qid for qid in short_by_q if qid not in checkpoint]
    print(f"  {len(remaining_qs)} questions remaining ({len(checkpoint)} already done)")

    for i, qid in enumerate(remaining_qs):
        q_info = q_map.get(qid, {})
        stem = q_info.get("stem", "")
        all_opts = sorted(opts_by_q.get(qid, []), key=lambda x: x["label"] or x["id"])
        short_for_q = short_by_q[qid]

        # Build prompt
        options_lines = []
        for o in all_opts:
            label = o.get("label") or "?"
            text = o.get("text") or ""
            correct = " ✓" if o["is_correct"] else ""
            expl = (o.get("explanation") or "")[:100]
            options_lines.append(f"{label}. {text}{correct}\n   現有解釋：{expl}")

        short_lines = []
        for o in short_for_q:
            label = o.get("label") or "?"
            text = o.get("text") or ""
            correct = "正確" if o["is_correct"] else "錯誤"
            expl = (o.get("explanation") or "").strip()
            short_lines.append(f"- {o['id']} [{label}] {text} ({correct})\n  現有解釋：「{expl}」")

        user_msg = USER_TEMPLATE.format(
            stem=stem,
            options_text="\n".join(options_lines),
            short_options="\n".join(short_lines),
        )

        try:
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.3,
                max_tokens=1500,
            )
            content = resp.choices[0].message.content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            result = json.loads(content)
            enriched_all[qid] = result

            for opt_id, new_expl in result.items():
                print(f"  [{i+1}/{len(remaining_qs)}] {opt_id}")
                print(f"    NEW: {new_expl[:80]}...")

        except Exception as e:
            print(f"  ERROR on {qid}: {e}")
            enriched_all[qid] = {"error": str(e)}

        # Save checkpoint every 10 questions
        if (i + 1) % 10 == 0:
            save_checkpoint(enriched_all)

        time.sleep(0.3)

    save_checkpoint(enriched_all)

    # Collect all valid updates
    updates = []
    for qid, result in enriched_all.items():
        if "error" in result:
            continue
        for opt_id, new_expl in result.items():
            if new_expl and len(new_expl) >= MIN_EXPLANATION_LEN:
                updates.append({"id": opt_id, "explanation": new_expl})

    print(f"\n{'='*100}")
    print(f"Total enriched: {len(updates)} options")

    if not args.apply:
        # Show preview
        print("\nPREVIEW (first 20):")
        for u in updates[:20]:
            # Get old
            old = next((o for o in options if o["id"] == u["id"]), None)
            old_expl = (old["explanation"] or "").strip() if old else "?"
            print(f"\n  {u['id']}")
            print(f"    OLD:  {old_expl}")
            print(f"    NEW:  {u['explanation'][:100]}")
        print(f"\n** DRY RUN — {len(updates)} updates. Re-run with --apply to write. **")
        return

    # Apply
    print(f"\nApplying {len(updates)} updates...")
    ok = 0
    fail = 0
    for u in updates:
        try:
            sb.table("dsemcq_question_options").update(
                {"explanation": u["explanation"]}
            ).eq("id", u["id"]).execute()
            ok += 1
        except Exception as e:
            print(f"  FAILED {u['id']}: {e}")
            fail += 1

    print(f"Done. {ok} updated, {fail} failed.")


if __name__ == "__main__":
    main()
