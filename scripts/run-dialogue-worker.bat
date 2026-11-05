@echo off
REM AI City dialogue worker. Run "gcloud auth application-default login" once first.
REM Close this window to stop.
cd /d "%~dp0.."
set AI_CITY_VISITOR_NAMESPACE=preview-visitors-20261019
set AI_CITY_CHAT_TTL_SECONDS=1800
title AI City Dialogue Worker
node scripts/run-dialogue-worker.mjs
echo.
echo Worker exited with code %ERRORLEVEL%
pause
