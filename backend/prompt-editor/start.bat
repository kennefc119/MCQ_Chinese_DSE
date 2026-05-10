@echo off
cd /d "%~dp0"
pip install -r requirements.txt --quiet
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  提示詞編輯器  http://localhost:5002     ║
echo  ╚══════════════════════════════════════════╝
echo.
python server.py
pause
