"""Prepare one isolated Spine tool task. This command never invokes an AI model.

Inputs are operator-controlled roots, an opaque local task ID and the recorded photo digest.
The participant photo, generated work and task receipt remain in the task's private directory.
"""
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

TASK = re.compile(r"spine-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")


def regular(path):
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
        raise ValueError("LINK_NOT_ALLOWED")
    return path


def main():
    expected = sys.stdin.read(65).strip()
    if len(sys.argv) != 4 or not TASK.fullmatch(sys.argv[3]) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        print(json.dumps({"status": "INVALID"}))
        return 1
    tool = regular(Path(sys.argv[1])).resolve(strict=True)
    root = regular(Path(sys.argv[2])).resolve(strict=True)
    task = sys.argv[3]
    directory = regular(root / task).resolve(strict=True)
    if directory.parent != root or not directory.is_dir():
        print(json.dumps({"status": "INVALID"}))
        return 1
    sys.path.insert(0, str(tool / "src"))
    try:
        from spine_skin_tool.photo_import import import_photo
        from spine_skin_tool.pipeline import create
        from spine_skin_tool.reference_assets import verify_bundled

        photo = regular(directory / "photo.png")
        if not photo.is_file() or photo.stat().st_size > 24 * 1024 * 1024:
            raise ValueError("PHOTO_INVALID")
        data = photo.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("PHOTO_CHANGED")
        source = verify_bundled(tool)
        workspace = directory / "tool-workspace"
        workspace.mkdir(mode=0o700)  # Existing or incomplete work is never overwritten.
        refs = workspace / "references" / "spine"
        refs.mkdir(parents=True)
        for name in ["ASSET_MANIFEST.json", "REFERENCE_ONLY.md", *source["files"]]:
            relative = Path(name)
            if relative.is_absolute() or ".." in relative.parts or "\\" in name:
                raise ValueError("REFERENCE_PATH")
            src = regular(tool / "references" / "spine" / relative)
            target = refs / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, target)
        verify_bundled(workspace)
        imported = import_photo(workspace, data)
        if imported["original_sha256"] != expected:
            raise ValueError("PHOTO_CHANGED")
        state = create(workspace, {"mode": "GENERATE", "photo": imported["photo"], "character_id": task})
        receipt = {"schema": 1, "task": task, "flow": state["id"], "photo_sha256": expected, "tool_photo_sha256": imported["photo_sha256"], "model_calls": 0}
        path = workspace / "integration-receipt.json"
        with path.open("x", encoding="utf-8") as stream:
            json.dump(receipt, stream, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        print(json.dumps({"status": "PREPARED", "flow": state["id"], "model_calls": 0}))
        return 0
    except (OSError, ValueError, KeyError, TypeError, ImportError):
        print(json.dumps({"status": "NOT_PREPARED"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
