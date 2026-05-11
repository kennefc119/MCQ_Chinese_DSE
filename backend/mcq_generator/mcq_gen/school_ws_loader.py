"""
School Worksheet Loader — dynamically scans school_ws/ directory and
finds .md files whose filename contains passage title keywords.

Used by both drafter.py and critic.py to ground question generation and critique
in the official school curriculum materials.
"""
from __future__ import annotations

from pathlib import Path

import structlog

from .dse_reference import _PASSAGE_KEYWORDS

log = structlog.get_logger(__name__)

# school_ws/ is at repo_root/school_ws/
# This file lives at repo_root/backend/mcq_generator/mcq_gen/school_ws_loader.py
_REPO_ROOT = Path(__file__).parent.parent.parent.parent
_SCHOOL_WS_DIR = _REPO_ROOT / "school_ws"


def _find_worksheet_files(passage_id: str) -> list[Path]:
    """
    Scan school_ws/ directory and return all .md files whose filename
    contains any keyword for the given passage_id.

    Matching is a simple substring check (case-sensitive, as passage titles
    appear verbatim in the filenames).
    """
    keywords = _PASSAGE_KEYWORDS.get(passage_id, [])
    if not keywords:
        log.warning("school_ws_no_keywords", passage_id=passage_id)
        return []

    if not _SCHOOL_WS_DIR.exists():
        log.error("school_ws_dir_missing", path=str(_SCHOOL_WS_DIR))
        return []

    matched: list[Path] = []
    for fpath in sorted(_SCHOOL_WS_DIR.glob("*.md")):
        fname = fpath.name
        if any(kw in fname for kw in keywords):
            matched.append(fpath)

    log.debug(
        "school_ws_scan",
        passage_id=passage_id,
        keywords=keywords,
        matched=[p.name for p in matched],
    )
    return matched


def load_worksheets(passage_id: str) -> list[tuple[str, str]]:
    """
    Load worksheet .md file(s) for the given passage ID by dynamic filename scan.

    Returns a list of (filename, content) tuples.
    Returns empty list if no matching files are found.
    """
    results: list[tuple[str, str]] = []
    for fpath in _find_worksheet_files(passage_id):
        try:
            content = fpath.read_text(encoding="utf-8")
            results.append((fpath.name, content))
        except OSError as exc:
            log.warning("school_ws_read_error", file=fpath.name, error=str(exc))
    return results


def format_school_ws_block(passage_id: str, cross_passage_id: str | None = None) -> str:
    """
    Build a formatted markdown block containing:
    1. The relevant worksheet(s) for passage_id
    2. The relevant worksheet(s) for cross_passage_id (if provided)

    Ready to be appended to the LLM user message.
    """
    parts: list[str] = []

    # Primary passage worksheet(s)
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

    # Cross-passage worksheet(s)
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
