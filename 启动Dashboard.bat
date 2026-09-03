@echo off
rem 432 Statistics Dashboard launcher
rem ASCII-only content for cmd.exe compatibility (do not add Chinese here)
cd /d "%~dp0"

set "PYCMD=py -3"
py -3 -c "print(1)" >nul 2>nul
if errorlevel 1 set "PYCMD=python"

%PYCMD% -c "import flask, pypdfium2, PIL" >nul 2>nul
if errorlevel 1 (
    echo [Setup] Installing dependencies, please wait...
    %PYCMD% -m pip install -r requirements.txt --disable-pip-version-check
    if errorlevel 1 (
        echo [ERROR] Dependency install failed. Check network and retry.
        pause
        exit /b 1
    )
)

echo Starting dashboard at http://localhost:3000
echo Close this window or press Ctrl+C to stop the server.
start "" http://localhost:3000
%PYCMD% backend\app.py
echo.
echo Server stopped.
pause
