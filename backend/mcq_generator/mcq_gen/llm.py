"""Poe API wrapper — OpenAI-compatible endpoint at https://api.poe.com/v1"""
from __future__ import annotations

import json
import time
from typing import TypeVar

import httpx
import structlog
from pydantic import BaseModel

from .config import settings

log = structlog.get_logger(__name__)

T = TypeVar("T", bound=BaseModel)

_POE_BASE_URL = "https://api.poe.com/v1/chat/completions"


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: Chinese ~1.5 chars/token, English ~4 chars/token.
    Conservative average of ~2 chars/token."""
    return max(1, len(text) // 2)


# ─── Trace Capture ───────────────────────────────────────────────────────────

_traces: list[dict] = []


def reset_traces() -> None:
    """Clear all captured LLM call traces (call before each run)."""
    _traces.clear()


def get_traces() -> list[dict]:
    """Return a copy of captured traces since last reset_traces() call."""
    return list(_traces)


def chat_structured(
    system_prompt: str,
    user_message: str,
    schema: type[T],
    *,
    temperature: float = 0.7,
    model: str | None = None,
) -> T:
    """
    呼叫 Poe OpenAI-compatible API，解析 JSON 回傳值為 Pydantic model。

    Poe bots ignore the system role — merge system prompt + user message
    into a single user turn (same pattern as fortune-teller in table_for_6).
    """
    bot_name = model or settings.poe_bot_name

    # Merge system prompt into user message — Poe bots ignore the system role
    merged = f"{system_prompt.strip()}\n\n---\n\n{user_message.strip()}"

    payload = {
        "model": bot_name,
        "messages": [
            {"role": "user", "content": merged},
        ],
        "temperature": temperature,
    }

    log.debug("poe_call", bot=bot_name, schema=schema.__name__)

    _MAX_RETRIES = 5
    response = None
    for attempt in range(1, _MAX_RETRIES + 1):
        with httpx.Client(timeout=180.0) as client:
            response = client.post(
                _POE_BASE_URL,
                headers={
                    "Authorization": f"Bearer {settings.poe_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code == 200:
            break

        if response.status_code >= 500 and attempt < _MAX_RETRIES:
            delay = 2 * attempt
            log.warning(
                "poe_retry",
                attempt=attempt,
                max=_MAX_RETRIES,
                status=response.status_code,
                delay_s=delay,
            )
            time.sleep(delay)
            continue

        raise RuntimeError(
            f"Poe API error {response.status_code}: {response.text[:500]}"
        )

    data = response.json()
    raw = data["choices"][0]["message"]["content"]

    log.debug("poe_raw_response", length=len(raw))

    # Capture trace for dashboard visibility
    prompt_tokens   = _estimate_tokens(merged)
    response_tokens = _estimate_tokens(raw)
    _traces.append({
        "agent": schema.__name__,
        "bot": bot_name,
        "merged_prompt": merged,
        "raw_response": raw,
        "prompt_tokens": prompt_tokens,
        "response_tokens": response_tokens,
        "total_tokens": prompt_tokens + response_tokens,
    })

    if not raw:
        raise ValueError("Poe API 回傳空白回應")

    # Strip markdown code fences if present
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
