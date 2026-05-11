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
from ..passage_db import get_passage_body
from ..schemas import Critique, Draft, Spec
from ..school_ws_loader import format_school_ws_block
from ..config import settings
from ..template_utils import render_template

log = structlog.get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "drafter_prompt.md"
_PROMPT_REVISION_PATH = Path(__file__).parent.parent / "prompts" / "drafter_revision_prompt.md"
_CLOSING_INITIAL_PATH = Path(__file__).parent.parent / "prompts" / "drafter_user_closing_initial.md"
_CLOSING_REVISION_PATH = Path(__file__).parent.parent / "prompts" / "drafter_user_closing_revision.md"
_INJECTION_CONFIG_PATH = Path(__file__).parent.parent / "prompts" / "injection_config.json"

_DRAFTER_DEFAULTS = {"reference_block": True, "school_ws_block": True}
_DRAFTER_REV_DEFAULTS = {"reference_block": False, "school_ws_block": False}


def _get_injection_cfg(agent_key: str) -> dict:
    """Read per-agent injection flags; falls back to hardcoded defaults."""
    defaults = {"drafter": _DRAFTER_DEFAULTS, "drafter_revision": _DRAFTER_REV_DEFAULTS}
    try:
        if _INJECTION_CONFIG_PATH.exists():
            cfg = json.loads(_INJECTION_CONFIG_PATH.read_text(encoding="utf-8"))
            return cfg.get(agent_key, defaults.get(agent_key, {}))
    except Exception:
        pass
    return defaults.get(agent_key, {})


def _build_prompt(
    spec: Spec,
    passage_text: str,
    prev_draft: Draft | None,
    critique: Critique | None,
    cross_text: str | None,
) -> str:
    cross_text_section = (
        f"\n\n## 跨篇章原文（第二篇）\n{cross_text}" if cross_text else ""
    )

    if prev_draft and critique:
        # Revision iteration — use config to decide whether to compute optional variables
        cfg_rev = _get_injection_cfg("drafter_revision")
        closing_section = _CLOSING_REVISION_PATH.read_text(encoding="utf-8").strip()

        reference_block = ""
        if cfg_rev.get("reference_block", False):
            ref_parts: list[str] = []
            primary_ref = format_reference_block(spec.passage)
            if primary_ref:
                ref_parts.append(primary_ref)
            if spec.cross_passage:
                cross_ref = format_reference_block(spec.cross_passage)
                if cross_ref:
                    ref_parts.append(f"### 跨篇章參考（{spec.cross_passage}）\n{cross_ref}")
            reference_block = ("\n\n" + "\n\n".join(ref_parts)) if ref_parts else ""

        school_ws_block = ""
        if cfg_rev.get("school_ws_block", False):
            ws = format_school_ws_block(spec.passage, spec.cross_passage)
            school_ws_block = ("\n\n" + ws) if ws else ""

        return render_template(
            _PROMPT_REVISION_PATH,
            spec_json=spec.model_dump_json(indent=2),
            passage_text=passage_text,
            cross_text_section=cross_text_section,
            reference_block=reference_block,
            school_ws_block=school_ws_block,
            closing_section=closing_section,
            prev_draft_json=prev_draft.model_dump_json(indent=2),
            critique_score=str(critique.score),
            critique_comments=critique.comments,
            critique_instructions=critique.revision_instructions,
        )

    # Initial iteration — use config to decide whether to compute optional variables
    cfg = _get_injection_cfg("drafter")

    ref_parts_init: list[str] = []
    if cfg.get("reference_block", True):
        primary_ref = format_reference_block(spec.passage)
        if primary_ref:
            ref_parts_init.append(primary_ref)
        if spec.cross_passage:
            cross_ref = format_reference_block(spec.cross_passage)
            if cross_ref:
                ref_parts_init.append(f"### 跨篇章參考（{spec.cross_passage}）\n{cross_ref}")
    reference_block = ("\n\n" + "\n\n".join(ref_parts_init)) if ref_parts_init else ""

    school_ws_block = ""
    if cfg.get("school_ws_block", True):
        ws = format_school_ws_block(spec.passage, spec.cross_passage)
        school_ws_block = ("\n\n" + ws) if ws else ""

    closing_section = _CLOSING_INITIAL_PATH.read_text(encoding="utf-8").strip()

    return render_template(
        _PROMPT_PATH,
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
    passage_text = get_passage_body(spec.passage)
    cross_text = get_passage_body(spec.cross_passage) if spec.cross_passage else None

    prompt = _build_prompt(spec, passage_text, prev_draft, critique, cross_text)

    log.info(
        "drafter_start",
        passage=spec.passage,
        skill=spec.skill_tested,
        iteration=iteration,
        is_revision=(prev_draft is not None),
    )

    draft = chat_structured(
        user_message=prompt,
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
