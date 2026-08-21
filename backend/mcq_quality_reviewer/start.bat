@echo off
cd /d "%~dp0"
echo.
echo  ============================================================
echo   MCQ Quality Reviewer    http://127.0.0.1:8768
echo   Audit records remain in data\audit.sqlite3
echo  ============================================================
echo.
start "" "http://127.0.0.1:8768"
python -m uvicorn server:app --host 127.0.0.1 --port 8768 --reload
pause