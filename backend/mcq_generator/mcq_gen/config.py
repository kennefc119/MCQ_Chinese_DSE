"""應用程式設定 — 從 .env 讀取，使用 pydantic-settings 驗證。"""
from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_HERE = Path(__file__).parent.parent  # backend/mcq_generator/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_HERE / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Poe API  (poe.com → Settings → API Key)
    poe_api_key: str = Field(..., description="Poe API key")

    # Default bot — used as fallback when a role-specific bot is not set
    poe_bot_name: str = Field("Claude-3.7-Sonnet", description="Default Poe bot name (fallback)")

    # Per-role bot overrides (fall back to poe_bot_name if not set)
    poe_bot_strategist: str | None = Field(None, description="Bot for the Strategist agent (role 1: topic planner)")
    poe_bot_drafter: str | None = Field(None, description="Bot for the Drafter agent (role 2: question writer)")
    poe_bot_critic: str | None = Field(None, description="Bot for the Critic agent (role 3: question reviewer)")

    # Supabase
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_service_key: str = Field(..., description="Supabase service-role key")

    # 執行控制
    max_cycles_per_run: int = Field(50, ge=1, le=500)
    max_revise_iterations: int = Field(3, ge=1, le=5)
    sleep_between_cycles_seconds: float = Field(1.0, ge=0)
    default_source_tag: str = Field("agent-v2")

    # ── Convenience accessors ──────────────────────────────────────────────────
    @property
    def strategist_bot(self) -> str:
        return self.poe_bot_strategist or self.poe_bot_name

    @property
    def drafter_bot(self) -> str:
        return self.poe_bot_drafter or self.poe_bot_name

    @property
    def critic_bot(self) -> str:
        return self.poe_bot_critic or self.poe_bot_name


# 全域單例
settings = Settings()  # type: ignore[call-arg]
