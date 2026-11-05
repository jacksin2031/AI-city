#!/usr/bin/env python3
"""Sync one CURRENT JSON entry to the human-readable CHANGELOG batch section.

Only changes its own batch; historical entries are not silently rewritten.
Use after Codex has populated a truthful JSON entry and before verify_changes.py.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from verify_changes import changed_files, root_path


def to_markdown(data: dict) -> str:
    lines = [
        f"### {data['timestamp_local']} | {data['task_id']} | {data['batch_id']} | {data['status']}",
        f"- UTC: {data['timestamp_utc']}",
        f"- Goal: {data.get('goal', '')}",
        "- Files and corresponding code/sections:",
    ]
    for f in data.get("files", []):
        lines.append(f"  - {f.get('change_type')} `{f['path']}`; location `{f.get('symbol', f.get('section', '<unknown>'))}`; lines `{f.get('line_range', 'n/a')}`; reason: {f.get('reason', '<unknown>')}")
        lines.append(f"    - SHA256: before `{f.get('before_sha256')}`; after `{f.get('after_sha256')}`")
        if f.get("code_excerpt"):
            lines.extend(("    ```text", f["code_excerpt"], "    ```"))
    lines.append("- Tests (actual outcomes only):")
    for t in data.get("tests", []):
        lines.append(f"  - `{t.get('command')}` : `{t.get('result')}` (exit `{t.get('exit_code')}`); evidence: {t.get('evidence')}")
    lines.append("- Risks: " + "; ".join(map(str, data.get("risks", []))))
    lines.append("- Next task: " + str(data.get("next_task", "unknown")))
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("entry", help="docs/changes/entries/<name>.json")
    args = parser.parse_args()
    root = root_path()
    entry_path = (root / args.entry).resolve()
    entries_root = (root / "docs/changes/entries").resolve()
    if entries_root not in entry_path.parents or entry_path.suffix != ".json":
        raise SystemExit("Entry must be inside docs/changes/entries/*.json")
    rel = entry_path.relative_to(root).as_posix()
    if rel not in changed_files(root):
        raise SystemExit("Refusing to rewrite historical committed entry: only an entry changed in this working tree can be synced")
    data = json.loads(entry_path.read_text(encoding="utf-8"))
    path = root / "docs/changes/CHANGELOG.md"
    existing = path.read_text(encoding="utf-8")
    header = re.compile(r"^#{2,4}[^\n]*\|\s*" + re.escape(data["batch_id"]) + r"\s*(?:\||$)", re.MULTILINE)
    found = header.search(existing)
    block = to_markdown(data)
    if found:
        rest = existing[found.end():]
        next_heading = re.search(r"^#{2,4}\s+", rest, re.MULTILINE)
        end = found.end() + (next_heading.start() if next_heading else len(rest))
        updated = existing[:found.start()] + block + existing[end:]
    else:
        updated = existing.rstrip() + "\n\n" + block
    path.write_text(updated, encoding="utf-8")
    print(f"Updated current Markdown batch {data['batch_id']} from truthful JSON entry")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
