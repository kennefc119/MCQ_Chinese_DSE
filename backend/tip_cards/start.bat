@echo off
cd /d "%~dp0"
echo.
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║  Tip Card Admin API   http://127.0.0.1:8767         ║
echo  ║  Opening dashboard...                               ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.
start "" "http://127.0.0.1:8767"
python -m uvicorn server:app --host 127.0.0.1 --port 8767 --reload
pause