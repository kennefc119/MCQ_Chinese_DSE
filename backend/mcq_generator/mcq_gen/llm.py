"""OpenAI 呼叫 wrapper — structured output + 統一錯誤處理。"""
from __future__ import annotations

import json
from typing import TypeVar

import structlog
from openai import OpenAI
from pydantic import BaseModel

from .config import settings

log = structlog.get_logger(__name__)

T = TypeVar("T", bound=BaseModel)

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def chat_structured(
    system_prompt: str,
    user_message: str,
    schema: type[T],
    *,
    temperature: float = 0.7,
    model: str | None = None,
) -> T:
    """
    呼叫 OpenAI，要求回傳嚴格 JSON，然後用 Pydantic 解析驗證。

    若解析失敗會 raise ValueError。
    """
    chosen_model = model or settings.openai_model
    client = get_client()

    log.debug("llm_call", model=chosen_model, schema=schema.__name__)

    response = client.chat.completions.create(
        model=chosen_model,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )

    raw = response.choices[0].message.content or ""
    log.debug("llm_raw_response", length=len(raw))

    try:
        parsed = schema.model_validate_json(raw)
    except Exception as exc:
        log.error("llm_parse_error", raw=raw[:500], error=str(exc))
        # 嘗試修復：有時模型會用 markdown code block 包住 JSON
        stripped = raw.strip()
        if stripped.startswith("```"):
            lines = stripped.splitlines()
            inner = "\n".join(
                l for l in lines if not l.startswith("```")
            )
            parsed = schema.model_validate(json.loads(inner))
        else:
            raise ValueError(f"LLM JSON 解析失敗: {exc}") from exc

    return parsed
