#!/usr/bin/env python3
"""只读基础环境检查；--production 不表示生产功能已经实现。"""
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from spine_skin_tool.cli import main

if __name__ == "__main__":
    raise SystemExit(main(["doctor", *sys.argv[1:]]))
