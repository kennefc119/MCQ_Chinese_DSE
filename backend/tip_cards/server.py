"""Tip card generation system — FastAPI server."""
from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from supabase import create_client

from config import settings

app = FastAPI(title="Tip Card Admin API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_HERE = Path(__file__).parent
_TIP_IMAGE_FILES = ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png"]
_TIP_CATEGORIES = ["exam_tip", "rest", "study", "wellness"]


def _get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_key)


def _pick_random_image_url() -> str:
    image_file = random.choice(_TIP_IMAGE_FILES)
    return f"{settings.s3_tip_card_base_url}{image_file}"


def _normalize_category(value: Any) -> str:
    category = str(value or "study").strip().lower()
    if category not in _TIP_CATEGORIES:
      return "study"
    return category


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or f"tip-{random.randint(1000, 9999)}"


_SCHEMA_HINT = """
You MUST output ONLY a single valid JSON object — no markdown fences, no explanation text.
The JSON schema is:
{
  "id": "tip-<slug>",
  "title": "Tip card title in Traditional Chinese",
  "subtitle": "Short subtitle in Traditional Chinese",
  "body": "Full body in Traditional Chinese with paragraph breaks represented by \\n",
  "category": "exam_tip | rest | study | wellness",
  "position": 0,
  "is_active": true,
  "read_time_minutes": 1,
  "related_passage_ids": ["p01"],
  "author": "Author name in Traditional Chinese or short source label",
  "cta_label": "Short CTA in Traditional Chinese"
}
Rules:
- The admin hint is internal guidance only and MUST NOT be copied verbatim into any field.
- All visible text MUST be Traditional Chinese for Hong Kong DSE students.
- body must be useful, specific, and well structured in 2 to 5 paragraphs.
- related_passage_ids may be an empty array when not applicable.
- category must be exactly one of: exam_tip, rest, study, wellness.
- cta_label should be short and actionable.
""".strip()


def _build_system_prompt(hint: str) -> str:
    base = (
        "You are an expert DSE Chinese learning coach creating short in-app tip cards for Hong Kong students. "
        "Write in polished, natural Traditional Chinese. Keep the tone practical, encouraging, and specific.\n\n"
    )
    direction = (
        f"Admin hint for internal generation guidance:\n{hint.strip()}\n\n"
        if hint.strip()
        else "Create an original, useful DSE tip card suitable for Hong Kong students.\n\n"
    )
    constraints = (
        "Generate one complete tip card row. The hint is not visible content and must only shape the card. "
        "Return JSON only.\n\n"
    )
    return base + direction + constraints + _SCHEMA_HINT


class GenerateRequest(BaseModel):
    hint: str = ""
    bot_name: str = "GPT-5.4-Mini"


class PushRequest(BaseModel):
    card_json: dict[str, Any]


@app.get("/")
def serve_dashboard():
    html_path = _HERE / "dashboard.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="dashboard.html not found")
    return FileResponse(str(html_path), media_type="text/html")


@app.get("/api/health")
def health_check() -> dict[str, Any]:
    try:
        sb = _get_supabase()
        sb.table("dsemcq_tip_cards").select("id").limit(1).execute()
        return {"status": "ok", "table_accessible": True}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


@app.get("/api/list-cards")
def list_cards() -> dict[str, Any]:
    try:
        sb = _get_supabase()
        resp = (
            sb.table("dsemcq_tip_cards")
            .select("id,title,subtitle,category,position,is_active,read_time_minutes,image_url,cta_label,author,related_passage_ids")
            .order("position", desc=False)
            .execute()
        )
        rows = resp.data or []
        category_counts = {key: 0 for key in _TIP_CATEGORIES}
        image_counts: dict[str, int] = {}
        positions: list[int] = []
        read_times: dict[int, int] = {}

        for row in rows:
            category = _normalize_category(row.get("category"))
            category_counts[category] = category_counts.get(category, 0) + 1
            image_url = row.get("image_url") or ""
            if image_url:
                image_counts[image_url] = image_counts.get(image_url, 0) + 1
            position = int(row.get("position") or 0)
            positions.append(position)
            read_time = int(row.get("read_time_minutes") or 0)
            read_times[read_time] = read_times.get(read_time, 0) + 1

        duplicate_positions = sorted({p for p in positions if positions.count(p) > 1})
        repeated_images = sorted(
            [{"image_url": url, "count": count} for url, count in image_counts.items() if count > 1],
            key=lambda item: (-item["count"], item["image_url"]),
        )
        cards = [
            {
                "id": row.get("id"),
                "title": row.get("title"),
                "subtitle": row.get("subtitle"),
                "category": _normalize_category(row.get("category")),
                "position": int(row.get("position") or 0),
                "is_active": bool(row.get("is_active", False)),
                "read_time_minutes": int(row.get("read_time_minutes") or 0),
                "image_url": row.get("image_url"),
                "cta_label": row.get("cta_label"),
                "author": row.get("author"),
                "related_passage_ids": row.get("related_passage_ids") or [],
            }
            for row in rows
        ]
        return {
            "cards": cards,
            "analysis": {
                "total": len(cards),
                "active": sum(1 for card in cards if card["is_active"]),
                "inactive": sum(1 for card in cards if not card["is_active"]),
                "category_counts": category_counts,
                "read_time_counts": read_times,
                "duplicate_positions": duplicate_positions,
                "repeated_images": repeated_images,
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> dict[str, Any]:
    system_prompt = _build_system_prompt(req.hint)
    bot_name = req.bot_name or settings.tip_card_bot_name
    payload = {
        "model": bot_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "請根據管理員提示，生成一張完整的 DSE 文言／中文學習貼士卡 JSON。"
                    "直接輸出 JSON，不要加入任何 markdown 或說明文字。"
                ),
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.poe.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.poe_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Poe API error {exc.response.status_code}: {exc.response.text[:300]}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Poe API request failed: {exc}") from exc

    data = response.json()
    raw_text: str = data["choices"][0]["message"]["content"]
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())

    try:
        card_json = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"LLM returned invalid JSON: {exc}. Raw output: {raw_text[:500]}",
        ) from exc

    card_json["category"] = _normalize_category(card_json.get("category"))
    card_json["image_url"] = _pick_random_image_url()
    if not card_json.get("id"):
        slug_seed = card_json.get("title") or req.hint or "tip-card"
        card_json["id"] = f"tip-{_slugify(slug_seed)}"
    return {"card_json": card_json, "raw_text": raw_text}


def _prepare_card_row(card: dict[str, Any]) -> dict[str, Any]:
    required_fields = ["id", "title", "body"]
    missing = [field for field in required_fields if not card.get(field)]
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing required fields: {missing}")

    related_passage_ids = card.get("related_passage_ids") or []
    if not isinstance(related_passage_ids, list):
        related_passage_ids = []

    position = card.get("position")
    try:
        normalized_position = int(position) if position is not None else 0
    except (TypeError, ValueError):
        normalized_position = 0

    read_time = card.get("read_time_minutes")
    try:
        normalized_read_time = max(1, int(read_time)) if read_time is not None else 1
    except (TypeError, ValueError):
        normalized_read_time = 1

    return {
        "id": str(card["id"]),
        "title": str(card.get("title") or "").strip(),
        "subtitle": str(card.get("subtitle") or "").strip() or None,
        "body": str(card.get("body") or "").strip(),
        "image_url": str(card.get("image_url") or _pick_random_image_url()).strip(),
        "category": _normalize_category(card.get("category")),
        "position": normalized_position,
        "is_active": bool(card.get("is_active", True)),
        "read_time_minutes": normalized_read_time,
        "related_passage_ids": [str(item) for item in related_passage_ids if str(item).strip()],
        "author": str(card.get("author") or "").strip() or None,
        "cta_label": str(card.get("cta_label") or "").strip() or None,
    }


@app.post("/api/push")
def push_card(req: PushRequest) -> dict[str, Any]:
    row = _prepare_card_row(req.card_json)
    try:
        sb = _get_supabase()
        resp = sb.table("dsemcq_tip_cards").upsert(row, on_conflict="id").execute()
        upserted = resp.data or []
        return {
            "success": True,
            "upserted_id": row["id"],
            "rows_affected": len(upserted),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.patch("/api/cards/{card_id}/toggle-active")
def toggle_active(card_id: str) -> dict[str, Any]:
    try:
        sb = _get_supabase()
        resp = sb.table("dsemcq_tip_cards").select("is_active").eq("id", card_id).single().execute()
        current = bool(resp.data.get("is_active", False)) if resp.data else False
        sb.table("dsemcq_tip_cards").update({"is_active": not current}).eq("id", card_id).execute()
        return {"success": True, "is_active": not current}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/api/cards/{card_id}")
def delete_card(card_id: str) -> dict[str, Any]:
    try:
        sb = _get_supabase()
        sb.table("dsemcq_tip_cards").delete().eq("id", card_id).execute()
        return {"success": True, "deleted_id": card_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc