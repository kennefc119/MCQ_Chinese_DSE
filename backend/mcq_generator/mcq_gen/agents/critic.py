"""
Agent 3：審題主任
接收 Spec + 課文 + Draft → 輸出 Critique（PASS / REVISE）。
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from ..llm import chat_structured
from ..schemas import Critique, Draft, Spec

log = structlog.get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "critic.md"
_PASSAGES_FILE = Path(__file__).parent.parent.parent / "data" / "passages.json"


def _load_passage_text(passage_id: str) -> str:
    passages = json.loads(_PASSAGES_FILE.read_text(encoding="utf-8"))
    entry = passages.get(passage_id)
    if not entry:
        raise KeyError(f"找不到篇章 {passage_id}")
    return entry.get("body", "")


def _build_user_message(spec: Spec, draft: Draft, cross_text: str | None, passage_text: str) -> str:
    parts = [
        "## 原始題目需求規格 (spec)",
        f"```json\n{spec.model_dump_json(indent=2)}\n```",
        "",
        "## 篇章原文",
        passage_text,
    ]
    if cross_text:
        parts += ["", "## 跨篇章原文（第二篇）", cross_text]

    parts += [
        "",
        "## 出題員草稿",
        f"```json\n{draft.model_dump_json(indent=2)}\n```",
        "",
        "請根據五個審核維度，輸出審核結果 JSON。",
    ]
    return "\n".join(parts)


def run_critic(spec: Spec, draft: Draft, iteration: int = 0) -> Critique:
    """呼叫審題主任，回傳 Critique。"""
    passages = json.loads(_PASSAGES_FILE.read_text(encoding="utf-8"))
    passage_text = passages.get(spec.passage, {}).get("body", "")
    cross_text = (
        passages.get(spec.cross_passage, {}).get("body", "")
        if spec.cross_passage
        else None
    )

    system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    user_message = _build_user_message(spec, draft, cross_text, passage_text)

    log.info(
        "critic_start",
        passage=spec.passage,
        iteration=iteration,
        stem_preview=draft.question_stem[:60],
    )

    critique = chat_structured(
        system_prompt=system_prompt,
        user_message=user_message,
        schema=Critique,
        temperature=0.3,  # 審核用較低 temperature 確保一致性
    )

    log.info(
        "critic_done",
        verdict=critique.verdict,
        score=critique.score,
        iteration=iteration,
    )
    return critique
