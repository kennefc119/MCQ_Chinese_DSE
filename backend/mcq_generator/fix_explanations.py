#!/usr/bin/env python3
"""
One-off script: Rewrite all existing question explanations in the DB so that
they do NOT reference A/B/C/D labels.  Instead, they directly quote option text.

Usage (from backend/mcq_generator/):
    python fix_explanations.py           # dry-run (print changes, no writes)
    python fix_explanations.py --apply   # write changes to Supabase
"""
from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Allow importing mcq_gen without installing the package
sys.path.insert(0, str(Path(__file__).parent))

from mcq_gen.config import settings
from mcq_gen.db.client import fetch_all, get_supabase
from mcq_gen.llm import chat_structured

from pydantic import BaseModel


# ── Output schema for the rewrite LLM call ───────────────────────────────────

class RewrittenExplanation(BaseModel):
    explanation: str


# ── Helpers ───────────────────────────────────────────────────────────────────

_LABEL_PATTERN = re.compile(r"(?:選項|答案[是為選]?|因此|故)?\s*[ABCD][，。\s：:]")


def _likely_has_labels(text: str) -> bool:
    """Return True if the explanation probably references A/B/C/D as option labels."""
    return bool(_LABEL_PATTERN.search(text))


def _build_rewrite_prompt(stem: str, options: list[dict], old_explanation: str) -> str:
    opts_text = "\n".join(
        f"  {'✅' if o['is_correct'] else '❌'} {o['text']}"
        for o in options
    )
    return f"""你是一名 DSE 中文科審題主任，請幫我重寫以下 MC 題目的解釋文字。

## 題幹
{stem}

## 選項（✅ = 正確答案）
{opts_text}

## 現有解釋（需要重寫）
{old_explanation}

## 重寫要求
1. **嚴禁使用 A、B、C、D 字母**指代選項——選項在應用程式中每次加載都會重新排序，字母毫無意義。
2. 必須**直接引用選項文字**，例如：「『不為外物及一己際遇而喜悲』正確，因為…」
3. 先說明正確答案為何正確（引用正確選項文字），再逐一說明每個干擾項為何錯誤。
4. 每個選項解釋之間用 `<br>` 分隔。
5. 保持繁體中文，語氣正式，符合 DSE 水準。
6. 長度與現有解釋大致相同，毋須加入全新分析。

請輸出嚴格 JSON，不要加任何 markdown code block 或多餘文字：
{{"explanation": "重寫後的解釋文字"}}"""


# ── Main ──────────────────────────────────────────────────────────────────────

def main(apply: bool) -> None:
    sb = get_supabase()

    print("Fetching questions…")
    q_rows = fetch_all(
        sb.table("dsemcq_questions")
        .select("id, stem, explanation")
    )
    print(f"  Total questions: {len(q_rows)}")

    q_ids = [r["id"] for r in q_rows]
    if not q_ids:
        print("No questions found.")
        return

    print("Fetching options…")
    q_id_set = set(q_ids)
    all_opt_rows = fetch_all(
        sb.table("dsemcq_question_options")
        .select("id, question_id, text, is_correct, label")
        .order("id")
    )
    opt_rows = [o for o in all_opt_rows if o["question_id"] in q_id_set]

    # Group options by question_id, sorted by ID (preserves A/B/C/D order for old questions)
    opts_by_q: dict[str, list[dict]] = {}
    for o in opt_rows:
        opts_by_q.setdefault(o["question_id"], []).append(o)

    to_process = [r for r in q_rows if _likely_has_labels(r.get("explanation", ""))]
    print(f"  Questions with A/B/C/D label references: {len(to_process)}")

    if not to_process:
        print("Nothing to update — all explanations already label-free.")
        return

    updated = 0
    skipped = 0

    for i, q in enumerate(to_process, 1):
        qid = q["id"]
        stem = q["stem"]
        old_expl = q["explanation"] or ""
        opts = opts_by_q.get(qid, [])

        if not opts:
            print(f"[{i}/{len(to_process)}] {qid}: SKIP (no options found)")
            skipped += 1
            continue

        print(f"[{i}/{len(to_process)}] Rewriting {qid}…", end=" ", flush=True)

        try:
            result = chat_structured(
                system_prompt="你是一名 DSE 中文科審題主任，負責重寫 MC 題目的解釋文字，確保解釋不使用 A/B/C/D 字母指代選項。",
                user_message=_build_rewrite_prompt(stem, opts, old_expl),
                schema=RewrittenExplanation,
                temperature=0.3,
            )
            new_expl = result.explanation.strip()
        except Exception as exc:
            print(f"ERROR: {exc}")
            skipped += 1
            continue

        if apply:
            sb.table("dsemcq_questions").update({"explanation": new_expl}).eq("id", qid).execute()
            print("✅ updated")
        else:
            print("(dry-run)")
            print(f"  OLD: {old_expl[:120]}…")
            print(f"  NEW: {new_expl[:120]}…")
            print()

        updated += 1

    print(f"\nDone. updated={updated}, skipped={skipped}, apply={apply}")
    if not apply and updated > 0:
        print("Re-run with --apply to commit changes to Supabase.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rewrite MC explanations to remove A/B/C/D label references.")
    parser.add_argument("--apply", action="store_true", help="Write changes to Supabase (default: dry-run)")
    args = parser.parse_args()
    main(apply=args.apply)
