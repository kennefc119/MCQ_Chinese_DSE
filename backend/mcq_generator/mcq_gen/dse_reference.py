"""
DSE Reference Loader — reads past DSE exam questions (2020–2025) from source/
and returns relevant MC questions for a given passage_id.

Used to inject "real DSE question style" context into the drafter prompt.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import NamedTuple

import structlog

log = structlog.get_logger(__name__)

# Root of the repo relative to this file's location:
#   mcq_gen/dse_reference.py → mcq_generator/ → backend/ → repo_root/
_SOURCE_DIR = Path(__file__).parent.parent.parent.parent / "source"

# Years to include (2015–2025)
_REFERENCE_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]

# Keywords that identify which app passage each text belongs to.
# Listed from most specific to least specific within each group.
_PASSAGE_KEYWORDS: dict[str, list[str]] = {
    "p01": ["論仁、論孝、論君子", "論仁論孝", "論語"],
    "p02": ["魚我所欲也", "魚我所欲"],
    "p03": ["逍遙遊"],
    "p04": ["勸學"],
    "p05": ["廉頗藺相如列傳", "廉頗藺相如", "廉頗", "藺相如"],
    "p06": ["出師表"],
    "p07": ["師說"],
    "p08": ["始得西山宴遊記", "始得西山", "西山宴遊"],
    "p09": ["岳陽樓記", "岳陽樓"],
    "p10": ["六國論"],
    "p11": ["唐詩三首", "月下獨酌", "登樓", "山居秋暝"],
    "p12": ["宋詞三首", "念奴嬌", "聲聲慢", "青玉案"],
}


class PastQuestion(NamedTuple):
    year: int
    question_number: str
    question_text: str
    answer_key: str | None  # For MC: A/B/C/D; None if not available


def _matches_passage(text: str, passage_id: str) -> bool:
    """Return True if text contains any keyword for the given passage."""
    return any(kw in text for kw in _PASSAGE_KEYWORDS.get(passage_id, []))


def _load_year(year: int) -> list[dict]:
    """Load the JSON file for a given year. Returns the list of question dicts."""
    path = _SOURCE_DIR / f"{year}_DSE_exam_question.json"
    if not path.exists():
        log.debug("dse_reference_file_missing", year=year, path=str(path))
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("dse_reference_load_error", year=year, error=str(exc))
        return []

    results: list[dict] = []
    for passage_group in data.get("designated_passages_data", []):
        group_title = passage_group.get("passage_title", "")
        for q in passage_group.get("questions", []):
            results.append(
                {
                    "year": year,
                    "group_title": group_title,
                    "question_number": q.get("question_number", ""),
                    "question_text": q.get("question_text", ""),
                    "question_type": q.get("question_type", ""),
                    "score": q.get("score"),
                    "answer_key": (
                        q.get("marking_scheme_data", {}) or {}
                    ).get("official_answer_key"),
                }
            )
    return results


def get_past_mc_questions(passage_id: str) -> list[PastQuestion]:
    """
    Return MC questions from 2020–2025 exams that relate to the given passage_id.
    Only question_type == "MC" is returned (not short-answer / essay questions).
    """
    results: list[PastQuestion] = []
    for year in _REFERENCE_YEARS:
        for q in _load_year(year):
            if q["question_type"].upper() not in ("MC", "M.C.", "多選題"):
                continue
            text_to_check = q["group_title"] + " " + q["question_text"]
            if _matches_passage(text_to_check, passage_id):
                results.append(
                    PastQuestion(
                        year=year,
                        question_number=q["question_number"],
                        question_text=q["question_text"],
                        answer_key=q["answer_key"],
                    )
                )
    log.debug(
        "dse_reference_loaded",
        passage_id=passage_id,
        count=len(results),
    )
    return results


def format_reference_block(passage_id: str) -> str:
    """
    Return a formatted markdown block of past DSE MC questions for the given passage,
    ready to be injected into the drafter's user message.

    Returns empty string if no reference questions are found.
    """
    questions = get_past_mc_questions(passage_id)
    if not questions:
        return ""

    lines = [
        "## 近年 DSE 真題參考（MC 題）",
        "以下是 2020–2025 年 DSE 考試中**針對本篇章**的真實 MC 題目。",
        "請參考這些題目的**考核方式、提問角度、選項設計及難度水平**，",
        "確保你所出的題目與真實 DSE 風格相符。",
        "⚠️ 注意：你必須出**全新、不重複**的題目，不可直接複製這些題目。",
        "",
    ]
    for q in questions:
        lines.append(f"**【{q.year} DSE 第 {q.question_number} 題】**")
        lines.append(q.question_text)
        if q.answer_key:
            lines.append(f"（正確答案：{q.answer_key}）")
        lines.append("")

    return "\n".join(lines)
