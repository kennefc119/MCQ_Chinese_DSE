from __future__ import annotations

import json
from pathlib import Path

import structlog

from config import settings
from live_duplicates import fetch_live_duplicate_stems
from mcq_gen.dse_reference import format_reference_block
from mcq_gen.passage_db import get_passage_body
from mcq_gen.schemas import Critique, Draft, Spec
from mcq_gen.school_ws_loader import format_school_ws_block
from mcq_gen.template_utils import render_template
from reviewer_llm import chat_structured

log = structlog.get_logger(__name__)

_PROMPT_PATH = (
    Path(__file__).parent.parent
    / "mcq_generator"
    / "mcq_gen"
    / "prompts"
    / "critic_prompt.md"
)
_INJECTION_CONFIG_PATH = _PROMPT_PATH.parent / "injection_config.json"
_CRITIC_DEFAULTS = {"reference_block": True, "school_ws_block": True}


def _get_injection_cfg() -> dict:
    try:
        if _INJECTION_CONFIG_PATH.exists():
            config = json.loads(_INJECTION_CONFIG_PATH.read_text(encoding="utf-8"))
            return config.get("critic", _CRITIC_DEFAULTS)
    except Exception:
        pass
    return dict(_CRITIC_DEFAULTS)


def _build_reviewer_prompt(
    spec: Spec,
    draft: Draft,
    *,
    passage_text: str,
    cross_text: str | None,
    current_question_id: str | None,
    user_flag_comments: str | None,
    is_correction: bool,
) -> str:
    cfg = _get_injection_cfg()
    cross_text_section = (
        f"\n\n## 跨篇章原文（第二篇）\n{cross_text}" if cross_text else ""
    )

    school_ws_block = ""
    if cfg.get("school_ws_block", True):
        worksheet = format_school_ws_block(spec.passage, spec.cross_passage)
        school_ws_block = f"\n\n{worksheet}" if worksheet else ""

    reference_parts: list[str] = []
    if cfg.get("reference_block", True):
        primary_reference = format_reference_block(spec.passage)
        if primary_reference:
            reference_parts.append(primary_reference)
        if spec.cross_passage:
            cross_reference = format_reference_block(spec.cross_passage)
            if cross_reference:
                reference_parts.append(
                    f"### 跨篇章參考（{spec.cross_passage}）\n{cross_reference}"
                )
    reference_block = (
        "\n\n" + "\n\n".join(reference_parts)
        if reference_parts
        else ""
    )

    passage_ids = [spec.passage]
    if spec.cross_passage and spec.skill_tested.value == "跨篇章比較":
        passage_ids.append(spec.cross_passage)
    duplicate_stems = fetch_live_duplicate_stems(
        passage_ids,
        spec.skill_tested.value,
        exclude_question_id=current_question_id,
    )
    if duplicate_stems:
        numbered = "\n".join(
            f"{index}. {stem}" for index, stem in enumerate(duplicate_stems, start=1)
        )
        existing_stems_block = (
            "\n\n## 即時現有題庫候選（同篇章 × 考核能力）\n"
            f"以下題幹直接取自本次審核當刻的 Supabase 題庫，共 {len(duplicate_stems)} 條。"
            "只有當草稿與候選題引用相同或高度相似句子，並且考核幾乎相同的具體概念／目標，"
            "才可判定為重複；只是同一篇章或同一技能不算重複。\n\n"
            f"{numbered}\n"
        )
    else:
        existing_stems_block = (
            "\n\n## 即時現有題庫候選（同篇章 × 考核能力）\n"
            "本次查詢沒有找到可比較的其他現有題幹。\n"
        )

    correction_block = ""
    if is_correction:
        correction_block = (
            "\n\n## 現有題目審核模式\n"
            "這是現有題目的品質審核或修正，不是全新出題。"
            "目前正在審核的題目已從候選清單排除；請只根據其他候選題判斷重複，"
            "不要因為本題原本已存在於題庫而判定重複。\n"
        )

    user_flag_comments_block = ""
    if user_flag_comments:
        user_flag_comments_block = (
            "\n\n## 審核意見（修正指令）\n"
            "以下意見必須納入評審；若草稿未回應問題，請在 revision_instructions 中明確指出。\n\n"
            f"> {user_flag_comments}\n"
        )

    return render_template(
        _PROMPT_PATH,
        spec_json=spec.model_dump_json(indent=2),
        passage_text=passage_text,
        cross_text_section=cross_text_section,
        school_ws_block=school_ws_block,
        reference_block=reference_block,
        existing_stems_block=existing_stems_block + correction_block,
        draft_json=draft.model_dump_json(indent=2),
        user_flag_comments_block=user_flag_comments_block,
    )


def run_reviewer_critic(
    spec: Spec,
    draft: Draft,
    iteration: int = 0,
    question_id: str | None = None,
    user_flag_comments: str | None = None,
    is_correction: bool = False,
) -> Critique:
    passage_text = get_passage_body(spec.passage)
    cross_text = get_passage_body(spec.cross_passage) if spec.cross_passage else None
    prompt = _build_reviewer_prompt(
        spec,
        draft,
        passage_text=passage_text,
        cross_text=cross_text,
        current_question_id=question_id,
        user_flag_comments=user_flag_comments,
        is_correction=is_correction,
    )
    log.info(
        "reviewer_critic_start",
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
    log.info("reviewer_critic_done", score=critique.score, iteration=iteration)
    return critique
