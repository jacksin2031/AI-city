@echo off
REM AI City cloud Spine worker launcher (ASCII only, CRLF).
REM Needs: gcloud auth application-default login (once), and Codex logged in on this PC.
REM Close this window to stop. Real model calls need an explicit YES below.
cd /d "%~dp0.."

set "TOOLCHAIN=%CD%\apps\web\app\city\spine-lab\SpineSkinTool_v1.0\runtime\bin\toolchain"
set "PATH=%TOOLCHAIN%\uv;%TOOLCHAIN%\node\node-v22.17.1-win-x64;%PATH%"
set "AI_CITY_VISITOR_NAMESPACE=preview-visitors-20261019"
set "AI_CITY_SPINE_PHOTO_BUCKET=ai-city-511822-spine-photos"
set "AI_CITY_SPINE_LOCAL_DIR=%LOCALAPPDATA%\ai-city-spine-scratch"
if not exist "%AI_CITY_SPINE_LOCAL_DIR%" mkdir "%AI_CITY_SPINE_LOCAL_DIR%"

title AI City Cloud Spine Worker
echo ============================================
echo  AI City cloud Spine worker
echo  Bucket: %AI_CITY_SPINE_PHOTO_BUCKET%
echo  Scratch: %AI_CITY_SPINE_LOCAL_DIR%
echo ============================================
echo.
echo Real participant photos are sent to external AI models (costs money).
set /p CONFIRM=Type YES to run live with up to 20 model calls per photo, or press Enter for preparation only:
if /i "%CONFIRM%"=="YES" (
  set "AI_CITY_SPINE_LIVE_CONFIRM=I_AUTHORIZE_REAL_MODEL_CALLS"
  node scripts/run-cloud-spine-worker.mjs --live --cap=20
) else (
  node scripts/run-cloud-spine-worker.mjs
)
echo.
echo Worker exited with code %ERRORLEVEL%
pause
