#!/usr/bin/env python3
"""
Keeonz Content Editor - Local Development Server
Edits T&C, Privacy Policy, and School Partner content files.

Run:  python server.py
Open: http://localhost:5001
"""

from pathlib import Path
import json
import re
import sys

try:
    from flask import Flask, jsonify, request, render_template
    from flask_cors import CORS
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "flask", "flask-cors"])
    from flask import Flask, jsonify, request, render_template
    from flask_cors import CORS

app = Flask(__name__)
CORS(app)

BASE = Path(__file__).parent
SRC_CONTENT = BASE.parent.parent / "src" / "content"

TERMS_TS = SRC_CONTENT / "termsContent.ts"
PRIVACY_TS = SRC_CONTENT / "privacyContent.ts"
SCHOOL_JSON = SRC_CONTENT / "schoolPartner.json"
SUBSCRIPTION_JSON = SRC_CONTENT / "subscriptionContent.json"

# ─── TS Parser / Writer ───────────────────────────────────────────────────────

SECTION_RE = re.compile(
    r'\{\s*title:\s*"((?:[^"\\]|\\.)*)"\s*,\s*body:\s*`([\s\S]*?)`\s*,?\s*\}',
    re.MULTILINE,
)
LU_TERMS_RE = re.compile(r'TERMS_LAST_UPDATED\s*=\s*"([^"]+)"')
LU_PRIVACY_RE = re.compile(r'PRIVACY_LAST_UPDATED\s*=\s*"([^"]+)"')


def parse_ts_sections(filepath: Path, lu_re: re.Pattern) -> dict:
    text = filepath.read_text(encoding="utf-8")
    lu_match = lu_re.search(text)
    last_updated = lu_match.group(1) if lu_match else "2025年1月1日"
    sections = []
    for m in SECTION_RE.finditer(text):
        sections.append(
            {
                "title": m.group(1).replace('\\"', '"'),
                "body": m.group(2).replace("\\`", "`"),
            }
        )
    return {"lastUpdated": last_updated, "sections": sections}


def build_ts_section(s: dict) -> list:
    title = s["title"].replace("\\", "\\\\").replace('"', '\\"')
    body = s["body"].replace("`", "\\`")
    return [
        "  {",
        f'    title: "{title}",',
        f"    body: `{body}`,",
        "  },",
    ]


def write_ts_terms(data: dict):
    lines = [
        "export interface LegalSection {",
        "  title: string;",
        "  body: string;",
        "}",
        "",
        f'export const TERMS_LAST_UPDATED = "{data.get("lastUpdated", "2025年1月1日")}";',
        "",
        "export const TERMS_SECTIONS: LegalSection[] = [",
    ]
    for s in data.get("sections", []):
        lines.extend(build_ts_section(s))
    lines += ["];", ""]
    TERMS_TS.write_text("\n".join(lines), encoding="utf-8")


def write_ts_privacy(data: dict):
    lines = [
        'import { LegalSection } from "./termsContent";',
        "",
        f'export const PRIVACY_LAST_UPDATED = "{data.get("lastUpdated", "2025年1月1日")}";',
        "",
        "export const PRIVACY_SECTIONS: LegalSection[] = [",
    ]
    for s in data.get("sections", []):
        lines.extend(build_ts_section(s))
    lines += ["];", ""]
    PRIVACY_TS.write_text("\n".join(lines), encoding="utf-8")


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.route("/")
def index():
    return render_template("editor.html")


@app.route("/api/content/<doc>")
def get_content(doc: str):
    if doc == "terms":
        if not TERMS_TS.exists():
            return jsonify({"error": f"File not found: {TERMS_TS}"}), 404
        return jsonify(parse_ts_sections(TERMS_TS, LU_TERMS_RE))
    elif doc == "privacy":
        if not PRIVACY_TS.exists():
            return jsonify({"error": f"File not found: {PRIVACY_TS}"}), 404
        return jsonify(parse_ts_sections(PRIVACY_TS, LU_PRIVACY_RE))
    elif doc == "school":
        if not SCHOOL_JSON.exists():
            return jsonify({"error": f"File not found: {SCHOOL_JSON}"}), 404
        return jsonify(json.loads(SCHOOL_JSON.read_text(encoding="utf-8")))
    elif doc == "subscription":
        if not SUBSCRIPTION_JSON.exists():
            return jsonify({"error": f"File not found: {SUBSCRIPTION_JSON}"}), 404
        return jsonify(json.loads(SUBSCRIPTION_JSON.read_text(encoding="utf-8")))
    return jsonify({"error": "Unknown document"}), 404


@app.route("/api/content/<doc>", methods=["POST"])
def save_content(doc: str):
    data = request.get_json(force=True)
    if not data:
        return jsonify({"success": False, "message": "No JSON body received"}), 400
    try:
        if doc == "terms":
            write_ts_terms(data)
        elif doc == "privacy":
            write_ts_privacy(data)
        elif doc == "school":
            SCHOOL_JSON.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        elif doc == "subscription":
            SUBSCRIPTION_JSON.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        else:
            return jsonify({"success": False, "message": "Unknown document"}), 404
        return jsonify({"success": True, "message": "已成功儲存！"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


if __name__ == "__main__":
    def status(p: Path) -> str:
        return "✅" if p.exists() else "❌ 找不到"

    print("=" * 60)
    print("📜  Keeonz Content Editor")
    print("=" * 60)
    print(f"📁  內容目錄   : {SRC_CONTENT}")
    print(f"📄  使用條款   : {TERMS_TS.name}  {status(TERMS_TS)}")
    print(f"📄  私隱政策   : {PRIVACY_TS.name}  {status(PRIVACY_TS)}")
    print(f"📄  學校服務   : {SCHOOL_JSON.name}  {status(SCHOOL_JSON)}")
    print(f"📄  訂閱方案   : {SUBSCRIPTION_JSON.name}  {status(SUBSCRIPTION_JSON)}")
    print()
    print("🌐  開啟瀏覽器: http://localhost:5001")
    print("=" * 60)
    app.run(port=5001, debug=True, use_reloader=False)
