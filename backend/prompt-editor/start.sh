#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
pip install -r requirements.txt --quiet
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  提示詞編輯器  http://localhost:5002     ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
python server.py
