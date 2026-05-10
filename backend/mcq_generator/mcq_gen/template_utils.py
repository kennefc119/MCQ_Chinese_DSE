"""Simple {{VAR_NAME}} template substitution for LLM user message templates."""
from __future__ import annotations

from pathlib import Path


def render_template(template_path: Path, **variables: str) -> str:
    """Load a .md template file and substitute all {{VAR_NAME}} tokens.

    Unknown tokens are left as-is (no error). Empty string is substituted
    for any variable whose value is None.
    """
    text = template_path.read_text(encoding="utf-8")
    for key, value in variables.items():
        text = text.replace(f"{{{{{key}}}}}", value if value is not None else "")
    return text.strip()
