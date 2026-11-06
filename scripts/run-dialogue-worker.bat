@echo off
REM AI City dialogue worker. Run "gcloud auth application-default login" once first.
REM Close this window to stop.
cd /d "%~dp0.."
set AI_CITY_VISITOR_NAMESPACE=preview-visitors-20261019
set AI_CITY_CHAT_TTL_SECONDS=1800
title AI City Dialogue Worker
REM This launcher opts in to live AI dialogue. It uses Codex model calls while running.
REM To stop model usage, close this window; offline preset dialogue remains available.
node scripts/run-dialogue-worker.mjs --chat
echo.
echo Worker exited with code %ERRORLEVEL%
pause
