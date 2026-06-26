"""Tip card generator settings shared with the other backend tools."""
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

    poe_api_key: str = Field(..., description="Poe API key")
    tip_card_bot_name: str = Field("GPT-5.4-Mini", description="Poe bot name for tip card generation")
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_service_key: str = Field(..., description="Supabase service-role key")
    s3_tip_card_base_url: str = Field(
        "https://tb6-mood.s3.ap-southeast-2.amazonaws.com/dse_chi/",
        description="Base URL for generated tip card images",
    )


settings = Settings()  # type: ignore[call-arg]