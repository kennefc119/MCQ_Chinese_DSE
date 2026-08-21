"""Reviewer-local Poe client with structured JSON retries and thread-local traces."""
from __future__ import annotations

import os
import threading
import time
from typing import TypeVar

import httpx
import structlog
from pydantic import BaseModel

from config import settings

log = structlog.get_logger(__name__)
T = TypeVar("T", bound=BaseModel)
_POE_BASE_URL = "https://api.poe.com/v1/chat/completions"
_local = threading.local()


def _env_float(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


_REQUEST_DELAY_SECONDS = _env_float("MCQ_REVIEWER_REQUEST_DELAY_SECONDS", 0.4)
_MAX_CONCURRENT_REQUESTS = min(
    100,
    _env_int("MCQ_REVIEWER_MAX_CONCURRENT_REQUESTS", 8),
)
_request_gate = threading.Condition()
_active_requests = 0
_next_request_at = 0.0


def _acquire_request_slot() -> None:
    global _active_requests, _next_request_at
    with _request_gate:
        while True:
            now = time.monotonic()
            wait_seconds = _next_request_at - now
            if (
                _active_requests < _MAX_CONCURRENT_REQUESTS
                and wait_seconds <= 0
            ):
                _active_requests += 1
                _next_request_at = now + _REQUEST_DELAY_SECONDS
                return
            _request_gate.wait(timeout=wait_seconds if wait_seconds > 0 else None)


def _release_request_slot() -> None:
    global _active_requests
    with _request_gate:
        _active_requests -= 1
        _request_gate.notify_all()


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 2)


def _get_traces_list() -> list[dict]:
    if not hasattr(_local, "traces"):
        _local.traces = []
    return _local.traces


def reset_traces() -> None:
    _local.traces = []


def get_traces() -> list[dict]:
    return list(_get_traces_list())


def _repair_json(value: str) -> str:
    import re

    value = re.sub(r",\s*([}\]])", r"\1", value)
    value = re.sub(r"}\s*{", "},{", value)
    value = re.sub(r'}\s*"', '},"', value)
    value = re.sub(r'"\s*\n\s*"', '","', value)

    stack: list[str] = []
    in_string = False
    escaped = False
    for char in value:
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            stack.append("}")
        elif char == "[":
            stack.append("]")
        elif char in ("}", "]") and stack:
            stack.pop()
    return value + "".join(reversed(stack))


def _parse_response(raw: str, schema: type[T]) -> tuple[T | None, str]:
    if not raw:
        return None, "Poe API returned an empty response"

    stripped = raw.strip()
    if stripped.startswith("```"):
        stripped = "\n".join(
            line for line in stripped.splitlines() if not line.startswith("```")
        ).strip()

    errors: list[str] = []
    for candidate in (stripped,):
        try:
            return schema.model_validate_json(candidate), ""
        except Exception as exc:
            errors.append(str(exc))

    start = stripped.find("{")
    end = stripped.rfind("}") + 1
    if start >= 0 and end > start:
        extracted = stripped[start:end]
        try:
            return schema.model_validate_json(extracted), ""
        except Exception as exc:
            errors.append(str(exc))
        repaired = _repair_json(extracted)
        if repaired != extracted:
            try:
                return schema.model_validate_json(repaired), ""
            except Exception as exc:
                errors.append(str(exc))

    return None, f"JSON parsing failed: {errors[-1] if errors else stripped[:300]}"


def _request(prompt: str, bot_name: str, temperature: float) -> str:
    payload = {
        "model": bot_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }
    max_transport_retries = 5
    response = None
    for attempt in range(1, max_transport_retries + 1):
        _acquire_request_slot()
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
        except (httpx.TransportError, ConnectionError, OSError) as exc:
            if attempt < max_transport_retries:
                time.sleep(3 * attempt)
                continue
            raise RuntimeError(
                f"Poe API connection failed after {max_transport_retries} retries: {exc}"
            ) from exc
        finally:
            _release_request_slot()

        if response.status_code == 200:
            break
        if response.status_code == 429 or response.status_code >= 500:
            if attempt < max_transport_retries:
                retry_delay = 2 * attempt
                if response.status_code == 429:
                    try:
                        retry_delay = max(
                            retry_delay,
                            float(response.headers.get("Retry-After", "0")),
                        )
                    except (TypeError, ValueError):
                        pass
                time.sleep(retry_delay)
                continue
        raise RuntimeError(f"Poe API error {response.status_code}: {response.text[:500]}")

    data = response.json()
    return data["choices"][0]["message"]["content"]


def chat_structured(
    user_message: str,
    schema: type[T],
    *,
    system_prompt: str = "",
    temperature: float = 0.7,
    model: str | None = None,
    max_json_retries: int = 3,
) -> T:
    """Call Poe with up to three JSON-format retries and record every attempt."""
    bot_name = model or settings.poe_bot_name
    merged_prompt = (
        f"{system_prompt.strip()}\n\n---\n\n{user_message.strip()}"
        if system_prompt.strip()
        else user_message.strip()
    )
    retry_limit = max(0, min(3, max_json_retries))

    for json_attempt in range(1, retry_limit + 2):
        prompt = merged_prompt
        if json_attempt > 1:
            prompt += (
                "\n\n上一回覆未能通過 JSON 格式或資料結構驗證。"
                "請重新作答，只輸出一個完整、有效、符合指定 schema 的 JSON object，"
                "不要輸出 markdown、解釋文字或截斷內容。"
            )
        raw = _request(prompt, bot_name, temperature)
        parsed, parse_error = _parse_response(raw, schema)
        prompt_tokens = _estimate_tokens(prompt)
        response_tokens = _estimate_tokens(raw)
        trace = {
            "agent": schema.__name__,
            "bot": bot_name,
            "merged_prompt": prompt,
            "raw_response": raw,
            "prompt_tokens": prompt_tokens,
            "response_tokens": response_tokens,
            "total_tokens": prompt_tokens + response_tokens,
            "json_attempt": json_attempt,
            "max_json_retries": retry_limit,
            "parse_ok": parsed is not None,
        }
        if parse_error:
            trace["parse_error"] = parse_error
        _get_traces_list().append(trace)
        if parsed is not None:
            return parsed
        if json_attempt <= retry_limit:
            log.warning("reviewer_json_retry", attempt=json_attempt, max_retries=retry_limit)
            continue
        raise ValueError(parse_error)

    raise RuntimeError("Structured reviewer call ended without a response")
