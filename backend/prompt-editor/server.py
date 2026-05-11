"""
Prompt Editor — Flask server for viewing and editing MCQ Generator LLM prompts.
Runs on port 5002, separate from content-editor (port 5001).
"""
from __future__ import annotations

import json
import re
import sys
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_HERE = Path(__file__).parent
_PROMPTS_DIR = _HERE.parent / "mcq_generator" / "mcq_gen" / "prompts"
_VARS_FILE = _PROMPTS_DIR / "variables.json"

# ---------------------------------------------------------------------------
# Add mcq_generator to Python path so agents can be imported
# ---------------------------------------------------------------------------
_MCQ_GEN_ROOT = str(_HERE.parent / "mcq_generator")
if _MCQ_GEN_ROOT not in sys.path:
    sys.path.insert(0, _MCQ_GEN_ROOT)

# ---------------------------------------------------------------------------
# Agent prompt registry — one unified template file per agent
# ---------------------------------------------------------------------------
_AGENT_PROMPTS: dict[str, dict] = {
    "strategist": {
        "label": "策略師 (Strategist)",
        "order": 1,
        "filename": "strategist_prompt.md",
        "description": "分析題庫分佈，決定下一題的規格。",
    },
    "drafter": {
        "label": "出題員 (Drafter)",
        "order": 2,
        "filename": "drafter_prompt.md",
        "description": "根據規格和篇章原文撰寫 MC 題目草稿。",
    },
    "critic": {
        "label": "審題主任 (Critic)",
        "order": 3,
        "filename": "critic_prompt.md",
        "description": "審核出題員的草稿，給出 PASS 或 REVISE 判決。",
    },
}

# ---------------------------------------------------------------------------
# Closing-section variant files (editable prompt pills inside Drafter)
# ---------------------------------------------------------------------------
_CLOSING_PROMPTS: dict[str, dict] = {
    "drafter_closing_initial": {
        "label": "收尾指令 — 初次出題",
        "filename": "drafter_user_closing_initial.md",
        "variant": "initial",
    },
    "drafter_closing_revision": {
        "label": "收尾指令 — 修改模式",
        "filename": "drafter_user_closing_revision.md",
        "variant": "revision",
    },
}

# ---------------------------------------------------------------------------
# In-memory test-run sessions: session_id → {spec, draft, critique, traces}
# ---------------------------------------------------------------------------
_RUN_SESSIONS: dict[str, dict] = {}


def _read(filename: str) -> str:
    path = _PROMPTS_DIR / filename
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _write(filename: str, content: str) -> None:
    (_PROMPTS_DIR / filename).write_text(content, encoding="utf-8")


def _load_variables() -> dict:
    if _VARS_FILE.exists():
        return json.loads(_VARS_FILE.read_text(encoding="utf-8"))
    return {}


def _find_vars_in_text(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"\{\{(\w+)\}\}", text)))


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.get("/")
def index():
    return send_from_directory(_HERE / "templates", "editor.html")


@app.get("/api/data")
def api_data():
    """Return all agent prompts, closing variants, and variable metadata."""
    variables = _load_variables()

    agent_prompts = {}
    for key, meta in _AGENT_PROMPTS.items():
        content = _read(meta["filename"])
        agent_prompts[key] = {
            **meta,
            "content": content,
            "vars_used": _find_vars_in_text(content),
        }

    closing_prompts = {}
    for key, meta in _CLOSING_PROMPTS.items():
        content = _read(meta["filename"])
        closing_prompts[key] = {
            **meta,
            "content": content,
            "vars_used": _find_vars_in_text(content),
        }

    return jsonify({
        "agent_prompts": agent_prompts,
        "closing_prompts": closing_prompts,
        "variables": variables,
    })


@app.post("/api/save")
def api_save():
    """Save agent prompts and/or closing prompt variants."""
    body = request.get_json(force=True)
    saved = []
    errors = []

    for key, content in (body.get("agent_prompts") or {}).items():
        meta = _AGENT_PROMPTS.get(key)
        if not meta:
            errors.append(f"Unknown agent key: {key}")
            continue
        _write(meta["filename"], content)
        saved.append(key)

    for key, content in (body.get("closing_prompts") or {}).items():
        meta = _CLOSING_PROMPTS.get(key)
        if not meta:
            errors.append(f"Unknown closing key: {key}")
            continue
        _write(meta["filename"], content)
        saved.append(key)

    if errors:
        return jsonify({"ok": False, "saved": saved, "errors": errors}), 400
    return jsonify({"ok": True, "saved": saved})


# ---------------------------------------------------------------------------
# Test-Run API
# ---------------------------------------------------------------------------

def _import_agents():
    """Lazy import of agent modules (requires mcq_generator in sys.path)."""
    from mcq_gen.agents.strategist import run_strategist
    from mcq_gen.agents.drafter import run_drafter
    from mcq_gen.agents.critic import run_critic
    from mcq_gen.llm import get_traces, reset_traces
    return run_strategist, run_drafter, run_critic, get_traces, reset_traces


@app.post("/api/test-run/start")
def api_test_run_start():
    """
    Start a new test-run pipeline by calling the Strategist with real DB stats.
    Returns session_id, the prompt used, the raw response, and the parsed Spec.
    """
    try:
        run_strategist, _, _, get_traces, reset_traces = _import_agents()
    except Exception as exc:
        return jsonify({"ok": False, "error": f"Import error: {exc}"}), 500

    reset_traces()
    try:
        spec = run_strategist()
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500

    traces = get_traces()
    trace = traces[-1] if traces else {}

    session_id = str(uuid.uuid4())
    _RUN_SESSIONS[session_id] = {
        "spec": spec,
        "draft": None,
        "critique": None,
    }

    return jsonify({
        "ok": True,
        "session_id": session_id,
        "agent": "strategist",
        "prompt_used": trace.get("merged_prompt", ""),
        "response_text": trace.get("raw_response", ""),
        "prompt_tokens": trace.get("prompt_tokens", 0),
        "response_tokens": trace.get("response_tokens", 0),
        "spec_json": spec.model_dump(),
    })


@app.post("/api/test-run/next")
def api_test_run_next():
    """
    Continue a test-run to the next agent.
    Body: { "session_id": "...", "agent": "drafter" | "critic" }
    """
    body = request.get_json(force=True)
    session_id = body.get("session_id", "")
    agent = body.get("agent", "")

    session = _RUN_SESSIONS.get(session_id)
    if not session:
        return jsonify({"ok": False, "error": "Session not found or expired."}), 404

    try:
        _, run_drafter, run_critic, get_traces, reset_traces = _import_agents()
    except Exception as exc:
        return jsonify({"ok": False, "error": f"Import error: {exc}"}), 500

    reset_traces()
    spec = session["spec"]
    result_data: dict = {}

    if agent == "drafter":
        try:
            draft = run_drafter(spec)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500
        session["draft"] = draft
        traces = get_traces()
        trace = traces[-1] if traces else {}
        result_data = {
            "agent": "drafter",
            "prompt_used": trace.get("merged_prompt", ""),
            "response_text": trace.get("raw_response", ""),
            "prompt_tokens": trace.get("prompt_tokens", 0),
            "response_tokens": trace.get("response_tokens", 0),
            "draft_json": draft.model_dump(),
        }

    elif agent == "critic":
        draft = session.get("draft")
        if not draft:
            return jsonify({"ok": False, "error": "Drafter has not run yet."}), 400
        try:
            critique = run_critic(spec, draft)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500
        session["critique"] = critique
        traces = get_traces()
        trace = traces[-1] if traces else {}
        result_data = {
            "agent": "critic",
            "prompt_used": trace.get("merged_prompt", ""),
            "response_text": trace.get("raw_response", ""),
            "prompt_tokens": trace.get("prompt_tokens", 0),
            "response_tokens": trace.get("response_tokens", 0),
            "critique_json": critique.model_dump(),
        }

    else:
        return jsonify({"ok": False, "error": f"Unknown agent: {agent!r}"}), 400

    return jsonify({"ok": True, "session_id": session_id, **result_data})


@app.delete("/api/test-run/<session_id>")
def api_test_run_delete(session_id: str):
    """Clean up a test-run session."""
    _RUN_SESSIONS.pop(session_id, None)
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("🔴  Prompt Editor running at http://localhost:5002")
    app.run(port=5002, debug=True)

