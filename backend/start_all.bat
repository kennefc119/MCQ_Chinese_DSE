@echo off
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  啟動所有後端伺服器                                      ║
echo  ║  Prompt Editor:  http://localhost:5002                   ║
echo  ║  MCQ Generator:  http://localhost:8765                   ║
echo  ║  Tip Card Admin: http://localhost:8767                   ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: Start Prompt Editor in a new window
start "Prompt Editor (5002)" cmd /k "cd /d "%~dp0prompt-editor" && python server.py"

:: Start MCQ Generator in a new window
start "MCQ Generator (8765)" cmd /k "cd /d "%~dp0mcq_generator" && python -m uvicorn mcq_gen.server:app --host 127.0.0.1 --port 8765"

:: Start Tip Card Admin in a new window
start "Tip Card Admin (8767)" cmd /k "cd /d "%~dp0tip_cards" && python -m uvicorn server:app --host 127.0.0.1 --port 8767 --reload"

echo All servers starting in separate windows...
echo.
pause
