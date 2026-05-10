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

_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "strategist.md"
_USER_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "strategist_user.md"


def _build_user_message(stats: DBStats) -> str:
    return render_template(
        _USER_TEMPLATE_PATH,
        stats_json=json.dumps(stats.model_dump(), ensure_ascii=False, indent=2),
    )


def run_strategist(stats: DBStats | None = None) -> Spec:
    """呼叫策略師，回傳一個 Spec。如不提供 stats 則自動從 Supabase 讀取。"""
    if stats is None:
        stats = fetch_db_stats()

    system_prompt = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    user_message = _build_user_message(stats)

    log.info("strategist_start", total_questions=stats.total, bot=settings.strategist_bot)
    spec = chat_structured(
        system_prompt=system_prompt,
        user_message=user_message,
        schema=Spec,
        temperature=0.5,
        model=settings.strategist_bot,
    )
    log.info(
        "strategist_done",
        passage=spec.passage,
        difficulty=spec.difficulty,
        skill=spec.skill_tested,
        reasoning=spec.reasoning[:80],
    )
    return spec
