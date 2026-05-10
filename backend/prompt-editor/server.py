"""
Prompt Editor — Flask server for viewing and editing MCQ Generator LLM prompts.
Runs on port 5002, separate from content-editor (port 5001).
"""
from __future__ import annotations

import json
import re
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

# All editable prompt files with human-readable labels
_SYSTEM_PROMPTS: dict[str, dict] = {
    "strategist_system": {
        "label": "策略師 — 系統提示",
        "agent": "strategist",
        "filename": "strategist.md",
        "kind": "system",
    },
    "drafter_system": {
        "label": "出題員 — 系統提示",
        "agent": "drafter",
        "filename": "drafter.md",
        "kind": "system",
    },
    "critic_system": {
        "label": "審題主任 — 系統提示",
        "agent": "critic",
        "filename": "critic.md",
        "kind": "system",
    },
}

_USER_PROMPTS: dict[str, dict] = {
    "strategist_user": {
        "label": "策略師 — 用戶消息",
        "agent": "strategist",
        "filename": "strategist_user.md",
        "kind": "user",
    },
    "drafter_user": {
        "label": "出題員 — 用戶消息（主體）",
        "agent": "drafter",
        "filename": "drafter_user.md",
        "kind": "user",
    },
    "drafter_user_closing_initial": {
        "label": "出題員 — 收尾（初次出題）",
        "agent": "drafter",
        "filename": "drafter_user_closing_initial.md",
        "kind": "user",
    },
    "drafter_user_closing_revision": {
        "label": "出題員 — 收尾（修改模式）",
        "agent": "drafter",
        "filename": "drafter_user_closing_revision.md",
        "kind": "user",
    },
    "critic_user": {
        "label": "審題主任 — 用戶消息",
        "agent": "critic",
        "filename": "critic_user.md",
        "kind": "user",
    },
}

_ALL_PROMPTS = {**_SYSTEM_PROMPTS, **_USER_PROMPTS}


def _load_prompt(key: str) -> str:
    meta = _ALL_PROMPTS.get(key)
    if not meta:
        return ""
    path = _PROMPTS_DIR / meta["filename"]
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _save_prompt(key: str, content: str) -> bool:
    meta = _ALL_PROMPTS.get(key)
    if not meta:
        return False
    path = _PROMPTS_DIR / meta["filename"]
    path.write_text(content, encoding="utf-8")
    return True


def _load_variables() -> dict:
    if _VARS_FILE.exists():
        return json.loads(_VARS_FILE.read_text(encoding="utf-8"))
    return {}


def _save_variables(data: dict) -> None:
    _VARS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _find_vars_in_text(text: str) -> list[str]:
    """Find all {{VAR_NAME}} tokens in text, return list of unique var names."""
    return list(dict.fromkeys(re.findall(r"\{\{(\w+)\}\}", text)))


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.get("/")
def index():
    return send_from_directory(_HERE / "templates", "editor.html")


@app.get("/api/data")
def api_data():
    """Return all prompts + variable registry."""
    prompts = {}
    for key, meta in _ALL_PROMPTS.items():
        content = _load_prompt(key)
        prompts[key] = {
            **meta,
            "content": content,
            "vars_used": _find_vars_in_text(content),
        }

    variables = _load_variables()

    # Annotate each variable with which prompts use it
    for var_key, var_meta in variables.items():
        used_in = [
            k for k, p in prompts.items()
            if var_key in p.get("vars_used", [])
        ]
        var_meta["used_in_prompts"] = used_in

    return jsonify({
        "prompts": prompts,
        "variables": variables,
        "prompt_meta": _ALL_PROMPTS,
    })


@app.post("/api/save")
def api_save():
    """Save one or more prompts and/or variables."""
    body = request.get_json(force=True)
    saved = []
    errors = []

    # Save prompts
    for key, content in (body.get("prompts") or {}).items():
        if _save_prompt(key, content):
            saved.append(key)
        else:
            errors.append(f"Unknown prompt key: {key}")

    # Save variables
    if "variables" in body:
        try:
            _save_variables(body["variables"])
            saved.append("variables.json")
        except Exception as exc:
            errors.append(str(exc))

    if errors:
        return jsonify({"ok": False, "saved": saved, "errors": errors}), 400
    return jsonify({"ok": True, "saved": saved})


@app.get("/api/prompt/<key>")
def api_prompt_get(key: str):
    meta = _ALL_PROMPTS.get(key)
    if not meta:
        return jsonify({"error": "not found"}), 404
    content = _load_prompt(key)
    return jsonify({**meta, "content": content, "vars_used": _find_vars_in_text(content)})


@app.post("/api/prompt/<key>")
def api_prompt_post(key: str):
    body = request.get_json(force=True)
    content = body.get("content", "")
    if not _save_prompt(key, content):
        return jsonify({"error": "unknown key"}), 404
    return jsonify({"ok": True, "key": key, "vars_used": _find_vars_in_text(content)})


if __name__ == "__main__":
    print("🔴  Prompt Editor running at http://localhost:5002")
    app.run(port=5002, debug=True)
