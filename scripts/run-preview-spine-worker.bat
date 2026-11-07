@echo off
setlocal
REM Preview-only auto review and publish. Do not use for Production.
REM Only NEW QUEUED cloud-photo tasks are processed; held/UNKNOWN/withdrawn jobs stay untouched.
cd /d "%~dp0.."

set "AI_CITY_VISITOR_NAMESPACE=preview-staging-20261107"
set "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH=1"
set "AI_CITY_SPINE_PHOTO_BUCKET=ai-city-511822-spine-photos"
set "AI_CITY_SPINE_LOCAL_DIR=%LOCALAPPDATA%\ai-city-spine-preview-pc-20261107"
if not exist "%AI_CITY_SPINE_LOCAL_DIR%" mkdir "%AI_CITY_SPINE_LOCAL_DIR%"

echo This is a PREVIEW-ONLY, consent- and quality-gated auto-publication worker.
echo New queued photos may invoke external image and review models (up to 20 calls/task).
echo Production and existing held/withdrawn/UNKNOWN jobs will not be processed.
echo.
set "CONFIRM="
set /p "CONFIRM=Type YES once to start the Preview-only live worker: "
if /I not "%CONFIRM%"=="YES" (
  echo Cancelled without starting the worker.
  exit /b 0
)
set "AI_CITY_SPINE_LIVE_CONFIRM=I_AUTHORIZE_REAL_MODEL_CALLS"
node scripts/run-cloud-spine-worker.mjs --preview-queued-only --live --cap=20 --workers=1
set "RESULT=%ERRORLEVEL%"
echo Preview Spine Worker exited with code %RESULT%.
exit /b %RESULT%
