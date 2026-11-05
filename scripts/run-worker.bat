@echo off
REM AI City 常駐 worker：用本地 Codex 生成角色圖與角色對話。
REM 關掉這個視窗就會停止；重新啟動只要雙擊本檔。

cd /d "%~dp0.."

set GOOGLE_CLOUD_PROJECT=ai-city-511822
set NO_COLOR=1

REM 對話重生成間隔（秒）。預設 1800 = 30 分鐘。
set AI_CITY_CHAT_TTL_SECONDS=1800

REM 對話用的模型（輕量即可）。
set AI_CITY_CHAT_WORKER_MODEL=gpt-6-luna

title AI City Worker

echo ==========================================
echo  AI City 常駐 worker
echo  專案: %GOOGLE_CLOUD_PROJECT%
echo  Ctrl+C 或關閉視窗即可停止
echo ==========================================
echo.

node scripts\avatar-worker.mjs

echo.
echo [worker] 已結束 (exit=%ERRORLEVEL%)
pause
