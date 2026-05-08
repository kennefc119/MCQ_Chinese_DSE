"""Structlog 設定 — 輸出到 JSONL 檔案（+同步印到 console）。"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import structlog

_LOG_DIR = Path(__file__).parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)

_initialised = False


def setup_logging(run_id: str) -> None:
    global _initialised
    if _initialised:
        return
    _initialised = True

    log_file = _LOG_DIR / f"run-{run_id}.jsonl"

    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    console_handler = logging.StreamHandler(sys.stderr)

    logging.basicConfig(
        level=logging.DEBUG,
        handlers=[file_handler, console_handler],
        format="%(message)s",
    )

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
