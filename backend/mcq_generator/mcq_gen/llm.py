"""Poe API wrapper — OpenAI-compatible endpoint at https://api.poe.com/v1"""
from __future__ import annotations

import json
import threading
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


# ─── Trace Capture (thread-local for parallel request safety) ────────────────

_local = threading.local()


def _repair_json(s: str) -> str:
    """Attempt to fix common JSON errors from weak LLMs.

    Fixes:
    - Trailing commas before ] or }
    - Missing commas between } and { (adjacent objects in array)
    - Missing commas between } and "key" (adjacent properties)
    - Truncated JSON (unclosed brackets/braces)
    """
    import re as _re

    # Remove trailing commas: ,] or ,}
    s = _re.sub(r",\s*([}\]])", r"\1", s)

    # Insert missing commas: }{ → },{
    s = _re.sub(r"}\s*{", "},{", s)

    # Insert missing commas: }"key" → },"key"
    s = _re.sub(r'}\s*"', '},"', s)

    # Insert missing commas between string values on adjacent lines
    s = _re.sub(r'"\s*\n\s*"', '","', s)

    # Fix truncated JSON: close any unclosed brackets/braces in the right order
    stack: list[str] = []
    in_str = False
    escape = False
    for ch in s:
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"' and not escape:
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in ("}", "]") and stack:
            stack.pop()

    # Close in reverse order
    s += "".join(reversed(stack))

    return s


def _get_traces_list() -> list[dict]:
    """Get the thread-local traces list, creating it if needed."""
    if not hasattr(_local, "traces"):
        _local.traces = []
    return _local.traces


def reset_traces() -> None:
    """Clear all captured LLM call traces (call before each run)."""
    _local.traces = []


def get_traces() -> list[dict]:
    """Return a copy of captured traces since last reset_traces() call."""
    return list(_get_traces_list())


def chat_freeform(
    user_message: str,
    *,
    model: str | None = None,
    temperature: float = 0.7,
) -> str:
    """
    呼叫 Poe OpenAI-compatible API，直接回傳原始文字回應（不做 JSON 解析）。
    適用於 test-run 預覽：讓管理員看到 LLM 的完整原始輸出。
    """
    bot_name = model or settings.poe_bot_name
    merged = user_message.strip()

    payload = {
        "model": bot_name,
        "messages": [{"role": "user", "content": merged}],
        "temperature": temperature,
    }

    log.debug("poe_freeform_call", bot=bot_name)

    _MAX_RETRIES = 5
    response = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=180.0) as client:
                response = client.post(
                    _POE_BASE_URL,
                    headers={
                        "Authorization": f"Bearer {settings.poe_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError,
                httpx.WriteError, httpx.PoolTimeout, ConnectionError, OSError) as exc:
            if attempt < _MAX_RETRIES:
                delay = 3 * attempt
                log.warning("poe_connection_retry", attempt=attempt, max=_MAX_RETRIES,
                            error=str(exc)[:200], delay_s=delay)
                time.sleep(delay)
                continue
            raise RuntimeError(f"Poe API connection failed after {_MAX_RETRIES} retries: {exc}") from exc

        if response.status_code == 200:
            break

        if response.status_code >= 500 and attempt < _MAX_RETRIES:
            delay = 2 * attempt
            log.warning("poe_retry", attempt=attempt, max=_MAX_RETRIES,
                        status=response.status_code, delay_s=delay)
            time.sleep(delay)
            continue

        raise RuntimeError(
            f"Poe API error {response.status_code}: {response.text[:500]}"
        )

    data = response.json()
    raw = data["choices"][0]["message"]["content"]

    prompt_tokens = _estimate_tokens(merged)
    response_tokens = _estimate_tokens(raw)
    _get_traces_list().append({
        "agent": "freeform",
        "bot": bot_name,
        "merged_prompt": merged,
        "raw_response": raw,
        "prompt_tokens": prompt_tokens,
        "response_tokens": response_tokens,
        "total_tokens": prompt_tokens + response_tokens,
    })

    log.debug("poe_freeform_response", length=len(raw))
    return raw


def chat_structured(
    user_message: str,
    schema: type[T],
    *,
    system_prompt: str = "",
    temperature: float = 0.7,
    model: str | None = None,
) -> T:
    """
    呼叫 Poe OpenAI-compatible API，解析 JSON 回傳值為 Pydantic model。

    When system_prompt is provided, it is merged with user_message via a '---'
    separator (Poe bots ignore the system role). When system_prompt is empty,
    the user_message is sent directly as a single unified prompt.
    """
    bot_name = model or settings.poe_bot_name

    if system_prompt.strip():
        merged = f"{system_prompt.strip()}\n\n---\n\n{user_message.strip()}"
    else:
        merged = user_message.strip()

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
        try:
            with httpx.Client(timeout=180.0) as client:
                response = client.post(
                    _POE_BASE_URL,
                    headers={
                        "Authorization": f"Bearer {settings.poe_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError,
                httpx.WriteError, httpx.PoolTimeout, ConnectionError, OSError) as exc:
            if attempt < _MAX_RETRIES:
                delay = 3 * attempt
                log.warning("poe_connection_retry", attempt=attempt, max=_MAX_RETRIES,
                            error=str(exc)[:200], delay_s=delay)
                time.sleep(delay)
                continue
            raise RuntimeError(f"Poe API connection failed after {_MAX_RETRIES} retries: {exc}") from exc

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
    _get_traces_list().append({
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
    except Exception:
        pass

    # Fall back: extract outermost JSON object
    start = stripped.find("{")
    end = stripped.rfind("}") + 1
    if start >= 0 and end > start:
        json_str = stripped[start:end]
        try:
            return schema.model_validate_json(json_str)
        except Exception:
            pass

        # Attempt JSON repair for common weak-LLM issues
        repaired = _repair_json(json_str)
        if repaired != json_str:
            try:
                return schema.model_validate_json(repaired)
            except Exception:
                pass

    log.error("poe_parse_error", raw=stripped[:500])
    raise ValueError(f"JSON 解析失敗: {stripped[:300]}")
