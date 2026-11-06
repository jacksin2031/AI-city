@echo off
REM Check that this PC can run the AI City workers (ASCII only, CRLF).
REM Read-only: it does not log in, install, or call the network.
cd /d "%~dp0.."
title AI City Worker Setup Check
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 24.12 or newer from nodejs.org, then run this again.
  pause
  exit /b 1
)
node scripts\check-worker-env.mjs
set RESULT=%ERRORLEVEL%
echo.
if "%RESULT%"=="0" (
  echo Next: double-click scripts\run-cloud-spine-worker.bat ^(photos^) or scripts\run-dialogue-worker.bat ^(chat^).
) else (
  echo Fix the FAIL items above, then run this file again.
)
pause
exit /b %RESULT%
