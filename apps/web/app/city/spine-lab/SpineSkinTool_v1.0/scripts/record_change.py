#!/usr/bin/env python3
"""Create a timestamped *draft* change record from real uncommitted Git paths.

A draft has NOT_RUN tests and a PARTIAL state. Codex MUST fill and verify it.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
from pathlib import Path

from verify_changes import changed_files, is_metadata, root_path, has_head, repository_path, snapshot_changes, snapshot_baseline


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def before_hash(root: Path, path: str) -> str | None:
    if not has_head(root):
        return None
    result = subprocess.run(["git", "show", f"HEAD:{repository_path(root, path)}"], cwd=root, capture_output=True)
    return hash_bytes(result.stdout) if result.returncode == 0 else None


def first_code_location(root: Path, relative: str) -> tuple[str, str, str]:
    path = root / relative
    if not path.is_file():
        return "DELETED", "n/a", ""
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    change = subprocess.run(["git", "diff", "--unified=0", "HEAD", "--", relative], cwd=root, capture_output=True, text=True)
    if change.returncode == 0:
        h = re.search(r"^@@ .*?\+(\d+)(?:,(\d+))? @@", change.stdout, flags=re.MULTILINE)
        if h:
            line = int(h.group(1))
            if 1 <= line <= len(lines):
                return "TODO_CORRECT_SYMBOL", f"{line}-{line}", lines[line-1]
    for idx, line in enumerate(lines, 1):
        if line.strip() and not line.strip().startswith("#"):
            return "TODO_CORRECT_SYMBOL", f"{idx}-{idx}", line
    return "TODO_CORRECT_SYMBOL", "1-1", lines[0] if lines else ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--batch-id")
    parser.add_argument("--since-entry")
    args = parser.parse_args()
    root = root_path()
    changes = snapshot_changes(root,args.since_entry) if args.since_entry else changed_files(root)
    baseline_hashes = snapshot_baseline(root,args.since_entry) if args.since_entry else {}
    statuses = {k: v for k, v in changes.items() if not is_metadata(k)}
    if not statuses:
        print("No unrecorded Git file changes detected; no new draft created.")
        return 0
    local = dt.datetime.now().astimezone()
    utc = local.astimezone(dt.timezone.utc)
    prefix = utc.strftime("%Y%m%dT%H%M%SZ")
    batch = args.batch_id or f"{prefix}-{args.task_id}"
    slug = re.sub(r"[^a-zA-Z0-9_-]", "-", args.task_id)
    filename = f"{prefix}-{slug}.json"
    folder = root / "docs/changes/entries"
    folder.mkdir(parents=True, exist_ok=True)
    target_entry = folder / filename
    if target_entry.exists():
        raise FileExistsError(f"Entry already exists: {target_entry}")
    files = []
    for path, git_status in sorted(statuses.items()):
        absolute = root / path
        exists = absolute.is_file()
        kind = "DELETE" if git_status == "D" or not exists else "ADD" if git_status == "A" else "MODIFY"
        item = {
            "path": path,
            "change_type": kind,
            "reason": "TODO: explain this specific modification",
            "before_sha256": baseline_hashes.get(path) if args.since_entry else before_hash(root, path),
            "after_sha256": hash_bytes(absolute.read_bytes()) if exists else None,
        }
        if absolute.suffix.lower() in {".py", ".ts", ".tsx", ".js", ".jsx", ".sh", ".ps1", ".json", ".yaml", ".yml", ".toml", ".css", ".html"} and exists:
            symbol, line_range, snippet = first_code_location(root, path)
            item.update(symbol=symbol, line_range=line_range, code_excerpt=snippet)
        else:
            item["section"] = "TODO: locate changed document heading or asset identifier"
        files.append(item)
    entry = {
        "schema_version": "1.0.0",
        "batch_id": batch,
        "task_id": args.task_id,
        "timestamp_local": local.isoformat(timespec="seconds"),
        "timestamp_utc": utc.isoformat(timespec="seconds"),
        "status": "PARTIAL",
        "goal": "TODO: state the objective and actual behavior",
        "files": files,
        "tests": [{"command": "TODO: record actual test command", "exit_code": None, "result": "NOT_RUN", "evidence": "Not run yet; run appropriate tests and update this entry"}],
        "risks": ["TODO: describe risk or explicitly say 'none known' after review"],
        "next_task": "TODO: identify exact next task",
    }
    if args.since_entry:entry['comparison_baseline']=args.since_entry
    target_entry.write_text(json.dumps(entry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    changelog = root / "docs/changes/CHANGELOG.md"
    with changelog.open("a", encoding="utf-8") as file:
        file.write(f"\n### {local.isoformat(timespec='seconds')} | {args.task_id} | {batch} | PARTIAL\n")
        file.write(f"- UTC: {utc.isoformat(timespec='seconds')}\n- Goal: TODO\n")
        for item in files:
            file.write(f"- {item['change_type']} `{item['path']}` — TODO: code symbol/lines and actual changed excerpt, or document/asset hash\n")
        file.write("- Tests: NOT_RUN — run and record actual commands/results before marking COMPLETE\n- Risks/next: TODO\n")
    print(f"DRAFT created: {target_entry.relative_to(root)}")
    print("IMPORTANT: replace ALL TODOs, run real tests, update Markdown and JSON, then run verify_changes.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
