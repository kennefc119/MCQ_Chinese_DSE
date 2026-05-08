"""
LangGraph 流程編排 — 3-agent sequential pipeline，含 Agent2 ↔ Agent3 最多 3 輪 revise loop。

流程：
  load_stats → strategist → drafter → critic
                                ↑         ↓ REVISE & iter < max
                                └─────────┘
                                         ↓ PASS or iter == max
                                       save

State 欄位全部為 Optional 以支援 TypedDict 的 graph 傳遞方式。
"""
from __future__ import annotations

import uuid
from typing import Annotated, Any

import structlog
from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from .agents.critic import run_critic
from .agents.drafter import run_drafter
from .agents.strategist import run_strategist
from .config import settings
from .db.stats import fetch_db_stats
from .db.writer import write_question
from .schemas import (
    Critique,
    DBStats,
    Difficulty,
    Draft,
    DraftOption,
    SavedQuestion,
    Skill,
    Spec,
    Verdict,
)

log = structlog.get_logger(__name__)

# ─── State ───────────────────────────────────────────────────────────────────


class CycleState(TypedDict, total=False):
    # 輸入
    db_stats: DBStats
    dry_run: bool

    # Agent 1 輸出
    spec: Spec

    # Agent 2 / Agent 3 迭代
    draft: Draft
    critique: Critique
    iteration: int          # 0-based，最多 max_revise_iterations-1
    draft_history: list[Draft]

    # 最終輸出
    saved_question: SavedQuestion | None
    skipped: bool           # dry-run or duplicate
    question_id: str


# ─── Helper ──────────────────────────────────────────────────────────────────

_DIFF_TO_INT = {
    Difficulty.EASY: 2,
    Difficulty.MEDIUM: 3,
    Difficulty.HARD: 4,
}


def _make_question_id(passage_id: str) -> str:
    short = uuid.uuid4().hex[:6]
    return f"q-ai-{passage_id}-{short}"


def _build_saved_question(
    state: CycleState,
    source_tag: str,
    is_active: bool,
) -> SavedQuestion:
    spec: Spec = state["spec"]
    draft: Draft = state["draft"]
    critique: Critique = state["critique"]
    return SavedQuestion(
        question_id=state["question_id"],
        passage_id=spec.passage,
        stem=draft.question_stem,
        difficulty=_DIFF_TO_INT[spec.difficulty],
        difficulty_label=spec.difficulty,
        skill=spec.skill_tested,
        options=draft.options,
        source=source_tag,
        is_active=is_active,
        spec=spec,
        critique_score=critique.score,
    )


# ─── Node Functions ───────────────────────────────────────────────────────────


def node_load_stats(state: CycleState) -> dict[str, Any]:
    """從 Supabase 讀取題庫統計（若 state 已有則跳過，方便 dry-run 測試）。"""
    if state.get("db_stats"):
        return {}
    stats = fetch_db_stats()
    return {"db_stats": stats}


def node_strategist(state: CycleState) -> dict[str, Any]:
    spec = run_strategist(stats=state.get("db_stats"))
    qid = _make_question_id(spec.passage)
    return {"spec": spec, "question_id": qid, "iteration": 0, "draft_history": []}


def node_drafter(state: CycleState) -> dict[str, Any]:
    iteration = state.get("iteration", 0)
    draft = run_drafter(
        spec=state["spec"],
        prev_draft=state.get("draft"),
        critique=state.get("critique"),
        iteration=iteration,
    )
    history = list(state.get("draft_history") or [])
    if state.get("draft"):
        history.append(state["draft"])
    return {"draft": draft, "draft_history": history}


def node_critic(state: CycleState) -> dict[str, Any]:
    iteration = state.get("iteration", 0)
    critique = run_critic(
        spec=state["spec"],
        draft=state["draft"],
        iteration=iteration,
    )
    return {"critique": critique, "iteration": iteration + 1}


def node_save(state: CycleState) -> dict[str, Any]:
    """PASS path — 儲存為 is_active=True。"""
    dry_run = state.get("dry_run", False)
    q = _build_saved_question(
        state,
        source_tag=settings.default_source_tag,
        is_active=True,
    )
    if dry_run:
        log.info("dry_run_pass", question_id=q.question_id, score=q.critique_score)
        return {"saved_question": q, "skipped": True}

    written = write_question(q)
    return {"saved_question": q, "skipped": not written}


def node_save_flagged(state: CycleState) -> dict[str, Any]:
    """超過 max iteration — 儲存為 is_active=False 待人工審核。"""
    dry_run = state.get("dry_run", False)
    source = f"{settings.default_source_tag}-needs-review"
    q = _build_saved_question(state, source_tag=source, is_active=False)

    log.warning(
        "max_iterations_reached",
        question_id=q.question_id,
        passage=q.passage_id,
        final_score=q.critique_score,
    )

    if dry_run:
        log.info("dry_run_flagged", question_id=q.question_id)
        return {"saved_question": q, "skipped": True}

    write_question(q)
    return {"saved_question": q, "skipped": False}


# ─── Conditional Edge ────────────────────────────────────────────────────────


def route_after_critic(state: CycleState) -> str:
    critique: Critique = state["critique"]
    iteration: int = state.get("iteration", 1)  # already incremented in node_critic

    if critique.verdict == Verdict.PASS:
        log.info("routing_to_save", score=critique.score)
        return "save"

    if iteration >= settings.max_revise_iterations:
        log.warning(
            "routing_to_save_flagged",
            iteration=iteration,
            max=settings.max_revise_iterations,
        )
        return "save_flagged"

    log.info("routing_to_redraft", iteration=iteration, score=critique.score)
    return "redraft"


# ─── Build Graph ─────────────────────────────────────────────────────────────


def build_cycle_graph() -> Any:
    """構建並編譯單一 cycle 的 LangGraph。"""
    graph = StateGraph(CycleState)

    graph.add_node("load_stats", node_load_stats)
    graph.add_node("strategist", node_strategist)
    graph.add_node("drafter", node_drafter)
    graph.add_node("critic", node_critic)
    graph.add_node("save", node_save)
    graph.add_node("save_flagged", node_save_flagged)

    graph.set_entry_point("load_stats")
    graph.add_edge("load_stats", "strategist")
    graph.add_edge("strategist", "drafter")
    graph.add_edge("drafter", "critic")

    graph.add_conditional_edges(
        "critic",
        route_after_critic,
        {
            "save": "save",
            "save_flagged": "save_flagged",
            "redraft": "drafter",
        },
    )

    graph.add_edge("save", END)
    graph.add_edge("save_flagged", END)

    return graph.compile()


# ─── Orchestrator ────────────────────────────────────────────────────────────


def run_pipeline(
    count: int = 1,
    passage: str | None = None,
    dry_run: bool = False,
) -> list[SavedQuestion]:
    """
    執行完整的出題流程 N 次。

    Args:
        count:      要生成的題目數量
        passage:    若指定，覆蓋策略師的選擇（用於測試或補特定篇章）
        dry_run:    True 時生成但不寫入 DB

    Returns:
        SavedQuestion 列表（含 dry_run 產出的假記錄）
    """
    import time

    cycle_graph = build_cycle_graph()
    results: list[SavedQuestion] = []

    # 首次讀取 DB stats（後續 cycles 每次重新讀，以反映累積狀況）
    initial_stats = fetch_db_stats()

    for i in range(count):
        log.info("cycle_start", cycle=i + 1, total=count, dry_run=dry_run)

        initial_state: CycleState = {
            "db_stats": initial_stats,
            "dry_run": dry_run,
            "iteration": 0,
            "draft_history": [],
        }

        final_state: CycleState = cycle_graph.invoke(initial_state)

        saved = final_state.get("saved_question")
        if saved:
            results.append(saved)
            log.info(
                "cycle_done",
                cycle=i + 1,
                question_id=saved.question_id,
                is_active=saved.is_active,
                score=saved.critique_score,
            )

        # 下一輪前重新讀取 DB stats，讓策略師看到最新分佈
        if i < count - 1:
            if settings.sleep_between_cycles_seconds > 0:
                time.sleep(settings.sleep_between_cycles_seconds)
            initial_stats = fetch_db_stats()

    log.info("pipeline_done", generated=len(results), dry_run=dry_run)
    return results
