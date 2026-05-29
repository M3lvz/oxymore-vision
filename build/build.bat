@echo off
setlocal
cd /d "%~dp0.."

echo.
echo ========================================
echo   Oxymore Vision — Build desktop
echo ========================================
echo.

python --version >nul 2>&1 || (echo [ERREUR] Python introuvable & pause & exit /b 1)

echo [1/2] Dependances de build...
pip install pyinstaller flask flask-socketio flask-cors python-socketio python-engineio eventlet pywebview requests "qrcode[pil]" pillow cryptography psutil toml tomli_w -q
if errorlevel 1 (echo [ERREUR] pip install echoue & pause & exit /b 1)

echo [2/2] Compilation PyInstaller...
python -m PyInstaller --noconfirm build\desktop.spec --distpath dist --workpath build\work
if errorlevel 1 (echo [ERREUR] PyInstaller echoue & pause & exit /b 1)

echo.
echo ========================================
echo   Build termine !
echo   Executable : dist\OxymoreVision.exe
echo ========================================
echo.
pause
