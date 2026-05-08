"""Poe HTTP API wrapper — SSE stream + JSON extraction + Pydantic validation."""
from __future__ import annotations

import json
from typing import TypeVar

import httpx
import structlog
from pydantic import BaseModel

from .config import settings

log = structlog.get_logger(__name__)

T = TypeVar("T", bound=BaseModel)

_POE_BASE_URL = "https://api.poe.com/bot/"

# ─── Trace Capture ───────────────────────────────────────────────────────────
# Module-level list — reset before each pipeline run, read afterwards for dashboard.

_traces: list[dict] = []


def reset_traces() -> None:
    """Clear all captured LLM call traces (call before each run)."""
    _traces.clear()


def get_traces() -> list[dict]:
    """Return a copy of captured traces since last reset_traces() call."""
    return list(_traces)


def _read_poe_stream(response: httpx.Response) -> str:
    """Parse Poe SSE response and concatenate all text-event chunks."""
    reply = ""
    current_event = ""

    for line in response.iter_lines():
        line = line.strip()
        if not line:
            # Empty line = event separator
            current_event = ""
            continue
        if line.startswith("event:"):
            current_event = line[6:].strip()
        elif line.startswith("data:"):
            data_str = line[5:].strip()
            if current_event == "text":
                try:
                    data = json.loads(data_str)
                    reply += data.get("text", "")
                except json.JSONDecodeError:
                    pass
            elif current_event == "done":
                return reply

    return reply


def chat_structured(
    system_prompt: str,
    user_message: str,
    schema: type[T],
    *,
    temperature: float = 0.7,
    model: str | None = None,
) -> T:
    """
    呼叫 Poe HTTP API，收集 SSE stream，然後用 Pydantic 解析 JSON 回傳值。

    若 Poe 回傳非 JSON 或解析失敗會 raise ValueError。
    """
    bot_name = model or settings.poe_bot_name

    # Poe bots don't reliably honour a separate system role —
    # merge system prompt + user message into a single user turn.
    merged = f"{system_prompt.strip()}\n\n---\n\n{user_message.strip()}"

    payload = {
        "version": "1.0",
        "type": "query",
        "query": [
            {"role": "user", "content": merged},
        ],
    }

    log.debug("poe_call", bot=bot_name, schema=schema.__name__)

    with httpx.Client(timeout=180.0) as client:
        with client.stream(
            "POST",
            f"{_POE_BASE_URL}{bot_name}",
            headers={
                "Authorization": f"Bearer {settings.poe_api_key}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            json=payload,
        ) as response:
            if response.status_code != 200:
                error_body = response.read().decode()
                raise RuntimeError(
                    f"Poe API error {response.status_code}: {error_body[:300]}"
                )
            raw = _read_poe_stream(response)

    log.debug("poe_raw_response", length=len(raw))

    # Capture trace for dashboard visibility
    _traces.append({
        "agent": schema.__name__,
        "bot": bot_name,
        "merged_prompt": merged,
        "raw_response": raw,
    })

    if not raw:
        raise ValueError("Poe API 回傳空白回應")

    # Strip markdown code fences if present (some bots add them despite instructions)
    stripped = raw.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        stripped = "\n".join(l for l in lines if not l.startswith("```")).strip()

    # Try direct parse first
    try:
        return schema.model_validate_json(stripped)
    except Exception as exc:
        # Fall back: extract outermost JSON object
        start = stripped.find("{")
        end = stripped.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return schema.model_validate_json(stripped[start:end])
            except Exception:
                pass
        log.error("poe_parse_error", raw=stripped[:500], error=str(exc))
        raise ValueError(f"JSON 解析失敗: {exc}") from exc
