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
  "title": "Chinese title",
  "description": "Chinese subtitle / description",
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
      "description": "Detailed description in Traditional Chinese",
      "emoji": "🏛️",
      "historical_figure": "Brief descriptor",
      "historical_background": "Background info in Traditional Chinese",
      "strengths": ["strength1", "strength2"],
      "weaknesses": ["weakness1"],
      "famous_quote": "A famous quote or motto",
      "study_tips": ["tip1", "tip2"],
      "scoring": {"<result_code>": 1}
    }
  ]
}
""".strip()

_DIMENSION_SCHEMA_HINT = """
You MUST output ONLY a single valid JSON object — no markdown fences, no explanation text.
For dimension-based scoring, each option increments a specific dimension score.
The final result is determined by the highest-scoring dimension.
The JSON schema is:
{
  "id": "psy-<slug>-v1",
  "title": "Chinese title",
  "description": "Chinese subtitle / description",
  "color_hex": "#XXXXXX",
  "position": <integer 1-99>,
  "is_active": true,
  "featured": false,
  "questions": [
    {
      "q": "Question text in Traditional Chinese",
      "options": [
        {"label": "A", "text": "Option text in Traditional Chinese", "score_key": "<dimension_code>"},
        {"label": "B", "text": "...", "score_key": "<dimension_code>"},
        {"label": "C", "text": "...", "score_key": "<dimension_code>"},
        {"label": "D", "text": "...", "score_key": "<dimension_code>"}
      ]
    }
  ],
  "results": [
    {
      "code": "<dimension_code>",
      "title": "Dimension title in Traditional Chinese",
      "description": "Detailed description in Traditional Chinese",
      "emoji": "📚",
      "strengths": ["strength1", "strength2"],
      "weaknesses": ["weakness1"],
      "study_tips": ["tip1", "tip2", "tip3"],
      "scoring": {"<dimension_code>": 1}
    }
  ]
}
""".strip()


def _build_system_prompt(test_type: str, question_count: int, result_count: int, custom_prompt: str) -> str:
    base = (
        "You are an expert educational psychologist creating personality and learning assessments "
        "for Hong Kong secondary school students (DSE level). "
        "All question and result content MUST be in Traditional Chinese (繁體中文). "
        "Make the test engaging, culturally relevant, and educationally valuable.\n\n"
    )

    if test_type == "character-match":
        type_prompt = (
            f"Create a character-matching personality test that matches students to famous historical Chinese figures. "
            f"Generate exactly {question_count} questions and exactly {result_count} historical figure results. "
            "Each question should have 4 options (A, B, C, D). Each option's score_key must map to one of the result codes. "
            "Choose historically significant figures from Chinese history (e.g. 諸葛亮, 武則天, 蘇軾, 屈原, 王昭君, 藺相如). "
            "Questions should probe personality traits like leadership, creativity, resilience, wisdom, loyalty. "
            f"{_SCHEMA_HINT}"
        )
    elif test_type == "study-style":
        type_prompt = (
            f"Create a learning/study style assessment for DSE students. "
            f"Generate exactly {question_count} questions and exactly {result_count} learning style dimensions. "
            "Each question should have 4 options (A, B, C, D). "
            "Use dimension-based scoring: options increment dimension scores, final result = highest dimension. "
            "Learning style dimensions should cover: visual/auditory/kinesthetic/reading-writing styles, "
            "deep vs surface learning, collaborative vs solitary learning, etc. "
            f"{_DIMENSION_SCHEMA_HINT}"
        )
    elif test_type == "career-inclination":
        type_prompt = (
            f"Create a career inclination assessment for DSE students exploring future paths. "
            f"Generate exactly {question_count} questions and exactly {result_count} career type results. "
            "Each question should have 4 options (A, B, C, D). "
            "Use dimension-based scoring: options increment career dimension scores, final result = highest dimension. "
            "Career types should be relevant to HK students: 理工科技, 商業金融, 人文社科, 創意藝術, 醫療護理, 教育服務, etc. "
            "Include actionable study_tips referencing specific DSE subjects relevant to each career path. "
            f"{_DIMENSION_SCHEMA_HINT}"
        )
    else:
        raise ValueError(f"Unknown test_type: {test_type}")

    extra = f"\n\nAdditional instructions: {custom_prompt}" if custom_prompt and custom_prompt.strip() else ""
    return base + type_prompt + extra


# ─── Request / Response models ────────────────────────────────────────────────


class GenerateRequest(BaseModel):
    test_type: str  # "character-match" | "study-style" | "career-inclination"
    question_count: int = 10
    result_count: int = 5
    bot_name: str = "Claude-3.7-Sonnet"
    custom_prompt: str = ""


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
    question_count = max(5, min(settings.max_questions, req.question_count))
    result_count = max(3, min(10, req.result_count))

    system_prompt = _build_system_prompt(
        req.test_type, question_count, result_count, req.custom_prompt
    )

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
                    f"請生成一個完整的心理測驗 JSON。"
                    f"測驗類型：{req.test_type}，"
                    f"問題數量：{question_count} 題，"
                    f"結果類型：{result_count} 種。"
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

    row = {
        "id": test["id"],
        "title": test.get("title"),
        "description": test.get("description"),
        "is_active": test.get("is_active", False),
        "color_hex": test.get("color_hex"),
        "position": test.get("position"),
        "featured": test.get("featured", False),
        "questions": test.get("questions", []),
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


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8766, reload=True, log_level="info")
