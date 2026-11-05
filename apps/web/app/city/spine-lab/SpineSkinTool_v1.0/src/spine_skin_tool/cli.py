"""里程碑 1 仅提供 config / doctor，尚无生成或装配命令。"""
from __future__ import annotations

import argparse
import json
import sys

from .config import ConfigError, load_config
from .environment import environment_report


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Spine Skin Tool 基礎環境")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("config", "doctor"):
        command = commands.add_parser(name)
        command.add_argument("--json", action="store_true")
        if name == "doctor":
            command.add_argument("--production", action="store_true")
    args = parser.parse_args(argv)
    try:
        config = load_config()
        report = config.summary() if args.command == "config" else environment_report(config, args.production)
    except (ConfigError, KeyError, TypeError):
        report = {"status": "INVALID_CONFIG", "message": "設定を読み込めません。形式・許可された値・バージョンを確認してください。"}
        print(json.dumps(report, ensure_ascii=False))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return int(report.get("status") == "NOT_READY")


if __name__ == "__main__":
    raise SystemExit(main())
