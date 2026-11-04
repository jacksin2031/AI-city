#!/usr/bin/env python3
"""Verify that every non-metadata Git change is mapped to a fresh timestamped log entry.

Stdlib only. Intentionally NOT a replacement for tests or code review.
Initial import requires a log covering the newly added repository files.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ENTRY_DIR = Path("docs/changes/entries")
CHANGELOG = Path("docs/changes/CHANGELOG.md")
META_PREFIX = "docs/changes/entries/"
CODE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".sh", ".ps1", ".toml", ".yaml", ".yml", ".json", ".css", ".html"}
VALID_STATES = {"COMPLETE", "PARTIAL", "BLOCKED", "FAILED"}
VALID_CHANGE_TYPES = {"ADD", "MODIFY", "DELETE", "RENAME", "DEPENDENCY", "DOC", "TEST", "FIX"}


def git(root: Path, *args: str, check: bool = True) -> bytes:
    result = subprocess.run(["git", *args], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.decode(errors='replace')}")
    return result.stdout


def root_path() -> Path:
    # Anchor to this tool, whether standalone or nested, independent of caller cwd.
    root = Path(__file__).resolve().parents[1]
    git(root, "rev-parse", "--show-toplevel")
    return root


def git_context(root: Path) -> tuple[Path, str]:
    repository = Path(git(root, "rev-parse", "--show-toplevel").decode("utf-8").strip()).resolve()
    relative = root.resolve().relative_to(repository).as_posix()
    return repository, "" if relative == "." else relative + "/"


def repository_path(root: Path, path: str) -> str:
    return git_context(root)[1] + path


def has_head(root: Path) -> bool:
    return subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def paths_in_status(raw: bytes) -> dict[str, str]:
    items = raw.decode("utf-8", errors="replace").split("\0")
    result: dict[str, str] = {}
    # --no-renames: status, path, status, path ...
    for i in range(0, len(items) - 1, 2):
        if not items[i] or not items[i + 1]:
            continue
        result[items[i + 1].replace("\\", "/")] = items[i].split()[0]
    return result


def changed_files(root: Path, base: str | None = None) -> dict[str, str]:
    repository, prefix = git_context(root)
    scope = prefix.rstrip("/") or "."
    changes: dict[str, str] = {}
    if base is not None:
        # For CI: inspect the committed PR range, not the (clean) checkout.
        # A three-dot range compares against the merge-base with the target branch.
        changes.update(paths_in_status(git(repository, "diff", "--name-status", "--no-renames", "-z", f"{base}...HEAD", "--", scope)))
    elif has_head(root):
        changes.update(paths_in_status(git(repository, "diff", "--name-status", "--no-renames", "-z", "HEAD", "--", scope)))
    else:
        changes.update(paths_in_status(git(repository, "diff", "--name-status", "--no-renames", "-z", "--cached", "--", scope)))
        changes.update(paths_in_status(git(repository, "diff", "--name-status", "--no-renames", "-z", "--", scope)))
    if base is None:
        for path in git(repository, "ls-files", "--others", "--exclude-standard", "-z", "--", scope).decode("utf-8", errors="replace").split("\0"):
            if path:
                changes[path.replace("\\", "/")] = "A"
    return {path[len(prefix):]: status for path, status in changes.items() if path.startswith(prefix)}


def is_metadata(path: str) -> bool:
    return path == CHANGELOG.as_posix() or (path.startswith(META_PREFIX) and path.endswith(".json"))


def snapshot_baseline(root: Path, entry: str, seen=None) -> dict[str,str]:
    seen=set() if seen is None else seen
    path=(root/entry).resolve()
    if not path.is_relative_to((root/ENTRY_DIR).resolve()) or path in seen:
        raise ValueError('Invalid or cyclic snapshot chain')
    seen.add(path)
    record=json.loads(path.read_text(encoding='utf-8'))
    result=snapshot_baseline(root,record['comparison_baseline'],seen) if record.get('comparison_baseline') else {}
    for item in record['files']:
        if item.get('change_type')=='DELETE':result.pop(item['path'],None)
        else:result[item['path']]=item['after_sha256']
    return result


def snapshot_changes(root: Path, entry: str) -> dict[str, str]:
    """Compare to an immutable previous task manifest when commits are not authorized."""
    previous = (root / entry).resolve()
    if not previous.is_relative_to((root / ENTRY_DIR).resolve()):
        raise ValueError("Snapshot must be a change entry")
    baseline = snapshot_baseline(root,entry)
    current = changed_files(root)
    result = {}
    for name in set(baseline) | set(current):
        if is_metadata(name): continue
        target = (root / name).resolve()
        if not target.is_relative_to(root): raise ValueError('Unsafe snapshot path')
        if not target.is_file():
            if name in baseline: result[name]='D'
        elif name not in baseline: result[name]='A'
        elif sha256(target) != baseline[name]: result[name]='M'
    result[CHANGELOG.as_posix()]='M'
    result.update({n:s for n,s in current.items() if n.startswith(META_PREFIX) and n.endswith('.json') and (root/n).name>previous.name})
    return result


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_time(entry: dict, filename: str, errors: list[str]) -> None:
    try:
        local = dt.datetime.fromisoformat(entry["timestamp_local"].replace("Z", "+00:00"))
        utc = dt.datetime.fromisoformat(entry["timestamp_utc"].replace("Z", "+00:00"))
        if local.utcoffset() is None or utc.utcoffset() is None:
            raise ValueError("timezone offset required")
        if utc.utcoffset() != dt.timedelta(0) or abs((local - utc).total_seconds()) > 1:
            raise ValueError("local timestamp does not match UTC")
        if not filename.startswith(utc.strftime("%Y%m%dT%H%M%SZ-")):
            raise ValueError("entry filename must begin with UTC timestamp YYYYMMDDTHHMMSSZ-")
    except (KeyError, TypeError, ValueError) as exc:
        errors.append(f"Invalid timestamp {filename}: {exc}")


def changed_line_ranges(root: Path, file: str, status: str, base: str | None) -> list[tuple[int, int]]:
    if status == "A":
        return [(1, 10**9)]
    diff_range = f"{base}...HEAD" if base else ("HEAD" if has_head(root) else "--cached")
    cmd = ["diff", "--unified=0", diff_range, "--", file]
    raw = git(root, *cmd, check=False).decode("utf-8", errors="replace")
    ranges = []
    for match in re.finditer(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", raw, flags=re.MULTILINE):
        start = int(match.group(1))
        count = int(match.group(2) or 1)
        if count:
            ranges.append((start, start + count - 1))
    return ranges


def check_entry(root: Path, path: Path, actual_changes: dict[str, str], errors: list[str], markdown: str, base: str | None) -> set[str]:
    result: set[str] = set()
    try:
        entry = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"Unreadable entry {path}: {exc}")
        return result
    for key in ("batch_id", "task_id", "goal", "status", "timestamp_local", "timestamp_utc", "files", "tests", "risks", "next_task"):
        if not entry.get(key) and entry.get(key) not in (0, []):
            errors.append(f"{path.name}: missing {key}")
    if entry.get("status") not in VALID_STATES:
        errors.append(f"{path.name}: invalid status")
    validate_time(entry, path.name, errors)
    batch_id = entry.get("batch_id", "")
    header_match = re.search(r"^#{2,4}[^\n]*\|\s*" + re.escape(batch_id) + r"\s*(?:\||$)", markdown, flags=re.MULTILINE) if batch_id else None
    if not header_match:
        errors.append(f"{path.name}: specific batch heading absent from CHANGELOG.md")
        current_section = ""
    else:
        remainder = markdown[header_match.end():]
        next_heading = re.search(r"^#{2,4}\s+", remainder, flags=re.MULTILINE)
        current_section = markdown[header_match.start():header_match.end() + (next_heading.start() if next_heading else len(remainder))]
    if not isinstance(entry.get("tests"), list) or not entry.get("tests"):
        errors.append(f"{path.name}: tests must contain results or a justified NOT_RUN")
    else:
        any_pass = False
        for t in entry["tests"]:
            if not isinstance(t, dict) or not t.get("command") or t.get("result") not in {"PASS", "FAIL", "NOT_RUN"} or not t.get("evidence"):
                errors.append(f"{path.name}: invalid test record: {t}")
                continue
            if t["result"] == "PASS":
                any_pass = True
                if t.get("exit_code") != 0:
                    errors.append(f"{path.name}: PASS test exit_code must equal 0")
            elif t["result"] == "FAIL" and (not isinstance(t.get("exit_code"), int) or t["exit_code"] == 0):
                errors.append(f"{path.name}: FAIL test must have nonzero integer exit_code")
            elif t["result"] == "NOT_RUN" and t.get("exit_code") is not None:
                errors.append(f"{path.name}: NOT_RUN test exit_code must be null")
        if entry.get("status") == "COMPLETE" and not any_pass:
            errors.append(f"{path.name}: COMPLETE requires at least one real PASS test record")
    files = entry.get("files")
    if not isinstance(files, list) or not files:
        errors.append(f"{path.name}: files list must be nonempty")
        return result
    for item in files:
        if not isinstance(item, dict):
            errors.append(f"{path.name}: invalid file record")
            continue
        file = item.get("path", "")
        if (not file or Path(file).is_absolute() or ":" in file or ".." in Path(file).parts or "\\" in file or is_metadata(file)):
            errors.append(f"{path.name}: invalid or metadata path: {file}")
            continue
        if file in result:
            errors.append(f"{path.name}: duplicate path {file}")
        result.add(file)
        if file not in actual_changes:
            errors.append(f"{path.name}: recorded path is not changed: {file}")
        if file not in current_section:
            errors.append(f"{path.name}: file path missing from matching Markdown batch section: {file}")
        if item.get("change_type") not in VALID_CHANGE_TYPES:
            errors.append(f"{path.name}: invalid change_type: {file}")
        if not item.get("reason") or item.get("reason") in ("TODO", "FILL_ME"):
            errors.append(f"{path.name}: missing real change reason: {file}")
        target = root / file
        if not target.resolve().is_relative_to(root.resolve()):
            errors.append(f"{path.name}: path escapes tool root: {file}")
            continue
        if actual_changes.get(file) == "D" or item.get("change_type") == "DELETE":
            if item.get("change_type") != "DELETE" or not item.get("before_sha256"):
                errors.append(f"{path.name}: deletion must have previous hash: {file}")
            continue
        if not target.is_file():
            errors.append(f"{path.name}: referenced path does not exist as a file: {file}")
            continue
        if item.get("after_sha256") != sha256(target):
            errors.append(f"{path.name}: after_sha256 mismatch: {file}")
        if target.suffix.lower() in CODE_SUFFIXES and not file.endswith(".lock"):
            for key in ("symbol", "line_range", "code_excerpt"):
                if not item.get(key) or str(item.get(key)).startswith("TODO"):
                    errors.append(f"{path.name}: {file} missing {key}")
            snippet = item.get("code_excerpt", "")
            source_text = target.read_text(encoding="utf-8", errors="replace")
            if snippet and snippet not in current_section:
                errors.append(f"{path.name}: actual code excerpt absent from Markdown batch section: {file}")
            if snippet and snippet not in source_text:
                errors.append(f"{path.name}: actual code excerpt not found in {file}")
            match = re.fullmatch(r"(\d+)(?:-(\d+))?", str(item.get("line_range", "")))
            if not match:
                errors.append(f"{path.name}: invalid line_range for {file}")
            else:
                start = int(match.group(1))
                end = int(match.group(2) or match.group(1))
                lines = source_text.splitlines()
                if start < 1 or end < start or end > len(lines):
                    errors.append(f"{path.name}: out-of-range lines for {file}")
                elif snippet and snippet not in "\n".join(lines[start - 1:end]):
                    errors.append(f"{path.name}: code excerpt not at declared line_range in {file}")
                change_ranges = changed_line_ranges(root, file, actual_changes.get(file, ""), base)
                if actual_changes.get(file) not in {"A", "D"} and change_ranges and not any(start <= high and end >= low for low, high in change_ranges):
                    errors.append(f"{path.name}: declared line_range does not intersect an actual diff hunk in {file}")
        else:
            if not item.get("section") and not item.get("symbol"):
                errors.append(f"{path.name}: document/binary file needs section/resource key: {file}")
    return result


def main() -> int:
    try:
        parser = argparse.ArgumentParser(description="Verify mandatory per-edit changelog coverage")
        parser.add_argument("--base", help="Compare commits in BASE...HEAD, for CI/PR validation")
        parser.add_argument("--since-entry", help="Compare against the previous immutable task entry")
        args = parser.parse_args()
        root = root_path()
        if args.base and args.since_entry: raise ValueError('Choose base or since-entry')
        changes = snapshot_changes(root,args.since_entry) if args.since_entry else changed_files(root, args.base)
        relevant = {p: s for p, s in changes.items() if not is_metadata(p)}
        if not changes:
            print("No working-tree changes; changelog gate does not need a new entry.")
            return 0
        errors: list[str] = []
        if not (root / CHANGELOG).exists():
            errors.append("Missing docs/changes/CHANGELOG.md")
            markdown = ""
        else:
            markdown = (root / CHANGELOG).read_text(encoding="utf-8")
        changed_entries = [root / n for n in changes if n.startswith(META_PREFIX) and n.endswith(".json") and not n.endswith(".example.json")]
        if relevant and not changed_entries:
            errors.append("Changed files lack newly changed docs/changes/entries/*.json; create a current entry")
        if relevant and CHANGELOG.as_posix() not in changes:
            errors.append("CHANGELOG.md itself must be modified this batch")
        seen: set[str] = set()
        for path in changed_entries:
            sub = check_entry(root, path, relevant, errors, markdown, args.base)
            if seen.intersection(sub):
                errors.append(f"Duplicate changed paths across entries: {sorted(seen.intersection(sub))}")
            seen.update(sub)
        unrecorded = set(relevant) - seen
        if unrecorded:
            errors.append(f"Unrecorded files: {sorted(unrecorded)}")
        overrecorded = seen - set(relevant)
        if overrecorded:
            errors.append(f"Files claimed in entries but not changed: {sorted(overrecorded)}")
        if errors:
            for problem in errors:
                print("ERROR:", problem, file=sys.stderr)
            print(f"FAIL: {len(errors)} changelog gate violation(s)", file=sys.stderr)
            return 1
        print(f"PASS: {len(relevant)} changed file(s), {len(changed_entries)} current entry/entries covered")
        return 0
    except (RuntimeError, OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
