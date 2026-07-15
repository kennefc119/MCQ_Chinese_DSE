"""Non-designated passage generator settings shared with mcq_generator .env."""
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
    nd_passage_bot_name: str = Field(
        "ChiPassageResearch",
        description="Poe bot name for non-designated passage generation",
    )
    nd_passage_critic_bot_name: str = Field(
        "ChiResearchCrit",
        description="Poe bot name for non-designated passage fact-checking",
    )
    nd_passage_translation_bot_name: str = Field(
        "ChiResearchTrans",
        description="Poe bot name for 文言文詳細語譯 generation",
    )
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_service_key: str = Field(..., description="Supabase service-role key")


settings = Settings()  # type: ignore[call-arg]