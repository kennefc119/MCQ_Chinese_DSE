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
from ..schemas import DBStats, Difficulty, Skill, Spec
from ..config import settings
from ..template_utils import render_template

log = structlog.get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "strategist_prompt.md"


_INT_TO_DIFF: dict[int, Difficulty] = {
    1: Difficulty.VERY_EASY,
    2: Difficulty.EASY,
    3: Difficulty.MEDIUM,
    4: Difficulty.HARD,
    5: Difficulty.VERY_HARD,
}


def _build_prompt(
    stats: DBStats,
    forced_passage: str | None = None,
    forced_difficulty: int | None = None,
    forced_skill: str | None = None,
    admin_hint: str | None = None,
) -> str:
    notes: list[str] = []
    if forced_passage:
        notes.append(
            f"⚠️ **管理員已指定篇章**：你**必須**將 `passage` 欄位設為 `{forced_passage}`，"
            f"不得自行選擇其他篇章。"
        )
    if forced_difficulty is not None:
        diff_label = _INT_TO_DIFF[forced_difficulty].value
        notes.append(
            f"⚠️ **管理員已指定難度**：你**必須**將 `difficulty` 欄位設為 `{diff_label}`，"
            f"不得自行選擇其他難度。請優先選擇在此難度下最缺題的篇章（若篇章未被指定）。"
        )
    if forced_skill:
        notes.append(
            f"⚠️ **管理員已指定考核能力**：你**必須**將 `skill_tested` 欄位設為 `{forced_skill}`，"
            f"不得自行選擇其他考核能力。請優先選擇在此能力下最缺題的篇章（若篇章未被指定）。"
        )
    if admin_hint:
        notes.append(
            f"💡 **管理員出題方向提示**：{admin_hint}\n"
            f"請在 `special_notes` 欄位中納入此提示，傳達給下游出題員。"
        )
    note = "\n\n".join(notes) + "\n\n" if notes else ""

    # Build a clean stats view: show only active-question counts so the LLM
    # reasons consistently. `total` here means active questions only.
    stats_for_llm = {
        "total_active_questions": stats.total_active,
        "total_inactive_questions": stats.total_inactive,
        "by_passage": stats.by_passage,
        "by_difficulty": stats.by_difficulty,
        "by_skill": stats.by_skill,
        "cross_passage_count": stats.cross_passage_count,
        "needs_review_count": stats.needs_review_count,
    }

    return render_template(
        _PROMPT_PATH,
        stats_json=json.dumps(stats_for_llm, ensure_ascii=False, indent=2),
        forced_constraints_note=note,
    )


def run_strategist(
    stats: DBStats | None = None,
    forced_passage: str | None = None,
    forced_difficulty: int | None = None,
    forced_skill: str | None = None,
    admin_hint: str | None = None,
) -> Spec:
    """呼叫策略師，回傳一個 Spec。如不提供 stats 則自動從 Supabase 讀取。"""
    if stats is None:
        stats = fetch_db_stats()

    prompt = _build_prompt(
        stats,
        forced_passage=forced_passage,
        forced_difficulty=forced_difficulty,
        forced_skill=forced_skill,
        admin_hint=admin_hint,
    )

    log.info(
        "strategist_start",
        total_questions=stats.total,
        bot=settings.strategist_bot,
        forced_passage=forced_passage,
        forced_difficulty=forced_difficulty,
        forced_skill=forced_skill,
    )
    spec = chat_structured(
        user_message=prompt,
        schema=Spec,
        temperature=0.5,
        model=settings.strategist_bot,
    )

    # Hard overrides — ensure LLM obeys forced constraints
    updates: dict = {}
    if forced_passage and spec.passage != forced_passage:
        log.warning("strategist_passage_override", llm_chose=spec.passage, forced=forced_passage)
        updates["passage"] = forced_passage
    if forced_difficulty is not None:
        target_diff = _INT_TO_DIFF[forced_difficulty]
        if spec.difficulty != target_diff:
            log.warning("strategist_difficulty_override", llm_chose=spec.difficulty, forced=target_diff)
            updates["difficulty"] = target_diff
    if forced_skill:
        target_skill = Skill(forced_skill)
        if spec.skill_tested != target_skill:
            log.warning("strategist_skill_override", llm_chose=spec.skill_tested, forced=target_skill)
            updates["skill_tested"] = target_skill
    if updates:
        spec = spec.model_copy(update=updates)

    log.info(
        "strategist_done",
        passage=spec.passage,
        difficulty=spec.difficulty,
        skill=spec.skill_tested,
        reasoning=spec.reasoning[:80],
    )
    return spec
