"""Local prompt editor and workflow tracer for the Advisor V2 Poe agents."""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

_HERE = Path(__file__).parent
_ROOT = _HERE.parent.parent
_PROMPTS_DIR = _ROOT / "advisor_agentic"
_LOGS_DIR = _HERE / "logs"
_POE_URL = "https://api.poe.com/v1/chat/completions"
_DEFAULT_STUDENT_ID = "05c32959-d1b2-4787-832a-b6216e5bc7e6"

app = Flask(__name__, template_folder="templates")
CORS(app)

ROLES = {
    "orchestrator": {"file": "00_orchestrator_mindmap.md", "secret": "DSE_ADVISOR_BOT_ORCHESTRATOR", "label": "規劃器"},
    "profile": {"file": "02_student_profile_agent.md", "secret": "DSE_ADVISOR_BOT_PROFILE", "label": "學生檔案"},
    "performance": {"file": "03_performance_analyst.md", "secret": "DSE_ADVISOR_BOT_PERFORMANCE", "label": "表現分析"},
    "question_bank": {"file": "04_question_bank_researcher.md", "secret": "DSE_ADVISOR_BOT_QUESTION_BANK", "label": "題庫研究"},
    "synthesizer": {"file": "07_tutor_synthesizer.md", "secret": "DSE_ADVISOR_BOT_SYNTHESIZER", "label": "書僮整合"},
}
SOURCE_ROLES = ("profile", "performance", "question_bank")


def get_supabase_service_key() -> str:
    """Prefer SUPABASE_SERVICE_KEY, fallback to legacy SUPABASE_SERVICE_ROLE_KEY."""
    return (os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()


def load_local_env(force: bool = True) -> None:
    """Load a local .env without adding a runtime dependency.

    When force=True, values in .env override existing process environment
    variables so the tester always uses the local backend configuration.
    """
    env_path = _HERE / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        # Remove inline comments after values: KEY=value # comment
        if " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        value = value.strip('"').strip("'")
        if force or key not in os.environ:
            os.environ[key] = value


load_local_env()


def prompt_path(role: str) -> Path:
    meta = ROLES.get(role)
    if not meta:
        raise ValueError(f"Unknown role: {role}")
    return _PROMPTS_DIR / meta["file"]


def read_prompt(role: str) -> str:
    return prompt_path(role).read_text(encoding="utf-8")


def prompt_catalog() -> dict[str, dict[str, str]]:
    catalog = {}
    for key, meta in ROLES.items():
        content = read_prompt(key)
        catalog[key] = {
            "label": meta["label"],
            "filename": meta["file"],
            "content": content,
            "hash": hashlib.sha256(content.encode("utf-8")).hexdigest()[:12],
        }
    return catalog


def poe_configuration() -> dict[str, object]:
    load_local_env(force=True)
    required = ["POE_API_KEY", *(meta["secret"] for meta in ROLES.values())]
    missing = [name for name in required if not os.environ.get(name)]
    active_models = {
        role: os.environ.get(meta["secret"], "")
        for role, meta in ROLES.items()
    }
    return {"configured": not missing, "missing": missing, "active_models": active_models}


def supabase_context_configuration() -> dict[str, object]:
    load_local_env(force=True)
    missing = []
    if not os.environ.get("SUPABASE_URL"):
        missing.append("SUPABASE_URL")
    if not get_supabase_service_key():
        missing.append("SUPABASE_SERVICE_KEY")
    if not os.environ.get("DSE_ADVISOR_V2_WORKER_SECRET"):
        missing.append("DSE_ADVISOR_V2_WORKER_SECRET")
    return {"configured": not missing, "missing": missing}


def fixture_evidence() -> dict[str, dict]:
    return {
        "profile": {
            "profile": {"id": _DEFAULT_STUDENT_ID, "username": "fixture_student", "dse_year": 2026, "subscription_tier": "free"},
            "psych_results": [{"test_id": "study_habit", "result_code": "reflective", "completed_at": "2026-08-01T00:00:00Z"}],
            "chat_history": [
                {"role": "user", "text": "我想考好 DSE 中文", "created_at": "2026-08-01T00:00:00Z", "request_id": "fixture-1"},
                {"role": "assistant", "text": "好，我們先從閱讀理解入手。", "created_at": "2026-08-01T00:00:01Z", "request_id": "fixture-1"},
            ],
            "evidence_ids": ["profile:dse_year", "psych:study_habit"],
        },
        "performance": {
            "overall": {
                "submitted_attempts": 12,
                "answered_count": 112,
                "correct_count": 78,
                "incorrect_count": 34,
                "answered_accuracy": 0.696,
                "quiz_score_rate": 0.65,
            },
            "engagement": {
                "expected_questions": 120,
                "skipped_count": 8,
                "completion_rate": 0.933,
                "fully_skipped_attempts": 0,
                "partial_attempts": 1,
            },
            "recent_attempts": [{"id": "attempt-01", "score": 7, "total": 10, "submitted_at": "2026-08-02T00:00:00Z"}],
            "skill_stats": [{"tag_id": "閱讀", "tag_label": "閱讀", "answered": 30, "correct": 18, "answered_accuracy": 0.6}],
            "passage_stats": [{"passage_id": "p1", "passage_title": "岳陽樓記", "answered": 10, "correct": 8, "incorrect": 2, "skipped": 1, "answered_accuracy": 0.8}],
            "difficulty_stats": [{"difficulty": 3, "answered": 35, "correct": 21, "answered_accuracy": 0.6}],
            "top_passages_best": [{"passage_id": "p1", "passage_title": "岳陽樓記", "answered": 10, "correct": 8, "incorrect": 2, "skipped": 1, "answered_accuracy": 0.8}],
            "top_passages_worst": [{"passage_id": "p2", "passage_title": "師說", "answered": 10, "correct": 3, "incorrect": 7, "skipped": 0, "answered_accuracy": 0.3}],
            "suspicion_candidates": [],
            "coverage": {"passages_attempted": 7, "passages_total_available": 12, "skills_attempted": 5, "skills_total_available": 8},
            "evidence_ids": ["attempt-01"],
        },
        "question_bank": {
            "retrieval_mode": {
                "section_filter": "mixed",
                "matched_designated_passages": [],
                "focus_terms": [],
                "search_terms": [],
            },
            "similar_questions": [],
            "trend_signals": [],
            "marking_skill_notes": [],
            "data_gap_notes": ["Fixture mode: no live question-bank records loaded."],
            "evidence_ids": [],
        },
    }


def fetch_supabase_evidence(
    student_id: str,
    student_message: str,
    enabled_sources: list[str],
    performance_detail_request: dict | None = None,
    question_bank_detail_request: dict | None = None,
    retrieval_hints: dict | None = None,
) -> dict[str, dict]:
    load_local_env(force=True)
    supabase_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    service_role_key = get_supabase_service_key()
    worker_secret = os.environ.get("DSE_ADVISOR_V2_WORKER_SECRET") or ""
    if not supabase_url or not service_role_key or not worker_secret:
        raise RuntimeError("Supabase context mode requires SUPABASE_URL, SUPABASE_SERVICE_KEY, DSE_ADVISOR_V2_WORKER_SECRET")

    payload = {
        "userId": student_id,
        "studentMessage": student_message,
        "sources": enabled_sources,
        "performanceDetailRequest": performance_detail_request,
        "questionBankDetailRequest": question_bank_detail_request,
        "retrievalHints": retrieval_hints,
    }
    req = Request(
        f"{supabase_url}/functions/v1/dsemcq-advisor-v2-context",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {service_role_key}",
            "x-advisor-v2-worker-secret": worker_secret,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"Supabase context function error {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Supabase context function unreachable: {exc.reason}") from exc

    if not data.get("ok"):
        raise RuntimeError(data.get("detail") or data.get("error") or "Supabase context function failed")

    contexts = data.get("contexts") or {}
    return {source: contexts.get(source) or {} for source in enabled_sources}


def parse_json(content: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*", "", content.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Response did not contain a JSON object")
    value = json.loads(cleaned[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("Response JSON must be an object")
    return value


def validate_output(role: str, value: dict, enabled_sources: list[str]) -> list[str]:
    errors = []
    if value.get("schema_version") != "v1":
        errors.append("schema_version must be v1")
    if value.get("agent_role") != role:
        errors.append(f"agent_role must be {role}")
    if role == "orchestrator":
        selected = value.get("selected_sources")
        if not isinstance(selected, list):
            errors.append("selected_sources must be an array")
        elif any(source not in enabled_sources for source in selected):
            errors.append("selected_sources includes a disabled source")
        elif len(selected) > 3:
            errors.append("selected_sources cannot have more than three sources")
    elif not isinstance(value.get("output"), dict):
        errors.append("output must be an object")
    return errors


def normalize_detail_request(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    request = {
        "action": str(value.get("action") or "question_diagnostics")[:80],
        "question_ids": [item for item in value.get("question_ids", []) if isinstance(item, str)][:40],
        "passage_ids": [item for item in value.get("passage_ids", []) if isinstance(item, str)][:20],
        "passage_names": [item for item in value.get("passage_names", []) if isinstance(item, str)][:8],
        "tag_ids": [item for item in value.get("tag_ids", []) if isinstance(item, str)][:20],
        "tag_labels": [item for item in value.get("tag_labels", []) if isinstance(item, str)][:20],
        "include": [item for item in value.get("include", []) if isinstance(item, str)][:10],
        "lookback_attempts": int(value.get("lookback_attempts") or 80),
        "limit_questions": int(value.get("limit_questions") or 25),
        "reason": str(value.get("reason") or "")[:300],
    }
    if (
        not value.get("action")
        and not request["question_ids"]
        and not request["passage_ids"]
        and not request["passage_names"]
        and not request["tag_ids"]
        and not request["tag_labels"]
    ):
        return None
    return request


def normalize_question_bank_detail_request(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    return {
        "action": str(value.get("action") or "similar_questions")[:80],
        "passage_names": [item for item in value.get("passage_names", []) if isinstance(item, str)][:8],
        "section_type": str(value.get("section_type") or "mixed")[:20],
        "exam_year_from": int(value.get("exam_year_from") or 2000),
        "exam_year_to": int(value.get("exam_year_to") or 2100),
        "question_types": [item for item in value.get("question_types", []) if isinstance(item, str)][:10],
        "focus_terms": [item for item in value.get("focus_terms", []) if isinstance(item, str)][:10],
        "include": [item for item in value.get("include", []) if isinstance(item, str)][:10],
        "limit_questions": int(value.get("limit_questions") or 15),
        "reason": str(value.get("reason") or "")[:300],
    }


def normalize_orchestrator_hints(value: dict) -> dict | None:
    if not isinstance(value, dict):
        return None
    designated = []
    for key in ("mentioned_designated_passages", "mentionedDesignatedPassages"):
        candidate = value.get(key)
        if isinstance(candidate, list):
            designated.extend([item for item in candidate if isinstance(item, str) and item.strip()])
    focus = []
    for key in ("question_bank_focus", "questionBankFocus"):
        candidate = value.get(key)
        if isinstance(candidate, list):
            focus.extend([item for item in candidate if isinstance(item, str) and item.strip()])
    designated = designated[:8]
    focus = focus[:12]
    if not designated and not focus:
        return None
    return {
        "mentionedDesignatedPassages": designated,
        "questionBankFocus": focus,
    }


def mock_response(role: str, enabled_sources: list[str]) -> dict:
    if role == "orchestrator":
        return {"schema_version": "v1", "agent_role": role, "route": "PERSONAL_COACH", "selected_sources": enabled_sources, "response_style": "concise_supportive", "requires_review": False, "question_query": None, "reason": "Fixture workflow trace"}
    if role == "synthesizer":
        return {"schema_version": "v1", "agent_role": role, "output": {"reply": "這是本機測試流程的整合回覆。請在右側檢查每個注入資料與訊息。", "source_chips": ["測試資料"], "personalization_used": bool(enabled_sources), "evidence_ids": []}}
    return {"schema_version": "v1", "agent_role": role, "output": {"fixture": True, "evidence_ids": []}}


def call_poe(role: str, payload: dict) -> tuple[str, dict, dict]:
    load_local_env(force=True)
    api_key = os.environ.get("POE_API_KEY")
    bot_name = os.environ.get(ROLES[role]["secret"])
    if not api_key or not bot_name:
        raise RuntimeError(f"Missing POE_API_KEY or {ROLES[role]['secret']} in backend/advisor-v2-tester/.env")
    body = json.dumps({"model": bot_name, "messages": [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]}).encode("utf-8")
    req = Request(_POE_URL, data=body, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(req, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError(f"Poe returned HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:400]}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach Poe: {exc.reason}") from exc
    raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not raw:
        summary = {
            "id": data.get("id"),
            "model": data.get("model"),
            "usage": data.get("usage"),
            "choices_len": len(data.get("choices", []) if isinstance(data.get("choices"), list) else []),
        }
        raise RuntimeError(f"Poe returned empty content: {json.dumps(summary, ensure_ascii=False)}")
    try:
        parsed = parse_json(raw)
    except Exception as exc:
        preview = raw[:500].replace("\n", "\\n")
        raise RuntimeError(f"{exc}. Raw preview: {preview}") from exc
    return raw, parsed, data


def run_role(role: str, request_id: str, student_message: str, enabled_sources: list[str], inputs: dict, mode: str) -> tuple[dict, dict]:
    payload = {"schema_version": "v1", "request_id": request_id, "agent_role": role, "student_message": student_message, "capabilities": {"enabled_sources": enabled_sources}, "inputs": inputs}
    started = time.perf_counter()
    try:
        api_response = {}
        if mode == "fixture":
            parsed = mock_response(role, enabled_sources)
            raw = json.dumps(parsed, ensure_ascii=False, indent=2)
        else:
            raw, parsed, api_response = call_poe(role, payload)
        errors = validate_output(role, parsed, enabled_sources)
        status = "valid" if not errors else "invalid"
    except Exception as exc:
        raw, parsed, errors, status, api_response = "", None, [str(exc)], "error", {}
    trace = {
        "role": role,
        "label": ROLES[role]["label"],
        "status": status,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "request": payload,
        "raw_response": raw,
        "api_response_summary": {
            "id": api_response.get("id"),
            "model": api_response.get("model"),
            "usage": api_response.get("usage"),
        } if api_response else None,
        "parsed_response": parsed,
        "validation_errors": errors,
    }
    return trace, parsed or {}


def run_performance_role(
    request_id: str,
    student_message: str,
    mode: str,
    data_mode: str,
    student_id: str,
    base_input: dict,
    retrieval_hints: dict | None,
)-> tuple[dict | None, list[dict]]:
    traces: list[dict] = []
    followup_evidence: list[dict] = []
    prior_iteration_outputs: list[dict] = []
    detail_request_signatures: set[str] = set()
    final_output: dict = {}
    for iteration in range(1, 4):
        iteration_input = {
            **base_input,
            "iteration": iteration,
            "max_iterations": 3,
            "followup_evidence": followup_evidence,
            "prior_iteration_outputs": prior_iteration_outputs,
        }
        trace, output = run_role(
            "performance",
            request_id,
            student_message,
            ["performance"],
            iteration_input,
            mode,
        )
        traces.append(trace)
        final_output = output
        prior_iteration_outputs.append({
            "iteration": iteration,
            "output": output.get("output") if isinstance(output, dict) else {},
        })
        if trace["status"] != "valid":
            break

        detail_request = normalize_detail_request((output.get("output") or {}).get("detail_request"))
        if not detail_request or iteration >= 3:
            break
        request_signature = json.dumps(detail_request, sort_keys=True, ensure_ascii=False)
        if request_signature in detail_request_signatures:
            followup_evidence.append({
                "iteration": iteration,
                "detail_request": detail_request,
                "detail_result": {
                    "question_diagnostics": [],
                    "data_gaps": ["Duplicate detail request was not executed. Refine selectors or finalize."],
                    "evidence_ids": [],
                },
            })
            continue
        detail_request_signatures.add(request_signature)

        if data_mode == "supabase":
            detail_started = time.perf_counter()
            detail_result = fetch_supabase_evidence(
                student_id,
                student_message,
                ["performance"],
                performance_detail_request=detail_request,
                retrieval_hints=retrieval_hints,
            ).get("performance", {})
            traces.append({
                "role": "performance_detail_lookup",
                "label": "表現分析補充檢索",
                "status": "valid",
                "duration_ms": round((time.perf_counter() - detail_started) * 1000),
                "request": {
                    "schema_version": "v1",
                    "agent_role": "performance_detail_lookup",
                    "inputs": {
                        "iteration": iteration,
                        "detail_request": detail_request,
                        "retrieval_hints": retrieval_hints or {},
                        "prior_iteration_outputs": prior_iteration_outputs,
                    },
                },
                "raw_response": "",
                "api_response_summary": None,
                "parsed_response": {
                    "schema_version": "v1",
                    "agent_role": "performance_detail_lookup",
                    "output": detail_result,
                },
                "validation_errors": [],
            })
        else:
            detail_result = {
                "reason": detail_request.get("reason") or "fixture followup",
                "question_diagnostics": [],
                "evidence_ids": [],
            }
            traces.append({
                "role": "performance_detail_lookup",
                "label": "表現分析補充檢索",
                "status": "valid",
                "duration_ms": 0,
                "request": {
                    "schema_version": "v1",
                    "agent_role": "performance_detail_lookup",
                    "inputs": {
                        "iteration": iteration,
                        "detail_request": detail_request,
                        "prior_iteration_outputs": prior_iteration_outputs,
                    },
                },
                "raw_response": "",
                "api_response_summary": None,
                "parsed_response": {
                    "schema_version": "v1",
                    "agent_role": "performance_detail_lookup",
                    "output": detail_result,
                },
                "validation_errors": [],
            })
        followup_evidence.append({
            "iteration": iteration,
            "detail_request": detail_request,
            "detail_result": detail_result,
        })

    report = {"source": "performance", "output": final_output} if final_output else None
    return report, traces


def run_question_bank_role(
    request_id: str,
    student_message: str,
    mode: str,
    data_mode: str,
    student_id: str,
    base_input: dict,
    retrieval_hints: dict | None,
) -> tuple[dict | None, list[dict]]:
    traces: list[dict] = []
    followup_evidence: list[dict] = []
    prior_iteration_outputs: list[dict] = []
    detail_request_signatures: set[str] = set()
    final_output: dict = {}
    for iteration in range(1, 4):
        iteration_input = {
            **base_input,
            "iteration": iteration,
            "max_iterations": 3,
            "followup_evidence": followup_evidence,
            "prior_iteration_outputs": prior_iteration_outputs,
        }
        trace, output = run_role(
            "question_bank",
            request_id,
            student_message,
            ["question_bank"],
            iteration_input,
            mode,
        )
        traces.append(trace)
        final_output = output
        prior_iteration_outputs.append({
            "iteration": iteration,
            "output": output.get("output") if isinstance(output, dict) else {},
        })
        if trace["status"] != "valid":
            break

        detail_request = normalize_question_bank_detail_request((output.get("output") or {}).get("detail_request"))
        if not detail_request or iteration >= 3:
            break
        request_signature = json.dumps(detail_request, sort_keys=True, ensure_ascii=False)
        if request_signature in detail_request_signatures:
            followup_evidence.append({
                "iteration": iteration,
                "detail_request": detail_request,
                "detail_result": {
                    "similar_questions": [],
                    "trend_signals": [],
                    "marking_skill_notes": [],
                    "data_gap_notes": ["Duplicate detail request was not executed. Refine filters or finalize."],
                    "evidence_ids": [],
                },
            })
            continue
        detail_request_signatures.add(request_signature)

        detail_started = time.perf_counter()
        if data_mode == "supabase":
            detail_result = fetch_supabase_evidence(
                student_id,
                student_message,
                ["question_bank"],
                question_bank_detail_request=detail_request,
                retrieval_hints=retrieval_hints,
            ).get("question_bank", {})
        else:
            detail_result = {
                "resolved_request": detail_request,
                "similar_questions": [],
                "trend_signals": [],
                "marking_skill_notes": [],
                "data_gap_notes": ["Fixture detail lookup returned no live records."],
                "evidence_ids": [],
            }
        traces.append({
            "role": "question_bank_detail_lookup",
            "label": "題庫補充檢索",
            "status": "valid",
            "duration_ms": round((time.perf_counter() - detail_started) * 1000),
            "request": {
                "schema_version": "v1",
                "agent_role": "question_bank_detail_lookup",
                "inputs": {
                    "iteration": iteration,
                    "detail_request": detail_request,
                    "retrieval_hints": retrieval_hints or {},
                    "prior_iteration_outputs": prior_iteration_outputs,
                },
            },
            "raw_response": "",
            "api_response_summary": None,
            "parsed_response": {
                "schema_version": "v1",
                "agent_role": "question_bank_detail_lookup",
                "output": detail_result,
            },
            "validation_errors": [],
        })
        followup_evidence.append({
            "iteration": iteration,
            "detail_request": detail_request,
            "detail_result": detail_result,
        })

    report = {"source": "question_bank", "output": final_output} if final_output else None
    return report, traces


def run_synthesizer_with_single_retry(
    request_id: str,
    student_message: str,
    enabled_sources: list[str],
    reports: list[dict],
    mode: str,
) -> tuple[list[dict], dict]:
    traces: list[dict] = []
    for attempt in range(1, 3):
        trace, output = run_role(
            "synthesizer",
            request_id,
            student_message,
            enabled_sources,
            {"reports": reports},
            mode,
        )
        trace["retry_attempt"] = attempt
        traces.append(trace)
        if trace.get("status") == "valid":
            return traces, output
    return traces, {}


def save_run(run: dict) -> None:
    _LOGS_DIR.mkdir(parents=True, exist_ok=True)
    path = _LOGS_DIR / f"{run['started_at'].replace(':', '').replace('+00:00', 'Z')}_{run['request_id']}.json"
    path.write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")


@app.get("/")
def index():
    return send_from_directory(_HERE / "templates", "dashboard.html")


@app.get("/api/data")
def api_data():
    return jsonify({
        "prompts": prompt_catalog(),
        "fixture_evidence": fixture_evidence(),
        "poe_configuration": poe_configuration(),
        "supabase_context_configuration": supabase_context_configuration(),
        "default_student_id": _DEFAULT_STUDENT_ID,
    })


@app.post("/api/prompts/<role>")
def api_save_prompt(role: str):
    if role not in ROLES:
        return jsonify({"ok": False, "error": "Unknown role"}), 404
    content = (request.get_json(force=True).get("content") or "").strip()
    if not content:
        return jsonify({"ok": False, "error": "Prompt cannot be empty"}), 400
    prompt_path(role).write_text(content + "\n", encoding="utf-8")
    return jsonify({"ok": True, "hash": hashlib.sha256((content + "\n").encode("utf-8")).hexdigest()[:12]})


@app.post("/api/run")
def api_run():
    load_local_env(force=True)
    body = request.get_json(force=True)
    student_message = (body.get("student_message") or "").strip()
    if not student_message:
        return jsonify({"ok": False, "error": "Student message is required"}), 400
    mode = body.get("mode", "fixture")
    if mode not in {"fixture", "poe"}:
        return jsonify({"ok": False, "error": "Mode must be fixture or poe"}), 400
    data_mode = body.get("data_mode", "fixture")
    if data_mode not in {"fixture", "supabase"}:
        return jsonify({"ok": False, "error": "data_mode must be fixture or supabase"}), 400
    student_id = (body.get("student_id") or _DEFAULT_STUDENT_ID).strip()
    if not student_id:
        return jsonify({"ok": False, "error": "student_id is required"}), 400

    enabled_sources = [source for source in SOURCE_ROLES if source in (body.get("enabled_sources") or [])]
    evidence = fixture_evidence()
    overrides = body.get("evidence_overrides") or {}
    if data_mode == "fixture":
        for source in SOURCE_ROLES:
            if source in overrides and isinstance(overrides[source], dict):
                evidence[source] = overrides[source]

    request_id = secrets.token_hex(16)
    traces, reports = [], []
    orchestrator_trace, plan = run_role("orchestrator", request_id, student_message, enabled_sources, {}, mode)
    traces.append(orchestrator_trace)
    if orchestrator_trace["status"] == "valid" and isinstance(plan.get("selected_sources"), list):
        selected_sources = [source for source in plan.get("selected_sources") if source in SOURCE_ROLES]
    else:
        selected_sources = []

    retrieval_hints = normalize_orchestrator_hints(plan if isinstance(plan, dict) else {})
    if data_mode == "supabase" and selected_sources:
        try:
            evidence = fetch_supabase_evidence(
                student_id,
                student_message,
                selected_sources,
                retrieval_hints=retrieval_hints,
            )
        except RuntimeError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

    # This mirrors the deployed V2 worker: independent specialists run in parallel.
    with ThreadPoolExecutor(max_workers=len(selected_sources) or 1) as executor:
        futures = {}
        for source in selected_sources:
            if source == "performance":
                futures[source] = executor.submit(
                    run_performance_role,
                    request_id,
                    student_message,
                    mode,
                    data_mode,
                    student_id,
                    evidence.get("performance", {}),
                    retrieval_hints,
                )
            elif source == "question_bank":
                futures[source] = executor.submit(
                    run_question_bank_role,
                    request_id,
                    student_message,
                    mode,
                    data_mode,
                    student_id,
                    evidence.get("question_bank", {}),
                    retrieval_hints,
                )
            else:
                futures[source] = executor.submit(
                    run_role,
                    source,
                    request_id,
                    student_message,
                    [source],
                    evidence.get(source, {}),
                    mode,
                )

        for source in selected_sources:
            result = futures[source].result()
            if source == "performance":
                perf_report, perf_traces = result
                traces.extend(perf_traces)
                if perf_report:
                    reports.append(perf_report)
                continue
            if source == "question_bank":
                question_bank_report, question_bank_traces = result
                traces.extend(question_bank_traces)
                if question_bank_report:
                    reports.append(question_bank_report)
                continue

            trace, output = result
            traces.append(trace)
            if trace["status"] == "valid":
                reports.append({"source": source, "output": output})
    synthesis_traces, _ = run_synthesizer_with_single_retry(
        request_id,
        student_message,
        enabled_sources,
        reports,
        mode,
    )
    traces.extend(synthesis_traces)
    run = {
        "request_id": request_id,
        "started_at": datetime.now(UTC).isoformat(),
        "mode": mode,
        "data_mode": data_mode,
        "student_id": student_id,
        "student_message": student_message,
        "enabled_sources": enabled_sources,
        "prompt_hashes": {role: item["hash"] for role, item in prompt_catalog().items()},
        "traces": traces,
    }
    save_run(run)
    return jsonify({"ok": True, "run": run})


if __name__ == "__main__":
    print("Advisor V2 Tester running at http://localhost:5006")
    app.run(port=5006, debug=True)