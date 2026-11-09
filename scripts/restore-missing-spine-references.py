"""Opt-in, Preview-only restoration of MISSING Git-tracked Spine reference assets.

Does not delete, rename, overwrite or rewrite ANY existing file. Never touches model
state, photos, credentials, the Production Worker or the shared node_modules tree.
Source bytes are from the CURRENT Preview branch Git objects and are independently
verified against the pinned repository manifest before exclusive creation.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
REL = "apps/web/app/city/spine-lab/SpineSkinTool_v1.0/references/spine"
ROOT = REPO / REL
MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024


class SafeFailure(Exception):
    pass


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str) -> bytes:
    proc = subprocess.run(
        ["git", "-C", str(REPO), *args], capture_output=True, timeout=30, check=False,
    )
    if proc.returncode != 0:
        raise SafeFailure("GIT_SOURCE_UNAVAILABLE")
    return proc.stdout


def blob(relative: str) -> bytes:
    data = git("show", "HEAD:" + REL + "/" + relative)
    if not data or len(data) > MAX_FILE:
        raise SafeFailure("GIT_SOURCE_INVALID")
    return data


def no_links(path: Path) -> None:
    current = path
    while current != REPO.parent:
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise SafeFailure("REFERENCE_LINK_REJECTED")
        if current == REPO:
            break
        current = current.parent
    if current != REPO:
        raise SafeFailure("REFERENCE_OUTSIDE_REPO")


def safe_name(name: str) -> None:
    if not isinstance(name, str) or "\\" in name or name.startswith("/") or ":" in name:
        raise SafeFailure("REFERENCE_MANIFEST_INVALID")
    path = Path(name)
    if path.is_absolute() or ".." in path.parts or path.parts[0] not in (
        "Chibi-Stickers-4.3", "ai-city-spineboy-skin-v13",
    ):
        raise SafeFailure("REFERENCE_MANIFEST_INVALID")


def prepare() -> list[tuple[Path, bytes]]:
    branch = git("symbolic-ref", "--quiet", "--short", "HEAD").decode("utf-8").strip()
    if branch != "fix/spine-next-round-20261107":
        raise SafeFailure("NOT_PREVIEW_REPAIR_BRANCH")
    if git("rev-parse", "--show-toplevel").decode("utf-8").strip().replace("\\", "/").casefold() != str(REPO).replace("\\", "/").casefold():
        raise SafeFailure("GIT_ROOT_MISMATCH")
    no_links(ROOT)
    manifest_bytes = blob("ASSET_MANIFEST.json")
    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
        entries = manifest["files"]
        if manifest["reference_only"] is not True or manifest["commercial_use_allowed"] is not False:
            raise SafeFailure("REFERENCE_POLICY_INVALID")
        if not isinstance(entries, dict) or len(entries) < 100 or len(entries) > 400:
            raise SafeFailure("REFERENCE_MANIFEST_INVALID")
    except (ValueError, KeyError, TypeError, UnicodeError) as error:
        raise SafeFailure("REFERENCE_MANIFEST_INVALID") from error
    all_names = ["ASSET_MANIFEST.json", "REFERENCE_ONLY.md", *entries]
    planned: list[tuple[Path, bytes]] = []
    total = 0
    for name in all_names:
        if name not in ("ASSET_MANIFEST.json", "REFERENCE_ONLY.md"):
            safe_name(name)
        target = ROOT / name
        no_links(target)
        if target.exists():
            if not target.is_file():
                raise SafeFailure("REFERENCE_EXISTING_NOT_FILE")
            actual = target.read_bytes()
            expected_sha = entries[name]["sha256"] if name in entries else sha(
                manifest_bytes if name == "ASSET_MANIFEST.json" else blob("REFERENCE_ONLY.md")
            )
            if sha(actual) != expected_sha:
                raise SafeFailure("REFERENCE_EXISTING_MISMATCH")
            continue
        content = manifest_bytes if name == "ASSET_MANIFEST.json" else blob(name)
        if name in entries and sha(content) != entries[name].get("sha256"):
            raise SafeFailure("GIT_BLOB_SHA_MISMATCH")
        if name in entries and len(content) != entries[name].get("bytes"):
            raise SafeFailure("GIT_BLOB_LENGTH_MISMATCH")
        total += len(content)
        if total > MAX_TOTAL:
            raise SafeFailure("RESTORE_SIZE_EXCEEDED")
        planned.append((target, content))
    return planned


def main() -> int:
    if (sys.argv[1:] != ["--restore-missing"] or
            os.environ.get("AI_CITY_VISITOR_NAMESPACE") != "preview-staging-20261107"):
        print(json.dumps({"status": "BLOCKED", "code": "PREVIEW_ONLY_CONFIRMATION_REQUIRED"}))
        return 2
    try:
        pending = prepare()
        for target, data in pending:
            no_links(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            no_links(target.parent)
            # 'xb': atomic exclusive create, never overwrite an existing asset.
            with target.open("xb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
        # Re-check every manifest hash using the same tool code as the Worker.
        tool = ROOT.parent.parent
        sys.path.insert(0, str(tool / "src"))
        from spine_skin_tool.reference_assets import verify_bundled
        verify_bundled(tool)
    except SafeFailure as error:
        print(json.dumps({"status": "BLOCKED", "code": str(error)}))
        return 1
    except Exception:
        print(json.dumps({"status": "BLOCKED", "code": "RESTORE_VERIFY_FAILED"}))
        return 1
    print(json.dumps({"status": "READY", "restored_files": len(pending), "model_calls": 0}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
