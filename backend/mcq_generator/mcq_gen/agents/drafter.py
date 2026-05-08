"""
Agent 2：出題員
接收 Spec + 課文原文（+ 可選 revision feedback）→ 輸出 Draft。
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from ..dse_reference import format_reference_block
from ..llm import chat_structured
from ..schemas import Critique, Draft, Spec
from ..school_ws_loader import format_school_ws_block

log = structlog.get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "drafter.md"
_PASSAGES_FILE = Path(__file__).parent.parent.parent / "data" / "passages.json"


def _load_passage_text(passage_id: str) -> str:
    """從 data/passages.json 讀取課文全文。"""
    if not _PASSAGES_FILE.exists():
        raise FileNotFoundError(
            f"找不到課文資料檔：{_PASSAGES_FILE}\n"
            "請先執行 `mcq-gen fetch-passages` 從 Supabase 拉取課文。"
        )
    passages = json.loads(_PASSAGES_FILE.read_text(encoding="utf-8"))
    entry = passages.get(passage_id)
    if not entry:
        raise KeyError(f"找不到篇章 {passage_id}，請確認 passages.json 包含此 ID。")
    return entry.get("body", "")


def _build_user_message(
    spec: Spec,
    passage_text: str,
    prev_draft: Draft | None,
    critique: Critique | None,
    cross_text: str | None,
) -> str:
    parts = [
        "## 題目需求規格 (spec)",
        f"```json\n{spec.model_dump_json(indent=2)}\n```",
        "",
        "## 主篇章原文",
        passage_text,
    ]
    if cross_text:
        parts += ["", "## 跨篇章原文（第二篇）", cross_text]

    # Inject past DSE reference questions for style/difficulty calibration
    reference_block = format_reference_block(spec.passage)
    if reference_block:
        parts += ["", reference_block]
    if spec.cross_passage:
        cross_ref = format_reference_block(spec.cross_passage)
        if cross_ref:
            parts += ["", f"### 跨篇章參考（{spec.cross_passage}）", cross_ref]

    # Inject school worksheet summary + relevant teacher worksheets
    school_ws_block = format_school_ws_block(spec.passage, spec.cross_passage)
    if school_ws_block:
        parts += ["", school_ws_block]

    if prev_draft and critique:
        parts += [
            "",
            "## 你之前的草稿",
            f"```json\n{prev_draft.model_dump_json(indent=2)}\n```",
            "",
            "## 審題主任的意見",
            f"**評分**: {critique.score}/10",
            f"**評語**: {critique.comments}",
            f"**修改指示**: {critique.revision_instructions}",
            "",
            "⚠️ 請**逐項回應**所有修改指示，輸出改進後的完整 MC 題目。",
        ]
    else:
        parts.append("\n請根據規格和篇章原文，輸出一條完整的 MC 題目。")

    return "\n".join(parts)


def run_drafter(
    spec: Spec,
    prev_draft: Draft | None = None,
    critique: Critique | None = None,
    iteration: int = 0,
) -> Draft:
    """呼叫出題員，回傳一個 Draft。"""
    system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    passage_text = _load_passage_text(spec.passage)
    cross_text = _load_passage_text(spec.cross_passage) if spec.cross_passage else None

    user_message = _build_user_message(spec, passage_text, prev_draft, critique, cross_text)

    log.info(
        "drafter_start",
        passage=spec.passage,
        skill=spec.skill_tested,
        iteration=iteration,
        is_revision=(prev_draft is not None),
    )

    draft = chat_structured(
        system_prompt=system_prompt,
        user_message=user_message,
        schema=Draft,
        temperature=0.8,
    )

    log.info(
        "drafter_done",
        passage=spec.passage,
        correct_idx=next((i for i, o in enumerate(draft.options) if o.is_correct), -1),
        stem_preview=draft.question_stem[:60],
    )
    return draft
