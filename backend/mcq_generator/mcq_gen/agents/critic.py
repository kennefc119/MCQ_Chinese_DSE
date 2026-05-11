"""
Agent 3：審題主任
接收 Spec + 課文 + Draft → 輸出 Critique（PASS / REVISE）。
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from ..llm import chat_structured
from ..passage_db import get_passage_body
from ..schemas import Critique, Draft, Spec
from ..school_ws_loader import format_school_ws_block
from ..config import settings
from ..template_utils import render_template

log = structlog.get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "critic_prompt.md"


def _build_prompt(spec: Spec, draft: Draft, cross_text: str | None, passage_text: str) -> str:
    cross_text_section = (
        f"\n\n## 跨篇章原文（第二篇）\n{cross_text}" if cross_text else ""
    )
    ws = format_school_ws_block(spec.passage, spec.cross_passage)
    school_ws_block = ("\n\n" + ws) if ws else ""

    return render_template(
        _PROMPT_PATH,
        spec_json=spec.model_dump_json(indent=2),
        passage_text=passage_text,
        cross_text_section=cross_text_section,
        school_ws_block=school_ws_block,
        draft_json=draft.model_dump_json(indent=2),
    )


def run_critic(spec: Spec, draft: Draft, iteration: int = 0) -> Critique:
    """呼叫審題主任，回傳 Critique。"""
    passage_text = get_passage_body(spec.passage)
    cross_text = get_passage_body(spec.cross_passage) if spec.cross_passage else None

    prompt = _build_prompt(spec, draft, cross_text, passage_text)

    log.info(
        "critic_start",
        passage=spec.passage,
        iteration=iteration,
        stem_preview=draft.question_stem[:60],
    )

    critique = chat_structured(
        user_message=prompt,
        schema=Critique,
        temperature=0.3,
        model=settings.critic_bot,
    )

    log.info(
        "critic_done",
        verdict=critique.verdict,
        score=critique.score,
        iteration=iteration,
    )
    return critique
