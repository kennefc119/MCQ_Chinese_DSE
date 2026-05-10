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
from ..config import settings
from ..template_utils import render_template

log = structlog.get_logger(__name__)

_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "drafter.md"
_USER_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "drafter_user.md"
_CLOSING_INITIAL_PATH = Path(__file__).parent.parent / "prompts" / "drafter_user_closing_initial.md"
_CLOSING_REVISION_PATH = Path(__file__).parent.parent / "prompts" / "drafter_user_closing_revision.md"
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
    # Optional sections — prepend separator if non-empty
    cross_text_section = (
        f"\n\n## 跨篇章原文（第二篇）\n{cross_text}" if cross_text else ""
    )

    ref_parts: list[str] = []
    primary_ref = format_reference_block(spec.passage)
    if primary_ref:
        ref_parts.append(primary_ref)
    if spec.cross_passage:
        cross_ref = format_reference_block(spec.cross_passage)
        if cross_ref:
            ref_parts.append(f"### 跨篇章參考（{spec.cross_passage}）\n{cross_ref}")
    reference_block = ("\n\n" + "\n\n".join(ref_parts)) if ref_parts else ""

    ws = format_school_ws_block(spec.passage, spec.cross_passage)
    school_ws_block = ("\n\n" + ws) if ws else ""

    if prev_draft and critique:
        closing_section = render_template(
            _CLOSING_REVISION_PATH,
            prev_draft_json=prev_draft.model_dump_json(indent=2),
            critique_score=str(critique.score),
            critique_comments=critique.comments,
            critique_instructions=critique.revision_instructions,
        )
    else:
        closing_section = _CLOSING_INITIAL_PATH.read_text(encoding="utf-8").strip()

    return render_template(
        _USER_TEMPLATE_PATH,
        spec_json=spec.model_dump_json(indent=2),
        passage_text=passage_text,
        cross_text_section=cross_text_section,
        reference_block=reference_block,
        school_ws_block=school_ws_block,
        closing_section=closing_section,
    )


def run_drafter(
    spec: Spec,
    prev_draft: Draft | None = None,
    critique: Critique | None = None,
    iteration: int = 0,
) -> Draft:
    """呼叫出題員，回傳一個 Draft。"""
    system_prompt = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")

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
        model=settings.drafter_bot,
    )

    log.info(
        "drafter_done",
        passage=spec.passage,
        correct_idx=next((i for i, o in enumerate(draft.options) if o.is_correct), -1),
        stem_preview=draft.question_stem[:60],
    )
    return draft
