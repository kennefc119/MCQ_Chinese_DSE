"""
School Worksheet Loader — loads the summary.md and per-passage teacher worksheets
from the school_ws/ directory and injects them into LLM user messages.

Used by both drafter.py and critic.py to ground question generation and critique
in the official school curriculum materials.
"""
from __future__ import annotations

from pathlib import Path

import structlog

log = structlog.get_logger(__name__)

# school_ws/ is at repo_root/school_ws/
# This file lives at repo_root/backend/mcq_generator/mcq_gen/school_ws_loader.py
_REPO_ROOT = Path(__file__).parent.parent.parent.parent
_SCHOOL_WS_DIR = _REPO_ROOT / "school_ws"
_SUMMARY_FILE = _SCHOOL_WS_DIR / "summary.md"
_CRITERIA_FILE = _SCHOOL_WS_DIR / "mc_question_criteria.md"

# Maps passage IDs to their worksheet filename(s) in school_ws/
_PASSAGE_WORKSHEET_MAP: dict[str, list[str]] = {
    "p01": ["2526《論仁論孝論君子》工作紙_教師版.md"],
    "p02": ["2526魚我所欲也工作紙_教師版.md"],
    "p03": ["2526 逍遙遊工作紙_教師版_revised.md"],
    "p04": ["25-26 勸學工作紙_教師版_revised.md"],
    "p05": ["2526 廉頗藺相如列傳_教師版_revised.md"],
    "p06": ["25-26 出師表工作紙(教師版)_revised.md"],
    "p07": ["25-26 師說工作紙_教師版_revised.md"],
    "p08": ["25-26 《始得西山宴遊記》工作紙_教師版_revised.md"],
    "p09": ["2526岳陽樓記_教師版_revised.md"],
    "p10": ["25-26 六國論工作紙(教師版).md"],
    "p11": [
        "25-26 《登樓》工作紙_教師版.md",
        "25-26 《月下獨酌》工作紙_教師版.md",
        "25-26 《山居秋暝》工作紙_教師版.md",
    ],
    "p12": [
        "25-26《念奴嬌﹒赤壁懷古》工作紙_教師版_updated.md",
        "25-26《聲聲慢．秋情》工作紙_教師版.md",
        "25-26《青玉案．元夕》工作紙_教師版.md",
    ],
}


def load_summary() -> str:
    """Load the school_ws/summary.md content. Returns empty string if not found."""
    if not _SUMMARY_FILE.exists():
        log.warning("school_ws_summary_missing", path=str(_SUMMARY_FILE))
        return ""
    return _SUMMARY_FILE.read_text(encoding="utf-8")


def load_criteria() -> str:
    """Load the school_ws/mc_question_criteria.md content. Returns empty string if not found."""
    if not _CRITERIA_FILE.exists():
        log.warning("school_ws_criteria_missing", path=str(_CRITERIA_FILE))
        return ""
    return _CRITERIA_FILE.read_text(encoding="utf-8")


def load_worksheets(passage_id: str) -> list[tuple[str, str]]:
    """
    Load worksheet file(s) for the given passage ID.

    Returns a list of (filename, content) tuples.
    Returns empty list if passage_id has no mapping or files are missing.
    """
    filenames = _PASSAGE_WORKSHEET_MAP.get(passage_id, [])
    results: list[tuple[str, str]] = []
    for fname in filenames:
        fpath = _SCHOOL_WS_DIR / fname
        if fpath.exists():
            results.append((fname, fpath.read_text(encoding="utf-8")))
        else:
            log.warning("school_ws_file_missing", passage_id=passage_id, file=fname)
    return results


def format_school_ws_block(passage_id: str, cross_passage_id: str | None = None) -> str:
    """
    Build a formatted markdown block containing:
    1. The summary.md (once, regardless of number of passages)
    2. The relevant worksheet(s) for passage_id
    3. The relevant worksheet(s) for cross_passage_id (if provided)

    Ready to be appended to the LLM user message.
    """
    parts: list[str] = []

    # 1. Criteria block (quality standards)
    criteria = load_criteria()
    if criteria:
        parts += [
            "---",
            "## MC 題目質素準則",
            "以下是本題庫對 MC 題目質素的要求及排除準則。",
            "出題時必須確保題目符合所有準則，特別注意「必須排除的題目」一節。",
            "",
            criteria,
            "---",
        ]

    # 2. Primary passage worksheet(s)
    worksheets = load_worksheets(passage_id)
    if worksheets:
        parts += [
            f"## 主篇章教師版工作紙（{passage_id}）",
            "以下是學校教師版工作紙原文，包含詳細詞語解釋、篇章結構分析、",
            "重點內容問答及歷屆 DSE 考題。出題時必須以此為依據。",
            "",
        ]
        for fname, content in worksheets:
            parts += [f"### 工作紙：{fname}", content, ""]

    # 3. Cross-passage worksheet(s)
    if cross_passage_id:
        cross_worksheets = load_worksheets(cross_passage_id)
        if cross_worksheets:
            parts += [
                f"## 跨篇章教師版工作紙（{cross_passage_id}）",
                "",
            ]
            for fname, content in cross_worksheets:
                parts += [f"### 工作紙：{fname}", content, ""]

    return "\n".join(parts)
