@echo off
cd /d "%~dp0"

:: Tue les instances precedentes sur les ports 5173 (HTTP) et 5174 (HTTPS REC)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

python server.py
pause
