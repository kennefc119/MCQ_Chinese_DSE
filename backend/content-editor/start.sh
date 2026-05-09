#!/bin/bash
cd "$(dirname "$0")"
echo "Installing dependencies..."
pip3 install -r requirements.txt
echo ""
echo "Starting Keeonz Content Editor..."
python3 server.py
