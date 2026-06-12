"""
Agent 3：審題主任
接收 Spec + 課文 + Draft → 輸出 Critique（PASS / REVISE）。
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from ..db.stems import fetch_existing_stems
from ..dse_reference import format_reference_block
from ..llm import chat_structured
from ..passage_db import get_passage_body
from ..schemas import Critique, Draft, Spec
from ..school_ws_loader import format_school_ws_block
from ..config import settings
from ..template_utils import render_template

log = structlog.get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "critic_prompt.md"
_INJECTION_CONFIG_PATH = Path(__file__).parent.parent / "prompts" / "injection_config.json"

_CRITIC_DEFAULTS = {"reference_block": True, "school_ws_block": True}


def _get_injection_cfg() -> dict:
    """Read critic injection flags; falls back to defaults."""
    try:
        if _INJECTION_CONFIG_PATH.exists():
            cfg = json.loads(_INJECTION_CONFIG_PATH.read_text(encoding="utf-8"))
            return cfg.get("critic", _CRITIC_DEFAULTS)
    except Exception:
        pass
    return dict(_CRITIC_DEFAULTS)


def _build_prompt(
    spec: Spec,
    draft: Draft,
    cross_text: str | None,
    passage_text: str,
    user_flag_comments: str | None = None,
    is_correction: bool = False,
) -> str:
    cross_text_section = (
        f"\n\n## 跨篇章原文（第二篇）\n{cross_text}" if cross_text else ""
    )
    cfg = _get_injection_cfg()

    school_ws_block = ""
    if cfg.get("school_ws_block", True):
        ws = format_school_ws_block(spec.passage, spec.cross_passage)
        school_ws_block = ("\n\n" + ws) if ws else ""

    ref_parts: list[str] = []
    if cfg.get("reference_block", True):
        primary_ref = format_reference_block(spec.passage)
        if primary_ref:
            ref_parts.append(primary_ref)
        if spec.cross_passage:
            cross_ref = format_reference_block(spec.cross_passage)
            if cross_ref:
                ref_parts.append(f"### 跨篇章參考（{spec.cross_passage}）\n{cross_ref}")
    reference_block = ("\n\n" + "\n\n".join(ref_parts)) if ref_parts else ""

    # ── Existing stems for duplicate-detection ──────────────────────────────
    if is_correction:
        # In the correction workflow the question being corrected already exists in
        # the DB, so the critic will always find a near-identical stem.  Skip the
        # duplicate check entirely and tell the critic to ignore it.
        existing_stems_block = (
            "\n\n## ⚠️ 修正工作流程專用提示（重複性篩查）\n"
            "此草稿來自**修正工作流程**，並非全新出題。"
            "題庫中必然存在與本草稿高度相似的原題（即正在被修正的那條題目）。"
            "這屬正常現象，**請完全跳過第一步重複性篩查，直接進入第二步質素審核。**"
            "不得以重複為由扣分或輸出 REVISE。\n"
        )
    else:
        # Normal generation workflow — fetch and check existing stems as usual.
        passage_ids = [spec.passage]
        if spec.cross_passage and spec.skill_tested.value == "跨篇章比較":
            passage_ids.append(spec.cross_passage)

        stems = fetch_existing_stems(passage_ids, spec.skill_tested.value)
        if stems:
            numbered = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(stems))
            existing_stems_block = (
                f"\n\n## 現有題庫（同篇章 × 考核能力：{spec.skill_tested.value}）"
                f"\n以下為題庫中已有的相同篇章及相同考核能力的 MC 題幹（共 {len(stems)} 條）。"
                f"請對照草稿進行重複性審查，如有高度重疊須扣分並要求修改：\n\n{numbered}\n"
            )
        else:
            existing_stems_block = ""

    # ── User flag comments (correction workflow only) ─────────────────────
    user_flag_comments_block = ""
    if user_flag_comments:
        if is_correction:
            user_flag_comments_block = (
                "\n\n## 用戶投訴意見（修正指令）⚠️ 必須納入評審\n"
                "以下投訴意見是觸發本次修正的直接原因。審題時**必須驗證**修正後的草稿是否已回應每條投訴。"
                "若草稿未回應投訴所指出的問題，須在 `revision_instructions` 中明確要求修正員針對該投訴再作修改。\n\n"
                f"> {user_flag_comments}\n"
            )
        else:
            user_flag_comments_block = (
                "\n\n## 用戶投訴意見（僅供參考）\n"
                "以下是用戶提交的投訴意見。這些意見僅供參考，不構成審題標準。"
                "請基於篇章原文及考評標準獨立判斷草稿品質，"
                "但若用戶意見指出的問題確實存在，應反映在評分及修改指示中。\n\n"
                f"> {user_flag_comments}\n"
            )

    return render_template(
        _PROMPT_PATH,
        spec_json=spec.model_dump_json(indent=2),
        passage_text=passage_text,
        cross_text_section=cross_text_section,
        school_ws_block=school_ws_block,
        reference_block=reference_block,
        existing_stems_block=existing_stems_block,
        draft_json=draft.model_dump_json(indent=2),
        user_flag_comments_block=user_flag_comments_block,
    )


def run_critic(
    spec: Spec,
    draft: Draft,
    iteration: int = 0,
    user_flag_comments: str | None = None,
    is_correction: bool = False,
) -> Critique:
    """呼叫審題主任，回傳 Critique。

    Args:
        user_flag_comments: Optional user flag comments (correction workflow only).
        is_correction: When True, skips duplicate-detection (the question being
            corrected will always appear as a near-match in the DB) and treats
            user flag comments as mandatory review criteria.  Has zero effect on
            the normal generation workflow (default False).
    """
    passage_text = get_passage_body(spec.passage)
    cross_text = get_passage_body(spec.cross_passage) if spec.cross_passage else None

    prompt = _build_prompt(spec, draft, cross_text, passage_text, user_flag_comments, is_correction)

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
