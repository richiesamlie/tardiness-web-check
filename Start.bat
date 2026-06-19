@echo off
REM ============================================
REM   Tardiness Check — Start Script (Windows)
REM ============================================
REM   Double-click this file to start the app.
REM   The server will run in this window.
REM   Press Ctrl+C to stop.
REM ============================================

title Tardiness Check Server
cd /d "%~dp0"

REM --- Check Node.js ---
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: Node.js is not installed.
    echo.
    echo   Please install Node.js 22 or later from:
    echo   https://nodejs.org/
    echo.
    echo   Choose the "LTS" version and use default options.
    echo.
    pause
    exit /b 1
)

REM --- First-run: install dependencies ---
if not exist "node_modules" (
    echo.
    echo   First run: installing dependencies... (this takes ~30 seconds)
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo   ERROR: Failed to install dependencies.
        echo   Check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo   Dependencies installed.
    echo.
)

REM --- Open browser after a short delay (in background) ---
start "" /min cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

echo.
echo ============================================
echo   Tardiness Check Server
echo ============================================
echo.
echo   When ready, your browser will open at:
echo   http://localhost:3000
echo.
echo   To stop the server: press Ctrl+C
echo.
echo ============================================
echo.

node --no-warnings src\server.js

echo.
echo   Server stopped.
pause
