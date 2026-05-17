"""
心理測驗生成系統 — FastAPI server。

啟動方式：
    python -m uvicorn server:app --reload --port 8766
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from supabase import create_client

from config import settings

app = FastAPI(title="心理測驗 Admin API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_HERE = Path(__file__).parent


def _get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_key)


# ─── System prompts ───────────────────────────────────────────────────────────

_SCHEMA_HINT = """
You MUST output ONLY a single valid JSON object — no markdown fences, no explanation text.
The JSON schema is:
{
  "id": "psy-<slug>-v1",
  "slug": "<slug>",
  "title": "Chinese title",
  "description": "Chinese subtitle / description",
  "icon_name": "brain",
  "estimated_minutes": 3,
  "color_hex": "#XXXXXX",
  "position": <integer 1-99>,
  "is_active": true,
  "featured": false,
  "questions": [
    {
      "q": "Question text in Traditional Chinese",
      "options": [
        {"label": "A", "text": "Option text in Traditional Chinese", "score_key": "<result_code>"},
        {"label": "B", "text": "...", "score_key": "<result_code>"},
        {"label": "C", "text": "...", "score_key": "<result_code>"},
        {"label": "D", "text": "...", "score_key": "<result_code>"}
      ]
    }
  ],
  "results": [
    {
      "code": "<result_code>",
      "title": "Result title in Traditional Chinese",
      "description": "Detailed description in Traditional Chinese (3+ sentences)",
      "emoji": "🏛️",
      "historical_figure": "Brief descriptor (optional — omit key if not applicable)",
      "historical_background": "Background in Traditional Chinese (optional)",
      "strengths": ["strength1", "strength2"],
      "weaknesses": ["weakness1"],
      "famous_quote": "A famous quote or motto",
      "study_tips": ["tip1", "tip2"],
      "scoring": {"<result_code>": 1}
    }
  ]
}
Allowed icon_name values: brain, heart, book, star, compass, lightbulb, target, puzzle, shield, flame.
Scoring rule: each answer increments the chosen score_key counter; the result code with the highest tally wins.
""".strip()

def _build_system_prompt(hint: str, question_count: int, result_count: int) -> str:
    """Build the LLM system prompt from a free-form hint."""
    base = (
        "You are an expert educational psychologist creating personality and learning assessments "
        "for Hong Kong secondary school students (DSE level). "
        "All question and result content MUST be in Traditional Chinese (繁體中文). "
        "Make the test engaging, culturally relevant, and educationally valuable.\n\n"
    )
    direction = (
        f"Test direction from the content editor:\n{hint.strip()}\n\n"
        if hint.strip()
        else "Create an original and engaging personality test appropriate for HK DSE students.\n\n"
    )
    constraints = (
        f"Generate exactly {question_count} questions and exactly {result_count} result types. "
        "Each question must have exactly 4 options (A, B, C, D). "
        "Each option's score_key must map to one of the result codes. "
        "Scoring: the result code with the highest tally across all chosen options wins.\n\n"
    )
    return base + direction + constraints + _SCHEMA_HINT


# ─── Request / Response models ────────────────────────────────────────────────


class GenerateRequest(BaseModel):
    hint: str = ""  # Free-form test direction sent directly to the LLM
    question_count: int = 10
    result_count: int = 5
    bot_name: str = "Claude-3.7-Sonnet"


class PushRequest(BaseModel):
    test_json: dict[str, Any]


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/")
def serve_dashboard():
    html_path = _HERE / "dashboard.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="dashboard.html not found")
    return FileResponse(str(html_path), media_type="text/html")


@app.get("/api/health")
def health_check() -> dict[str, Any]:
    """Check Supabase connectivity."""
    try:
        sb = _get_supabase()
        resp = sb.table("dsemcq_psych_tests").select("id").limit(1).execute()
        return {"status": "ok", "table_accessible": True}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


@app.get("/api/list-tests")
def list_tests() -> list[dict[str, Any]]:
    """Return all psych tests with metadata."""
    try:
        sb = _get_supabase()
        resp = (
            sb.table("dsemcq_psych_tests")
            .select("id,title,position,is_active,featured,questions")
            .order("position", desc=False)
            .execute()
        )
        rows = resp.data or []
        result = []
        for row in rows:
            questions = row.get("questions") or []
            result.append({
                "id": row.get("id"),
                "title": row.get("title"),
                "position": row.get("position"),
                "is_active": row.get("is_active"),
                "featured": row.get("featured"),
                "question_count": len(questions) if isinstance(questions, list) else 0,
            })
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> dict[str, Any]:
    """Call Poe API to generate a psych test JSON."""
    question_count = max(5, min(100, req.question_count))
    result_count = max(3, min(100, req.result_count))

    system_prompt = _build_system_prompt(req.hint, question_count, result_count)

    bot_name = req.bot_name or settings.psy_bot_name

    payload = {
        "model": bot_name,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": (
                    f"請根據以下方向，為香港DSE學生生成一個完整的心理測驗 JSON。\n"
                    f"方向：{req.hint or '自由發揮，創作一個適合DSE學生的有趣心理測驗'}\n"
                    f"問題數量：{question_count} 題，結果類型：{result_count} 種。\n"
                    f"直接輸出 JSON，不要任何其他文字或 markdown 符號。"
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

    # Strip markdown fences if the LLM wrapped in ```json ... ```
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())

    try:
        test_json = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"LLM returned invalid JSON: {exc}. Raw output: {raw_text[:500]}",
        ) from exc

    return {"test_json": test_json, "raw_text": raw_text}


@app.post("/api/push")
def push_test(req: PushRequest) -> dict[str, Any]:
    """Upsert a psych test to Supabase dsemcq_psych_tests table."""
    test = req.test_json

    required_fields = ["id", "title", "description", "questions", "results"]
    missing = [f for f in required_fields if f not in test]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required fields: {missing}",
        )

    questions = test.get("questions", [])
    row = {
        "id": test["id"],
        "slug": test.get("slug") or test["id"],
        "title": test.get("title"),
        "description": test.get("description"),
        "icon_name": test.get("icon_name", "brain"),
        "question_count": len(questions) if isinstance(questions, list) else test.get("question_count", 0),
        "estimated_minutes": test.get("estimated_minutes", 3),
        "is_active": test.get("is_active", False),
        "color_hex": test.get("color_hex"),
        "position": test.get("position"),
        "featured": test.get("featured", False),
        "questions": questions,
        "results": test.get("results", []),
    }

    try:
        sb = _get_supabase()
        resp = (
            sb.table("dsemcq_psych_tests")
            .upsert(row, on_conflict="id")
            .execute()
        )
        upserted = resp.data or []
        return {
            "success": True,
            "upserted_id": test["id"],
            "rows_affected": len(upserted),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.patch("/api/tests/{test_id}/position")
def update_position(test_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Update the position of a test."""
    position = body.get("position")
    if position is None:
        raise HTTPException(status_code=422, detail="position is required")
    try:
        sb = _get_supabase()
        sb.table("dsemcq_psych_tests").update({"position": int(position)}).eq("id", test_id).execute()
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.patch("/api/tests/{test_id}/toggle-active")
def toggle_active(test_id: str) -> dict[str, Any]:
    """Toggle the is_active flag of a test."""
    try:
        sb = _get_supabase()
        resp = sb.table("dsemcq_psych_tests").select("is_active").eq("id", test_id).single().execute()
        current = resp.data.get("is_active", False) if resp.data else False
        sb.table("dsemcq_psych_tests").update({"is_active": not current}).eq("id", test_id).execute()
        return {"success": True, "is_active": not current}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/api/tests/{test_id}")
def delete_test(test_id: str) -> dict[str, Any]:
    """Permanently delete a single psych test and all its user results."""
    try:
        sb = _get_supabase()
        # Delete user results first (relational integrity)
        sb.table("dsemcq_psych_user_results").delete().eq("test_id", test_id).execute()
        sb.table("dsemcq_psych_tests").delete().eq("id", test_id).execute()
        return {"success": True, "deleted_id": test_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/api/tests")
def delete_all_tests() -> dict[str, Any]:
    """Permanently delete ALL psych tests and all user results. Use with caution."""
    try:
        sb = _get_supabase()
        # Delete user results first, then tests
        sb.table("dsemcq_psych_user_results").delete().neq("test_id", "").execute()
        sb.table("dsemcq_psych_tests").delete().neq("id", "").execute()
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8766, reload=True, log_level="info")
