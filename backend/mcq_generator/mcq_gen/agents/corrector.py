"""
Agent：修正員 (Corrector)
接收現有題目 + 用戶投訴 + 篇章原文 → 輸出修正後的 Draft。
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from ..db.flagged import FlaggedQuestion
from ..db.stats import _DIFFICULTY_MAP, _TAG_TO_SKILL
from ..dse_reference import format_reference_block
from ..llm import chat_structured
from ..passage_db import get_passage_body
from ..schemas import Difficulty, Draft, Skill, Spec
from ..school_ws_loader import format_school_ws_block
from ..config import settings
from ..template_utils import render_template

log = structlog.get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "corrector_prompt.md"
_INJECTION_CONFIG_PATH = Path(__file__).parent.parent / "prompts" / "injection_config.json"

_CORRECTOR_DEFAULTS = {"reference_block": True, "school_ws_block": True}


def _get_injection_cfg() -> dict:
    """Read corrector injection flags; falls back to defaults."""
    try:
        if _INJECTION_CONFIG_PATH.exists():
            cfg = json.loads(_INJECTION_CONFIG_PATH.read_text(encoding="utf-8"))
            return cfg.get("corrector", _CORRECTOR_DEFAULTS)
    except Exception:
        pass
    return dict(_CORRECTOR_DEFAULTS)


def _reconstruct_spec(fq: FlaggedQuestion) -> Spec:
    """Reconstruct a Spec from the flagged question's stored data."""
    diff_label = _DIFFICULTY_MAP.get(fq.difficulty, Difficulty.MEDIUM)

    # Determine skill from tags
    skill = Skill.COMPREHENSION  # default
    for tag_id in fq.tags:
        mapped = _TAG_TO_SKILL.get(tag_id)
        if mapped and mapped != Skill.CROSS_PASSAGE:
            skill = mapped

    # Use cross_passage_id from DB (now persisted)
    cross_passage = fq.cross_passage_id if fq.cross_passage_id else None

    return Spec(
        passage=fq.passage_id,
        cross_passage=cross_passage,
        difficulty=diff_label,
        skill_tested=skill,
        special_notes="",
        reasoning="修正流程：基於用戶投訴進行題目修正",
    )


def _format_existing_options(fq: FlaggedQuestion) -> str:
    """Format existing options into readable text."""
    lines: list[str] = []
    for i, opt in enumerate(fq.options):
        correct_marker = " ✅ [正確答案]" if opt.get("is_correct") else ""
        lines.append(f"選項 {i + 1}{correct_marker}：{opt.get('text', '')}")
        expl = opt.get("explanation", "")
        if expl:
            lines.append(f"  解釋：{expl}")
        lines.append("")
    return "\n".join(lines)


def _build_prompt(fq: FlaggedQuestion, spec: Spec, passage_text: str) -> str:
    """Build the corrector LLM prompt."""
    cross_text_section = ""
    if spec.cross_passage:
        try:
            cross_text = get_passage_body(spec.cross_passage)
            cross_text_section = f"\n\n## 跨篇章原文（第二篇）\n{cross_text}"
        except KeyError:
            pass

    cfg = _get_injection_cfg()

    school_ws_block = ""
    if cfg.get("school_ws_block", True):
        ws = format_school_ws_block(spec.passage, spec.cross_passage)
        school_ws_block = ("\n\n" + ws) if ws else ""

    reference_block = ""
    if cfg.get("reference_block", True):
        ref = format_reference_block(spec.passage)
        reference_block = ("\n\n" + ref) if ref else ""

    # Format existing options for display
    existing_options_block = _format_existing_options(fq)

    # Count user flag comments
    comments = fq.user_flag_comments or ""
    flag_count = str(fq.user_flag_count)

    return render_template(
        _PROMPT_PATH,
        spec_json=spec.model_dump_json(indent=2),
        existing_stem=fq.stem,
        existing_options_block=existing_options_block,
        flag_count=flag_count,
        user_flag_comments=comments,
        passage_text=passage_text,
        cross_text_section=cross_text_section,
        school_ws_block=school_ws_block,
        reference_block=reference_block,
    )


def run_corrector(fq: FlaggedQuestion, iteration: int = 0) -> tuple[Draft, Spec]:
    """
    呼叫修正員，回傳修正後的 Draft 及重建的 Spec。

    Returns:
        (Draft, Spec) tuple
    """
    spec = _reconstruct_spec(fq)
    passage_text = get_passage_body(fq.passage_id)
    prompt = _build_prompt(fq, spec, passage_text)

    log.info(
        "corrector_start",
        question_id=fq.question_id,
        passage=fq.passage_id,
        flag_count=fq.user_flag_count,
        iteration=iteration,
    )

    draft = chat_structured(
        user_message=prompt,
        schema=Draft,
        temperature=0.5,
        model=settings.corrector_bot,
    )

    # Override mapped_spec with the reconstructed Spec
    draft.mapped_spec = spec

    log.info(
        "corrector_done",
        question_id=fq.question_id,
        stem_preview=draft.question_stem[:60],
        iteration=iteration,
    )
    return draft, spec
