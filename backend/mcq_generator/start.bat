@echo off
cd /d "%~dp0"
echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║  MCQ Generator API  http://localhost:8765     ║
echo  ║  Dashboard: open dashboard.html in browser   ║
echo  ╚═══════════════════════════════════════════════╝
echo.
python -m uvicorn mcq_gen.server:app --host 127.0.0.1 --port 8765
pause
