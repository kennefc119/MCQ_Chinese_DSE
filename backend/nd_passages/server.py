"""非指定篇章生成系統 — FastAPI server."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from supabase import create_client

from config import settings

app = FastAPI(title="非指定篇章 Admin API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_HERE = Path(__file__).parent
_PROMPTS_DIR = _HERE / "prompts"
_TABLE = "dsemcq_nd_passages"
_TRANSLATION_COLUMN = "detailed_translation"
_ALLOWED_REPRESENTATIONS = {"文言文", "白話文"}
_REPRESENTATION_ALIASES = {
    "文言": "文言文",
    "文言文": "文言文",
    "白話": "白話文",
    "白話文": "白話文",
    "白话": "白話文",
    "白话文": "白話文",
}
_DYNASTY_ALIASES = {
    "先秦": "先秦",
    "春秋": "先秦",
    "戰國": "先秦",
    "春秋戰國": "先秦",
    "两汉": "漢",
    "兩漢": "漢",
    "西漢": "漢",
    "東漢": "漢",
    "汉": "漢",
    "漢代": "漢",
    "魏晉": "魏晉",
    "魏晋": "魏晉",
    "唐代": "唐",
    "唐朝": "唐",
    "宋代": "宋",
    "宋朝": "宋",
    "元代": "元",
    "元朝": "元",
    "明代": "明",
    "明朝": "明",
    "清代": "清",
    "清朝": "清",
    "近代": "近代",
    "現代": "現代",
    "现代": "現代",
}
_TYPE_ALIASES = {
    "諸子散文": "諸子散文",
    "史傳": "史傳",
    "史传": "史傳",
    "古文": "古文",
    "唐詩": "唐詩",
    "唐诗": "唐詩",
    "宋詞": "宋詞",
    "宋词": "宋詞",
    "說理散文": "說理散文",
    "说理散文": "說理散文",
    "抒情散文": "抒情散文",
    "議論文": "議論文",
    "议论文": "議論文",
}
_MAX_IMAGE_DATA_URL_LENGTH = 7_000_000


def _read_prompt_file(filename: str) -> str:
        path = _PROMPTS_DIR / filename
        if not path.exists():
                raise RuntimeError(f"Prompt file not found: {path}")
        return path.read_text(encoding="utf-8").strip()


def _get_supabase():
    return create_client(settings.supabase_url, settings.supabase_service_key)


def _strip_markdown_fences(text: str) -> str:
    cleaned = re.sub(r"^```(?:json|markdown)?\s*", "", text.strip(), flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())
    return cleaned.strip()


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"[^\w\-\u4e00-\u9fff]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or f"nd-{datetime.now().strftime('%Y%m%d%H%M%S')}"


def _parse_title_author_dynasty(type_value: str, source_value: str) -> tuple[str | None, str | None]:
    dynasty = None
    author = None
    source_match = re.match(r"^(?P<author>[^《]+)《", source_value.strip())
    if source_match:
        author = source_match.group("author").strip()
    dynasty_match = re.match(r"^(?P<dynasty>[^・]+)・", type_value.strip())
    if dynasty_match:
        dynasty = dynasty_match.group("dynasty").strip()
    return dynasty, author


def _extract_markdown_blocks(text: str) -> list[dict[str, str]]:
    cleaned = _strip_markdown_fences(text)
    blocks = [segment.strip() for segment in re.split(r"\n---\n", cleaned) if segment.strip()]
    parsed: list[dict[str, str]] = []
    for block in blocks:
        lines = [line.rstrip() for line in block.splitlines()]
        data: dict[str, str] = {}
        current_key: str | None = None
        content_lines: list[str] = []
        for line in lines:
            if line.startswith("# "):
                data["title"] = line[2:].strip()
                current_key = None
                continue
            if line.startswith("## "):
                if current_key == "content" and content_lines:
                    data["content"] = "\n".join(content_lines).strip()
                    content_lines = []
                current_key = line[3:].strip().lower()
                continue
            if current_key == "content":
                content_lines.append(line)
            elif current_key:
                data[current_key] = (data.get(current_key, "") + ("\n" if data.get(current_key) else "") + line).strip()
        if current_key == "content" and content_lines:
            data["content"] = "\n".join(content_lines).strip()
        if data:
            parsed.append(data)
    return parsed


def _coerce_generated_payload(raw_text: str) -> list[dict[str, Any]]:
    cleaned = _strip_markdown_fences(raw_text)

    def _from_json_obj(decoded: Any) -> list[dict[str, Any]]:
        if isinstance(decoded, dict) and "passages" in decoded and isinstance(decoded["passages"], list):
            return [item for item in decoded["passages"] if isinstance(item, dict)]
        if isinstance(decoded, list):
            return [item for item in decoded if isinstance(item, dict)]
        if isinstance(decoded, dict):
            return [decoded]
        return []

    try:
        decoded = json.loads(cleaned)
        parsed = _from_json_obj(decoded)
        if parsed:
            return parsed
    except json.JSONDecodeError:
        pass

    fence_match = re.search(r"```(?:json)?\s*([\[{][\s\S]*?[\]}])\s*```", raw_text, flags=re.I)
    if fence_match:
        try:
            decoded = json.loads(fence_match.group(1).strip())
            parsed = _from_json_obj(decoded)
            if parsed:
                return parsed
        except json.JSONDecodeError:
            pass

    decoder = json.JSONDecoder()
    idx = 0
    while idx < len(raw_text):
        start_positions = [p for p in (raw_text.find("{", idx), raw_text.find("[", idx)) if p >= 0]
        if not start_positions:
            break
        start = min(start_positions)
        try:
            decoded, end = decoder.raw_decode(raw_text[start:])
        except json.JSONDecodeError:
            idx = start + 1
            continue
        parsed = _from_json_obj(decoded)
        if parsed:
            return parsed
        idx = start + max(end, 1)

    return _extract_markdown_blocks(raw_text)


def _coerce_critic_payload(raw_text: str) -> list[dict[str, Any]]:
    cleaned = _strip_markdown_fences(raw_text)

    def _decode_candidate(candidate: str) -> dict[str, Any] | None:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict) and isinstance(parsed.get("results"), list):
            return parsed
        return None

    decoded = _decode_candidate(cleaned)
    if decoded is None:
        fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw_text, flags=re.I)
        if fence_match:
            decoded = _decode_candidate(fence_match.group(1).strip())

    if decoded is None:
        decoder = json.JSONDecoder()
        idx = 0
        while idx < len(raw_text):
            brace = raw_text.find("{", idx)
            if brace < 0:
                break
            try:
                candidate_obj, end = decoder.raw_decode(raw_text[brace:])
            except json.JSONDecodeError:
                idx = brace + 1
                continue
            if isinstance(candidate_obj, dict) and isinstance(candidate_obj.get("results"), list):
                decoded = candidate_obj
                break
            idx = brace + max(end, 1)

    if decoded is None:
        raise ValueError("Critic output must include a JSON object with a results array")

    if not isinstance(decoded, dict) or not isinstance(decoded.get("results"), list):
        raise ValueError("Critic output must be a JSON object with a results array")
    return [item for item in decoded["results"] if isinstance(item, dict)]


def _guess_summary(body: str) -> str:
    summary = re.split(r"[。！？\n]", body.strip())[0].strip()
    return summary[:120]


def _count_words(body: str) -> int:
    tokens = re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]", body)
    return len(tokens)


def _shorten_text(value: str, max_len: int = 3000) -> str:
    text = value.strip()
    if len(text) <= max_len:
        return text
    return text[:max_len] + "\n...[truncated]"


def _normalize_text_array(value: Any) -> list[str]:
    if isinstance(value, list):
        return [re.sub(r"\s+", " ", str(item)).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        parts = re.split(r"[,，、\n]", value)
        return [re.sub(r"\s+", " ", item).strip() for item in parts if item.strip()]
    return []


def _normalize_representation(value: str) -> str:
    cleaned = re.sub(r"\s+", "", value or "")
    return _REPRESENTATION_ALIASES.get(cleaned, value.strip())


def _normalize_dynasty(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = _clean_inline_spacing(value)
    return _DYNASTY_ALIASES.get(cleaned, cleaned) or None


def _normalize_type(value: str) -> str:
    cleaned = _clean_inline_spacing(value)
    if not cleaned:
        return ""
    parts = [segment.strip() for segment in re.split(r"[・·／/]", cleaned, maxsplit=1)]
    if len(parts) == 2:
        dynasty = _normalize_dynasty(parts[0]) or parts[0]
        genre = _TYPE_ALIASES.get(parts[1], parts[1])
        return f"{dynasty}・{genre}"
    return _TYPE_ALIASES.get(cleaned, cleaned)


def _normalize_theme_list(value: Any) -> list[str]:
    themes = _normalize_text_array(value)
    deduped: list[str] = []
    seen: set[str] = set()
    for item in themes:
        if item not in seen:
            seen.add(item)
            deduped.append(item)
    return deduped


def _snapshot_draft(draft: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": draft.get("title"),
        "representation": draft.get("representation"),
        "type": draft.get("type"),
        "source": draft.get("source"),
        "summary": draft.get("summary"),
        "difficulty": draft.get("difficulty"),
        "themes": draft.get("themes"),
    }


def _clean_inline_spacing(value: str) -> str:
    value = value.replace("\u3000", " ")
    value = re.sub(r"[ \t]+", " ", value)
    return value.strip()


def _clean_content_spacing(value: str) -> str:
    lines = [_clean_inline_spacing(line) for line in value.splitlines()]
    return "\n".join(lines).strip()


def _chat_poe(bot_name: str, system_prompt: str, user_content: str | list[dict[str, Any]]) -> str:
    payload = {
        "model": bot_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }

    try:
        with httpx.Client(timeout=180.0) as client:
            response = client.post(
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
    return data["choices"][0]["message"]["content"]


def _build_generator_prompt(hint: str, count: int, revision_context: dict[str, Any] | None = None) -> tuple[str, str]:
    system_prompt = _read_prompt_file("generator_system_prompt.md")

    if revision_context:
        user_prompt = (
            f"Original admin hint:\n{hint.strip() or '自由生成適合香港DSE非指定篇章工作流的篇章'}\n\n"
            f"You are revising round {revision_context['round_number']} for exactly one draft.\n"
            "Previous draft JSON:\n"
            f"{json.dumps(revision_context['draft'], ensure_ascii=False, indent=2)}\n\n"
            "Critic feedback JSON:\n"
            f"{json.dumps(revision_context['critic_feedback'], ensure_ascii=False, indent=2)}\n\n"
            "Return exactly one corrected passage in the required schema."
        )
    else:
        user_prompt = (
            f"請根據以下提示生成 {count} 篇非指定篇章。\n"
            f"提示：{hint.strip() or '自由生成適合香港DSE非指定篇章工作流的篇章'}\n"
            "Return JSON only inside one markdown code block."
        )
    return system_prompt, user_prompt


def _build_generator_user_content(prompt_text: str, images: list[dict[str, str]] | None = None) -> str | list[dict[str, Any]]:
    if not images:
        return prompt_text
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt_text}]
    for image in images:
        content.append({"type": "image_url", "image_url": {"url": image["data_url"]}})
    return content


def _normalize_input_images(images: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in images or []:
        if not isinstance(item, dict):
            continue
        data_url = str(item.get("data_url") or "").strip()
        if not data_url:
            continue
        if not re.match(r"^data:image\/[a-zA-Z0-9.+-]+;base64,", data_url):
            raise HTTPException(status_code=422, detail="Invalid image data_url format")
        if len(data_url) > _MAX_IMAGE_DATA_URL_LENGTH:
            raise HTTPException(status_code=413, detail="Image is too large; please use a smaller image")
        mime_type = str(item.get("mime_type") or "image/png").strip() or "image/png"
        name = str(item.get("name") or "pasted-image").strip() or "pasted-image"
        normalized.append({
            "name": name,
            "mime_type": mime_type,
            "data_url": data_url,
        })
    return normalized


def _normalize_title_key(title: str) -> str:
    cleaned = _clean_inline_spacing(title)
    cleaned = re.sub(r"[\s\u3000]+", "", cleaned)
    return cleaned.lower()


def _detect_duplicate_titles(drafts: list[dict[str, Any]], existing_rows: list[dict[str, Any]]) -> dict[str, list[str]]:
    existing_map: dict[str, str] = {}
    for row in existing_rows:
        title = str(row.get("title") or "").strip()
        if not title:
            continue
        existing_map[_normalize_title_key(title)] = title

    duplicates_with_db: list[str] = []
    duplicates_in_batch: list[str] = []
    seen_batch: set[str] = set()

    for draft in drafts:
        title = str(draft.get("title") or "").strip()
        if not title:
            continue
        key = _normalize_title_key(title)
        if key in existing_map:
            duplicates_with_db.append(existing_map[key])
        if key in seen_batch:
            duplicates_in_batch.append(title)
        else:
            seen_batch.add(key)

    return {
        "existing_db": sorted(set(duplicates_with_db)),
        "current_batch": sorted(set(duplicates_in_batch)),
    }


def _build_critic_prompt(hint: str, drafts: list[dict[str, Any]], existing_titles: list[str]) -> tuple[str, str]:
    system_prompt = _read_prompt_file("critic_system_prompt.md")
    user_prompt = (
        f"Original admin hint:\n{hint.strip() or '自由生成適合香港DSE非指定篇章工作流的篇章'}\n\n"
        "Existing database titles (must not be duplicated):\n"
        f"{json.dumps(existing_titles, ensure_ascii=False, indent=2)}\n\n"
        "Review the following generated draft passages for reliability, source accuracy, completeness, and metadata correctness.\n"
        f"{json.dumps({'passages': drafts}, ensure_ascii=False, indent=2)}"
    )
    return system_prompt, user_prompt


def _build_translation_prompt(row: dict[str, Any]) -> tuple[str, str]:
    system_prompt = _read_prompt_file("translation_system_prompt.md")
    user_prompt = (
        "請為以下文言文篇章提供完整、忠實、詳細的語譯（白話文）。\n"
        "要求：\n"
        "1) 不可省略段落，不可總結，不可改寫原意。\n"
        "2) 使用香港中學生可理解的繁體中文。\n"
        "3) 專有名詞、人名、地名需準確保留。\n"
        "4) 無字數上限，需完整翻譯。\n\n"
        f"title: {row.get('title') or ''}\n"
        f"type: {row.get('type') or ''}\n"
        f"source: {row.get('source') or ''}\n"
        "body:\n"
        f"{row.get('body') or ''}\n"
    )
    return system_prompt, user_prompt


def _extract_translation_text(raw_text: str) -> str:
    text = _strip_markdown_fences(raw_text)
    if text.startswith("{") or text.startswith("["):
        try:
            decoded = json.loads(text)
            if isinstance(decoded, dict):
                for key in ["translation", "detailed_translation", "text", "content"]:
                    value = decoded.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()
            if isinstance(decoded, str) and decoded.strip():
                return decoded.strip()
        except json.JSONDecodeError:
            pass
    return text.strip()


def _normalize_critic_result(result: dict[str, Any]) -> dict[str, Any]:
    verdict = str(result.get("verdict") or "REVISE").strip().upper()
    if verdict not in {"PASS", "REVISE"}:
        verdict = "REVISE"
    score = int(result.get("score") or 1)
    trust_level = str(result.get("trust_level") or "low").strip().lower()
    issues = _normalize_text_array(result.get("issues"))
    revision_instructions = _normalize_text_array(result.get("revision_instructions"))
    critic_notes = str(result.get("critic_notes") or "").strip()
    field_checks = result.get("field_checks") if isinstance(result.get("field_checks"), dict) else {}
    return {
        "title": str(result.get("title") or "").strip(),
        "verdict": verdict,
        "score": max(1, min(10, score)),
        "trust_level": trust_level,
        "issues": issues,
        "field_checks": field_checks,
        "revision_instructions": revision_instructions,
        "critic_notes": critic_notes,
    }


def _review_loop(
    *,
    hint: str,
    initial_drafts: list[dict[str, Any]],
    existing_rows: list[dict[str, Any]],
    generator_bot_name: str,
    critic_bot_name: str,
    existing_titles: list[str],
    max_review_rounds: int,
    stop_on_pass: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    current_drafts = initial_drafts
    all_traces: list[dict[str, Any]] = []

    for round_number in range(1, max_review_rounds + 1):
        critic_system, critic_user = _build_critic_prompt(hint, current_drafts, existing_titles)
        critic_raw = _chat_poe(critic_bot_name, critic_system, critic_user)
        critic_results = [_normalize_critic_result(item) for item in _coerce_critic_payload(critic_raw)]
        critic_map = {item["title"]: item for item in critic_results}

        next_drafts: list[dict[str, Any]] = []
        all_passed = True

        for draft in current_drafts:
            critic_result = critic_map.get(draft.get("title"), {
                "title": draft.get("title", ""),
                "verdict": "REVISE",
                "score": 1,
                "trust_level": "low",
                "issues": ["Critic did not return a matching result for this draft"],
                "field_checks": {},
                "revision_instructions": ["Return a fully reviewed corrected draft"],
                "critic_notes": "No matching critic output found.",
            })

            trace_entry = {
                "round": round_number,
                "draft_title": draft.get("title"),
                "critic": critic_result,
                "critic_raw": _shorten_text(critic_raw),
                "draft_before": _snapshot_draft(draft),
            }
            review_history = list(draft.get("review_history") or [])
            review_history.append({
                "round": round_number,
                "verdict": critic_result["verdict"],
                "score": critic_result["score"],
                "trust_level": critic_result["trust_level"],
                "issues": critic_result["issues"],
                "revision_instructions": critic_result["revision_instructions"],
                "critic_notes": critic_result["critic_notes"],
                "trace": trace_entry,
            })

            if critic_result["verdict"] == "PASS":
                draft["critic"] = critic_result
                draft["status"] = "passed"
                draft["iterations_used"] = round_number
                draft["review_history"] = review_history
                next_drafts.append(draft)
                all_traces.append(trace_entry)
                continue

            all_passed = False
            if round_number >= max_review_rounds:
                draft["critic"] = critic_result
                draft["status"] = "max_rounds_reached"
                draft["iterations_used"] = round_number
                draft["review_history"] = review_history
                next_drafts.append(draft)
                all_traces.append(trace_entry)
                continue

            gen_system, gen_user = _build_generator_prompt(
                hint,
                1,
                revision_context={
                    "round_number": round_number + 1,
                    "draft": draft,
                    "critic_feedback": critic_result,
                },
            )
            revised_raw = _chat_poe(generator_bot_name, gen_system, gen_user)
            revised_payload = _coerce_generated_payload(revised_raw)
            if not revised_payload:
                raise HTTPException(status_code=422, detail=f"Generator revision failed for draft {draft.get('title')}")
            revised_row = _prepare_row(revised_payload[0], existing_rows + next_drafts, hint)
            revised_row["validation_errors"] = _validate_row(revised_row)
            revised_row["critic"] = critic_result
            revised_row["status"] = "revised"
            revised_row["iterations_used"] = round_number + 1
            revised_row["review_history"] = review_history
            trace_entry["generator_user_prompt"] = _shorten_text(gen_user)
            trace_entry["generator_revision_raw"] = _shorten_text(revised_raw)
            trace_entry["draft_after"] = _snapshot_draft(revised_row)
            next_drafts.append(revised_row)
            all_traces.append(trace_entry)

        current_drafts = next_drafts
        if all_passed and stop_on_pass:
            break

    return current_drafts, {"review_traces": all_traces}


def _next_sequence(rows: list[dict[str, Any]]) -> int:
    max_num = 0
    for row in rows:
        code = str(row.get("code") or "")
        match = re.search(r"(\d+)$", code)
        if match:
            max_num = max(max_num, int(match.group(1)))
    return max_num + 1


def _load_existing_rows() -> list[dict[str, Any]]:
    sb = _get_supabase()
    response = sb.table(_TABLE).select("id,code,slug,order_no,title").order("order_no").execute()
    return response.data or []


def _insert_with_legacy_fallback(sb: Any, payload: dict[str, Any]) -> None:
    try:
        sb.table(_TABLE).insert(payload).execute()
        return
    except Exception as exc:
        message = str(exc)
        # Support environments where the word_count migration has not been applied yet.
        if "word_count" in message and "schema cache" in message:
            legacy_payload = {k: v for k, v in payload.items() if k != "word_count"}
            sb.table(_TABLE).insert(legacy_payload).execute()
            return
        raise


def _prepare_row(draft: dict[str, Any], existing_rows: list[dict[str, Any]], generation_prompt: str) -> dict[str, Any]:
    title = _clean_inline_spacing(str(draft.get("title") or ""))
    representation = _normalize_representation(_clean_inline_spacing(str(draft.get("representation") or draft.get("## representation") or "")))
    type_value = _normalize_type(_clean_inline_spacing(str(draft.get("type") or draft.get("## type") or "")))
    source_value = _clean_inline_spacing(str(draft.get("source") or draft.get("## source") or ""))
    body = _clean_content_spacing(str(draft.get("content") or draft.get("body") or draft.get("## content") or ""))
    summary = _clean_inline_spacing(str(draft.get("summary") or "")) or _guess_summary(body)
    slug = _slugify(str(draft.get("slug") or title))
    genre = _TYPE_ALIASES.get(
        _clean_inline_spacing(str(draft.get("genre") or type_value.split("・", 1)[-1] if type_value else "")),
        _clean_inline_spacing(str(draft.get("genre") or type_value.split("・", 1)[-1] if type_value else "")),
    )
    themes = _normalize_theme_list(draft.get("themes"))
    difficulty = int(draft.get("difficulty") or 2)
    dynasty, author = _parse_title_author_dynasty(type_value, source_value)

    order_no = draft.get("order_no")
    if order_no is None:
        current_max_order = max([int(row.get("order_no") or 0) for row in existing_rows], default=0)
        order_no = current_max_order + 1
    order_no = int(order_no)

    code = str(draft.get("code") or "").strip()
    row_id = str(draft.get("id") or "").strip()
    if not code or not row_id:
        seq = _next_sequence(existing_rows)
        code = code or f"ndp{seq:04d}"
        row_id = row_id or f"ndp-{seq:04d}"

    duplicate_slug = any(str(row.get("slug")) == slug for row in existing_rows)
    duplicate_code = any(str(row.get("code")) == code for row in existing_rows)

    return {
        "id": row_id,
        "code": code,
        "slug": slug,
        "order_no": order_no,
        "title": title,
        "dynasty": _normalize_dynasty(_clean_inline_spacing(str(draft.get("dynasty") or dynasty or ""))),
        "author": _clean_inline_spacing(str(draft.get("author") or author or "")) or None,
        "body": body,
        "word_count": _count_words(body),
        "summary": summary,
        "genre": genre or None,
        "themes": themes,
        "difficulty": max(1, min(5, difficulty)),
        "representation": representation,
        "type": type_value,
        "source": source_value,
        "generation_prompt": _clean_inline_spacing(generation_prompt) or None,
        "is_active": bool(draft.get("is_active", True)),
        "duplicate_slug": duplicate_slug,
        "duplicate_code": duplicate_code,
    }


def _validate_row(row: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for field_name in ["title", "representation", "type", "source", "body"]:
        if not str(row.get(field_name) or "").strip():
            errors.append(f"Missing required field: {field_name}")
    if row.get("representation") not in _ALLOWED_REPRESENTATIONS:
        errors.append("representation must be 文言文 or 白話文")
    if row.get("duplicate_slug"):
        errors.append("slug already exists in dsemcq_nd_passages")
    if row.get("duplicate_code"):
        errors.append("code already exists in dsemcq_nd_passages")
    if int(row.get("difficulty") or 0) < 1 or int(row.get("difficulty") or 0) > 5:
        errors.append("difficulty must be between 1 and 5")
    if int(row.get("order_no") or -1) < 0:
        errors.append("order_no must be 0 or above")
    return errors


class GenerateRequest(BaseModel):
    hint: str = ""
    count: int = Field(3, ge=1, le=20)
    generator_bot_name: str = ""
    critic_bot_name: str = ""
    max_review_rounds: int = Field(2, ge=1, le=5)
    stop_on_pass: bool = True
    images: list[dict[str, Any]] = Field(default_factory=list)


class DraftRow(BaseModel):
    id: str
    code: str
    slug: str
    order_no: int
    title: str
    dynasty: str | None = None
    author: str | None = None
    body: str
    word_count: int = 0
    summary: str | None = None
    genre: str | None = None
    themes: list[str] = Field(default_factory=list)
    difficulty: int = 2
    representation: str
    type: str
    source: str
    generation_prompt: str | None = None
    is_active: bool = True
    duplicate_slug: bool = False
    duplicate_code: bool = False
    validation_errors: list[str] = Field(default_factory=list)


class PushRequest(BaseModel):
    rows: list[DraftRow]


class TranslateOneRequest(BaseModel):
    row_id: str
    bot_name: str = ""
    force_retranslate: bool = False


class TranslateBatchRequest(BaseModel):
    bot_name: str = ""
    only_missing: bool = True
    force_retranslate: bool = False
    limit: int | None = Field(default=None, ge=1, le=500)


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
        sb.table(_TABLE).select("id").limit(1).execute()
        return {"status": "ok", "table": _TABLE}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


@app.get("/api/list-passages")
def list_passages() -> list[dict[str, Any]]:
    try:
        rows = _load_existing_rows()
        return rows
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/translation/candidates")
def list_translation_candidates(only_missing: bool = True, limit: int = 200) -> list[dict[str, Any]]:
    sb = _get_supabase()
    query = (
        sb.table(_TABLE)
        .select(f"id,code,order_no,title,representation,type,source,body,{_TRANSLATION_COLUMN}")
        .order("order_no")
        .limit(max(1, min(limit, 500)))
    )
    response = query.execute()
    rows = response.data or []

    def _missing_translation(row: dict[str, Any]) -> bool:
        return not str(row.get(_TRANSLATION_COLUMN) or "").strip()

    if only_missing:
        rows = [row for row in rows if (row.get("representation") == "文言文" and _missing_translation(row)) or row.get("representation") == "白話文"]
    return rows


def _update_translation_column(sb: Any, row_id: str, value: str | None) -> None:
    try:
        sb.table(_TABLE).update({_TRANSLATION_COLUMN: value}).eq("id", row_id).execute()
    except Exception as exc:
        message = str(exc)
        if _TRANSLATION_COLUMN in message and ("schema cache" in message or "does not exist" in message):
            raise HTTPException(
                status_code=500,
                detail=f"Database column '{_TRANSLATION_COLUMN}' is missing. Apply migration first.",
            ) from exc
        raise


def _run_translate_one(*, row_id: str, bot_name: str, force_retranslate: bool) -> dict[str, Any]:
    sb = _get_supabase()
    response = (
        sb.table(_TABLE)
        .select(f"id,title,representation,type,source,body,{_TRANSLATION_COLUMN}")
        .eq("id", row_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail=f"Row not found: {row_id}")

    row = rows[0]
    representation = str(row.get("representation") or "").strip()
    existing_translation = str(row.get(_TRANSLATION_COLUMN) or "").strip()

    if representation == "白話文":
        _update_translation_column(sb, row_id, None)
        return {
            "id": row_id,
            "title": row.get("title"),
            "status": "skipped_baihua",
            "message": "白話文篇章不需語譯，已保持為空值。",
        }

    if representation != "文言文":
        return {
            "id": row_id,
            "title": row.get("title"),
            "status": "skipped_unknown_representation",
            "message": f"Unsupported representation: {representation}",
        }

    if not str(row.get("body") or "").strip():
        return {
            "id": row_id,
            "title": row.get("title"),
            "status": "failed_empty_body",
            "message": "Body is empty; cannot translate.",
        }

    if existing_translation and not force_retranslate:
        return {
            "id": row_id,
            "title": row.get("title"),
            "status": "skipped_exists",
            "message": "詳細語譯已存在，已略過。",
        }

    system_prompt, user_prompt = _build_translation_prompt(row)
    raw_text = _chat_poe(bot_name, system_prompt, user_prompt)
    translated = _extract_translation_text(raw_text)
    if not translated:
        return {
            "id": row_id,
            "title": row.get("title"),
            "status": "failed_empty_translation",
            "message": "Model returned empty translation.",
        }

    _update_translation_column(sb, row_id, translated)
    return {
        "id": row_id,
        "title": row.get("title"),
        "status": "translated",
        "translation_length": len(translated),
    }


@app.post("/api/translation/run-one")
def run_translation_one(req: TranslateOneRequest) -> dict[str, Any]:
    bot_name = req.bot_name.strip() or settings.nd_passage_translation_bot_name
    return _run_translate_one(row_id=req.row_id, bot_name=bot_name, force_retranslate=req.force_retranslate)


@app.post("/api/translation/run-batch")
def run_translation_batch(req: TranslateBatchRequest) -> dict[str, Any]:
    bot_name = req.bot_name.strip() or settings.nd_passage_translation_bot_name
    candidates = list_translation_candidates(only_missing=req.only_missing, limit=req.limit or 500)
    run_rows = [row for row in candidates if row.get("representation") in {"文言文", "白話文"}]

    results: list[dict[str, Any]] = []
    for row in run_rows:
        result = _run_translate_one(
            row_id=str(row["id"]),
            bot_name=bot_name,
            force_retranslate=req.force_retranslate,
        )
        results.append(result)

    translated = sum(1 for item in results if item.get("status") == "translated")
    skipped = sum(1 for item in results if str(item.get("status", "")).startswith("skipped"))
    failed = sum(1 for item in results if str(item.get("status", "")).startswith("failed"))

    return {
        "bot_name": bot_name,
        "processed": len(results),
        "translated": translated,
        "skipped": skipped,
        "failed": failed,
        "results": results,
    }


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> dict[str, Any]:
    generator_bot_name = req.generator_bot_name.strip() or settings.nd_passage_bot_name
    critic_bot_name = req.critic_bot_name.strip() or settings.nd_passage_critic_bot_name
    normalized_images = _normalize_input_images(req.images)
    generator_system, generator_user = _build_generator_prompt(req.hint, req.count)
    generator_user_content = _build_generator_user_content(generator_user, normalized_images)
    raw_text = _chat_poe(generator_bot_name, generator_system, generator_user_content)
    generated = _coerce_generated_payload(raw_text)
    if not generated:
        raise HTTPException(status_code=422, detail="LLM returned no parseable passages")

    existing_rows = _load_existing_rows()
    existing_titles = [str(row.get("title") or "").strip() for row in existing_rows if str(row.get("title") or "").strip()]
    draft_rows: list[dict[str, Any]] = []
    for item in generated:
        row = _prepare_row(item, existing_rows + draft_rows, req.hint)
        row["validation_errors"] = _validate_row(row)
        row["status"] = "generated"
        row["iterations_used"] = 1
        draft_rows.append(row)

    reviewed_rows, review_meta = _review_loop(
        hint=req.hint,
        initial_drafts=draft_rows,
        existing_rows=existing_rows,
        generator_bot_name=generator_bot_name,
        critic_bot_name=critic_bot_name,
        existing_titles=existing_titles,
        max_review_rounds=req.max_review_rounds,
        stop_on_pass=req.stop_on_pass,
    )

    duplicate_report = _detect_duplicate_titles(reviewed_rows, existing_rows)
    if duplicate_report["existing_db"] or duplicate_report["current_batch"]:
        message_parts: list[str] = ["偵測到重複標題，流程已中止。"]
        if duplicate_report["existing_db"]:
            message_parts.append("與資料庫重複: " + "、".join(duplicate_report["existing_db"]))
        if duplicate_report["current_batch"]:
            message_parts.append("本次草稿內重複: " + "、".join(duplicate_report["current_batch"]))
        raise HTTPException(status_code=409, detail=" | ".join(message_parts))

    return {
        "rows": reviewed_rows,
        "raw_text": raw_text,
        "generator_bot_name": generator_bot_name,
        "critic_bot_name": critic_bot_name,
        "max_review_rounds": req.max_review_rounds,
        "image_count": len(normalized_images),
        **review_meta,
    }


@app.post("/api/confirm-insert")
def confirm_insert(req: PushRequest) -> dict[str, Any]:
    sb = _get_supabase()
    existing_rows = _load_existing_rows()
    inserted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    staged_rows: list[dict[str, Any]] = []

    for item in req.rows:
        row = item.model_dump()
        prepared = _prepare_row(row, existing_rows + staged_rows, row.get("generation_prompt") or "")
        errors = _validate_row(prepared)
        if errors:
            rejected.append({"title": prepared.get("title"), "code": prepared.get("code"), "errors": errors})
            continue

        payload = {
            key: prepared[key]
            for key in [
                "id",
                "code",
                "slug",
                "order_no",
                "title",
                "dynasty",
                "author",
                "body",
                "word_count",
                "summary",
                "genre",
                "themes",
                "difficulty",
                "representation",
                "type",
                "source",
                "generation_prompt",
                "is_active",
            ]
        }

        try:
            _insert_with_legacy_fallback(sb, payload)
        except Exception as exc:
            rejected.append({
                "title": prepared.get("title"),
                "code": prepared.get("code"),
                "errors": [str(exc)],
            })
            continue

        staged_rows.append(prepared)
        inserted.append({"id": prepared["id"], "code": prepared["code"], "title": prepared["title"]})

    return {
        "inserted": inserted,
        "rejected": rejected,
    }


def start_server() -> None:
    uvicorn.run("server:app", host="127.0.0.1", port=8767, reload=True)


if __name__ == "__main__":
    start_server()