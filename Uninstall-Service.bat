@echo off
REM ============================================
REM   Uninstall auto-start task (Windows)
REM ============================================

echo.
echo   Removing TardinessCheck task from Task Scheduler...
echo.

schtasks /delete /tn "TardinessCheck" /f

if %errorlevel% equ 0 (
    echo.
    echo   SUCCESS — auto-start removed.
    echo   The app will no longer start automatically.
    echo.
) else (
    echo.
    echo   No auto-start task found (or could not remove it).
    echo.
)

pause
