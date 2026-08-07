"""DSE past-exam admin uploader settings shared with backend/mcq_generator/.env."""
from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_HERE = Path(__file__).parent
_ENV = _HERE.parent / "mcq_generator" / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_service_key: str = Field(..., description="Supabase service-role key")
    dse_past_exam_table: str = Field(
        "dsemcq_dse_past_exam_questions",
        description="Target table for DSE past-exam question rows",
    )


settings = Settings()  # type: ignore[call-arg]
