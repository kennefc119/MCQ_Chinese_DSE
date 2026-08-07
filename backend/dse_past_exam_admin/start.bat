@echo off
cd /d "%~dp0"
echo.
echo  =======================================================
echo  DSE Past Exam Admin  http://localhost:8768
echo  =======================================================
echo.
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8768 --reload
pause
