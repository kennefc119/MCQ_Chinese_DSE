@echo off
cd /d "%~dp0"
echo.
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║  心理測驗 Admin API   http://127.0.0.1:8766          ║
echo  ║  Opening dashboard...                                ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.
start "" "http://127.0.0.1:8766"
python -m uvicorn server:app --host 127.0.0.1 --port 8766 --reload
pause
