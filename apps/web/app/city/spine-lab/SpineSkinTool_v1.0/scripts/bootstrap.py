#!/usr/bin/env python3
"""从现有的已锁定工具重建本地环境；本阶段全程离线且不安装全局软件。"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from spine_skin_tool.config import ConfigError, load_config, read_toml
from spine_skin_tool.environment import process_env, toolchain_checks, venv_python


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="基礎環境の再構築（オフライン）")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--install", action="store_true")
    mode.add_argument("--check-only", action="store_true")
    parser.add_argument("--online", action="store_true", help="ロック済み依存物のダウンロードを明示的に許可")
    args = parser.parse_args()
    if args.online and not args.install:parser.error('--online requires --install')
    try:
        config = load_config(ROOT)
        versions = read_toml(ROOT / "runtime/versions.toml")
        if args.install and sys.version.split()[0] != versions["toolchain"]["python"]:
            # Discover an existing interpreter read-only; never install globally.
            uv = shutil.which("uv")
            if not uv:
                return 1
            discovery_env = dict(os.environ)
            for name in ("PYTHONHOME", "PYTHONPATH", "VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT", "UV_PYTHON"):
                discovery_env.pop(name, None)
            found = subprocess.run([uv, "python", "find", versions["toolchain"]["python"], "--no-python-downloads"], cwd=ROOT, env=discovery_env, capture_output=True, text=True, timeout=30)
            if found.returncode:
                print("指定された Python が見つかりません。runtime/versions.toml を確認してください。", file=sys.stderr)
                return 1
            interpreter = found.stdout.strip()
            probe = subprocess.run([interpreter, "-I", "-c", "import sys; print(sys.version.split()[0])"], env=discovery_env, capture_output=True, text=True, timeout=10)
            if probe.returncode or probe.stdout.strip() != versions["toolchain"]["python"]:
                return 1
            return subprocess.run([interpreter, "-B", str(Path(__file__).resolve()), "--install", *(['--online'] if args.online else [])], cwd=ROOT, env=process_env(ROOT), timeout=300).returncode
        if args.install:
            checks = toolchain_checks(ROOT, versions)
            if not all(check["ok"] for check in checks):
                print("ツールのバージョンが一致しません。runtime/versions.toml を確認してください。", file=sys.stderr)
                return 1
            for path in (ROOT / "runtime/python/.venv", ROOT / "runtime/js/node_modules", ROOT / "runtime/bin", ROOT / "runtime/tmp", ROOT / "runtime/secrets", ROOT / "runtime/vendor-untracked"):
                if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()) or not path.resolve().is_relative_to(ROOT):
                    raise ConfigError("UNSAFE_ENVIRONMENT_PATH")
            for path in [*config.resolved_paths.values(), ROOT / "runtime/tmp", ROOT / "runtime/bin"]:
                path.mkdir(parents=True, exist_ok=True)
            env = process_env(ROOT)
            env.update({key: str(ROOT / "runtime/tmp") for key in ("TEMP", "TMP", "TMPDIR")})
            commands = [
                [shutil.which("uv"), "sync", "--project", str(ROOT / "runtime/python"), "--python", sys.executable, "--locked", *([] if args.online else ['--offline']), "--no-python-downloads"],
                [shutil.which("pnpm"), "--dir", str(ROOT / "runtime/js"), "--ignore-workspace", "install", "--frozen-lockfile", *([] if args.online else ['--offline']), "--ignore-scripts", "--store-dir", str(config.resolved_paths["cache"] / "pnpm")],
            ]
            for command in commands:
                result = subprocess.run(command, cwd=ROOT, env=env, timeout=120)
                if result.returncode:
                    return result.returncode
        executable = venv_python(ROOT)
        if not executable.is_file():
            print("ローカル Python 環境がありません。--install を実行してください。", file=sys.stderr)
            return 1
        return subprocess.run([str(executable), "-B", str(ROOT / "scripts/doctor.py"), "--json"], cwd=ROOT, env=process_env(ROOT), timeout=60).returncode
    except (ConfigError, OSError, subprocess.TimeoutExpired, KeyError):
        print("基礎環境の確認・構築に失敗しました。設定、ロックファイルとツールを確認してください。", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
