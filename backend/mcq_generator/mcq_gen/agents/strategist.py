"""
Agent 1：題型策略師
讀取現存題庫統計 → 輸出一個 Spec（題目需求規格）。
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from ..db.stats import fetch_db_stats
from ..llm import chat_structured
from ..schemas import DBStats, Spec
from ..config import settings
from ..template_utils import render_template

log = structlog.get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "strategist_prompt.md"


def _build_prompt(stats: DBStats, forced_passage: str | None = None) -> str:
    if forced_passage:
        note = (
            f"⚠️ **管理員已指定篇章**：你**必須**將 `passage` 欄位設為 `{forced_passage}`，"
            f"不得自行選擇其他篇章。`difficulty` 及 `skill_tested` 仍按正常分析決定。\n\n"
        )
    else:
        note = ""
    return render_template(
        _PROMPT_PATH,
        stats_json=json.dumps(stats.model_dump(), ensure_ascii=False, indent=2),
        forced_passage_note=note,
    )


def run_strategist(stats: DBStats | None = None, forced_passage: str | None = None) -> Spec:
    """呼叫策略師，回傳一個 Spec。如不提供 stats 則自動從 Supabase 讀取。"""
    if stats is None:
        stats = fetch_db_stats()

    prompt = _build_prompt(stats, forced_passage=forced_passage)

    log.info("strategist_start", total_questions=stats.total, bot=settings.strategist_bot,
             forced_passage=forced_passage)
    spec = chat_structured(
        user_message=prompt,
        schema=Spec,
        temperature=0.5,
        model=settings.strategist_bot,
    )

    # Hard override: ensure spec.passage matches forced_passage even if LLM ignores the instruction
    if forced_passage and spec.passage != forced_passage:
        log.warning("strategist_passage_override",
                    llm_chose=spec.passage, forced=forced_passage)
        spec = spec.model_copy(update={"passage": forced_passage})

    log.info(
        "strategist_done",
        passage=spec.passage,
        difficulty=spec.difficulty,
        skill=spec.skill_tested,
        reasoning=spec.reasoning[:80],
    )
    return spec
