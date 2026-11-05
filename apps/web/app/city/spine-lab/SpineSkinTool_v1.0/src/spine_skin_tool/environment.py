"""版本清单、受控子进程环境和基础开发环境自检。"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from .config import ConfigError, ToolConfig, read_toml


def process_env(root: Path) -> dict[str, str]:
    env = dict(os.environ)
    env.pop("PYTHONHOME", None)
    env.update({
        "PYTHONPATH": str(root / "src"),
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONNOUSERSITE": "1",
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "UV_PROJECT_ENVIRONMENT": str(root / "runtime/python/.venv"),
        "UV_CACHE_DIR": str(root / "runtime/cache/uv"),
        "UV_PYTHON_INSTALL_DIR": str(root / "runtime/bin/python"),
        "UV_PYTHON_DOWNLOADS": "never",
        "PLAYWRIGHT_BROWSERS_PATH": str(root / "runtime/cache/playwright"),
        "PNPM_HOME": str(root / "runtime/bin/pnpm"),
        "COREPACK_ENABLE_AUTO_PIN": "0",
        "COREPACK_ENABLE_NETWORK": "0",
    })
    return env


def venv_python(root: Path) -> Path:
    return root / ("runtime/python/.venv/Scripts/python.exe" if os.name == "nt" else "runtime/python/.venv/bin/python")


def toolchain_checks(root: Path, versions: dict) -> list[dict]:
    checks = [{"code": "PYTHON_VERSION", "ok": sys.version.split()[0] == versions["toolchain"]["python"], "expected": versions["toolchain"]["python"], "actual": sys.version.split()[0]}]
    for name in ("uv", "node", "pnpm"):
        executable = shutil.which(name)
        actual = None
        if executable:
            try:
                result = subprocess.run([executable, "--version"], cwd=root / "runtime/js", env=process_env(root), capture_output=True, text=True, timeout=20)
                if result.returncode == 0:
                    words = result.stdout.strip().split()
                    actual = words[1] if name == "uv" else words[0].removeprefix("v")
            except (OSError, subprocess.TimeoutExpired, IndexError):
                pass
        checks.append({"code": name.upper() + "_VERSION", "ok": actual == versions["toolchain"][name], "expected": versions["toolchain"][name], "actual": actual})
    return checks


def environment_report(config: ToolConfig, production: bool = False) -> dict:
    root = config.root
    versions = read_toml(root / "runtime/versions.toml")
    checks = toolchain_checks(root, versions)
    checks.append({"code": "ISOLATED_PYTHON", "ok": Path(sys.prefix).resolve() == (root / "runtime/python/.venv").resolve()})
    for relative in ("runtime/python/uv.lock", "runtime/js/pnpm-lock.yaml"):
        checks.append({"code": "LOCKFILE", "path": relative, "ok": (root / relative).is_file()})
    try:
        python = read_toml(root / "runtime/python/pyproject.toml")
        js = json.loads((root / "runtime/js/package.json").read_text(encoding="utf-8"))
        checks.append({"code": "MANIFEST_VERSIONS", "ok": (
            python["project"]["version"] == js["version"] == versions["product"]["version"]
            and python["project"]["requires-python"] == "==" + versions["toolchain"]["python"]
            and js["engines"]["node"] == versions["toolchain"]["node"]
            and js["engines"]["pnpm"] == versions["toolchain"]["pnpm"]
            and js["packageManager"] == "pnpm@" + versions["toolchain"]["pnpm"]
            and config.trial["schema_version"] == versions["product"]["asset_schema"]
        )})
    except (KeyError, OSError, ValueError):
        raise ConfigError("MANIFEST_INVALID") from None
    limitations = ["M07_FULL_CHARACTER_QUALITY_NOT_APPROVED", "PRODUCTION_SIZES_NOT_APPROVED", "CLEAN_WINDOWS_INSTALL_NOT_VALIDATED", "REFERENCE_ART_REDISTRIBUTION_NOT_VERIFIED", "M08_HELD_OUT_PHOTOS_NOT_VALIDATED"]
    if (root/'references/spine').exists():
        from .reference_assets import inspect
        try:
            inspect(root);checks.append({'code':'BUNDLED_REFERENCE_ASSETS','ok':True})
            limitations[3]='REFERENCE_ART_COMMERCIAL_USE_NOT_AUTHORIZED'
        except (OSError,ValueError,KeyError):checks.append({'code':'BUNDLED_REFERENCE_ASSETS','ok':False})
    if production:
        checks.extend({"code": code, "ok": False} for code in limitations)
    ready = all(check["ok"] for check in checks)
    return {
        "status": "LOCAL_ENVIRONMENT_READY" if ready else "NOT_READY",
        "scope": "PRODUCTION" if production else "BOOTSTRAP",
        "message": "基礎環境の確認結果です。画像生成・アニメーション再生の合格を示すものではありません。",
        "checks": checks,
        "size_trial": {"status": config.trial["trial"]["status"], "sha256": config.trial_sha256, "production_approved": False},
        "unverified": limitations,
    }
