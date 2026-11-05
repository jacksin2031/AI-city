@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\python\.venv\Scripts\python.exe" (
  "runtime\python\.venv\Scripts\python.exe" -B "scripts\launch.py" --subscription --open-browser %*
) else (
  echo First setup: python -B scripts/bootstrap.py --install --online
  echo Then run this launcher again. See the root usage document.
  pause
  exit /b 1
)
