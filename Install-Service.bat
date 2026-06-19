@echo off
REM ============================================
REM   Install as auto-start task (Windows)
REM ============================================
REM   Adds a Task Scheduler entry that runs
REM   Start.bat every time you log in.
REM   The server will start silently in the background.
REM ============================================

cd /d "%~dp0"

echo.
echo ============================================
echo   Installing auto-start for Tardiness Check
echo ============================================
echo.

REM Check admin (we need it for /rl highest)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo   NOTE: This script doesn't need admin rights, but Task Scheduler
    echo   may prompt you. If it fails, try right-click -^> Run as administrator.
    echo.
)

REM Remove old task if exists (ignore errors)
schtasks /delete /tn "TardinessCheck" /f >nul 2>&1

REM Create new task: run at user logon, with highest privileges
schtasks /create ^
    /tn "TardinessCheck" ^
    /tr "\"%~dp0Start.bat\"" ^
    /sc onlogon ^
    /rl highest ^
    /f

if %errorlevel% equ 0 (
    echo.
    echo   SUCCESS!
    echo.
    echo   Tardiness Check will now start automatically every time you
    echo   log in to Windows. The browser will open at http://localhost:3000
    echo.
    echo   To remove: run Uninstall-Service.bat
    echo.
) else (
    echo.
    echo   FAILED to create task.
    echo.
    echo   Try right-click -^> Run as administrator.
    echo   Or manually create a Task Scheduler entry that runs Start.bat on logon.
    echo.
)

pause
