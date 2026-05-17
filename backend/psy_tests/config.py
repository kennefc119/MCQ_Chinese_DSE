"""心理測驗生成系統設定 — 從 mcq_generator 的 .env 讀取，共享同一份設定檔。"""
from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_HERE = Path(__file__).parent          # backend/psy_tests/
_ENV  = _HERE.parent / "mcq_generator" / ".env"  # shared with mcq_generator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Poe API
    poe_api_key: str = Field(..., description="Poe API key")

    # Bot name used for psych test generation
    psy_bot_name: str = Field("GPT-5.4-Mini", description="Poe bot name for psych test generation")

    # Supabase
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_service_key: str = Field(..., description="Supabase service-role key")

    # Generation limits
    max_questions: int = Field(100, ge=1, le=100, description="Maximum questions per test")


# 全域單例
settings = Settings()  # type: ignore[call-arg]
