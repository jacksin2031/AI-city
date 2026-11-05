@echo off
REM AI City 對話 worker：用本地 Codex 為虛構住民產生日語雑談，存入 Firestore。
REM 需要先執行一次 gcloud auth application-default login。關閉視窗即停止。
cd /d "%~dp0.."
set AI_CITY_VISITOR_NAMESPACE=preview-visitors-20261019
set AI_CITY_CHAT_TTL_SECONDS=1800
title AI City Dialogue Worker
node scripts\run-dialogue-worker.mjs
pause
