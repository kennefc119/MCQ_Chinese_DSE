from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from config import settings


SETTINGS_PATH = Path(__file__).parent / "data" / "settings.json"


def get_runtime_settings() -> dict[str, Any]:
    return {
        "critic_bot": settings.critic_bot,
        "corrector_bot": settings.corrector_bot,
        "max_revise_iterations": settings.max_revise_iterations,
    }


def update_runtime_settings(
    *,
    critic_bot: str,
    corrector_bot: str,
    max_revise_iterations: int,
) -> dict[str, Any]:
    updated = _apply_runtime_settings(
        critic_bot=critic_bot,
        corrector_bot=corrector_bot,
        max_revise_iterations=max_revise_iterations,
    )
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(updated, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return updated


def _apply_runtime_settings(
    *,
    critic_bot: str,
    corrector_bot: str,
    max_revise_iterations: int,
) -> dict[str, Any]:
    critic = critic_bot.strip()
    corrector = corrector_bot.strip()
    if not critic or not corrector:
        raise ValueError("Critic and Corrector bot names are required")
    if not 1 <= max_revise_iterations <= 5:
        raise ValueError("Iteration rounds must be between 1 and 5")

    settings.poe_bot_critic = critic
    settings.poe_bot_corrector = corrector
    settings.max_revise_iterations = max_revise_iterations
    return get_runtime_settings()


def load_runtime_settings() -> dict[str, Any]:
    if not SETTINGS_PATH.exists():
        return get_runtime_settings()
    try:
        stored = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        return _apply_runtime_settings(
            critic_bot=str(stored.get("critic_bot") or settings.critic_bot),
            corrector_bot=str(stored.get("corrector_bot") or settings.corrector_bot),
            max_revise_iterations=int(
                stored.get("max_revise_iterations") or settings.max_revise_iterations
            ),
        )
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return get_runtime_settings()


load_runtime_settings()