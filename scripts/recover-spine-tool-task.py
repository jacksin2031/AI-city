"""Verify an already-created preflight flow without resending or modifying it."""
import hashlib
import json
import re
import sys
from pathlib import Path


def main():
    expected = sys.stdin.read(65).strip()
    if len(sys.argv) != 4 or not re.fullmatch(r"spine-[0-9a-f-]{36}", sys.argv[3]) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        print(json.dumps({"status": "INVALID"}))
        return 1
    tool = Path(sys.argv[1]).resolve(strict=True)
    workspace = Path(sys.argv[2]).resolve(strict=True)
    task = sys.argv[3]
    sys.path.insert(0, str(tool / "src"))
    try:
        from spine_skin_tool.pipeline import context
        from spine_skin_tool.pipeline_store import lease, read

        receipt_path = workspace / "integration-receipt.json"
        if receipt_path.is_symlink() or not receipt_path.is_file() or receipt_path.stat().st_size > 4096:
            raise ValueError("RECEIPT_MISSING")
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        flow = receipt["flow"]
        photo = workspace.parent / "photo.png"
        if photo.is_symlink() or not photo.is_file() or photo.stat().st_size > 24 * 1024 * 1024 or hashlib.sha256(photo.read_bytes()).hexdigest() != expected:
            raise ValueError("PHOTO_CHANGED")
        if receipt["task"] != task or receipt["photo_sha256"] != expected or receipt["model_calls"] != 0 or not re.fullmatch(r"flow-[a-f0-9]{32}", flow):
            raise ValueError("RECEIPT_MISMATCH")
        with lease(workspace, flow):
            state = read(workspace, flow)
            context(workspace, state)
            if state["status"] != "PLANNED" or state["phase"] != "DESIGN" or state["analysis_reserved"] or state["initial_image_calls_reserved"] or state["initial_visual_calls_reserved"]:
                raise ValueError("FLOW_ALREADY_STARTED")
            if any(state["limits"][name] for name in ("live_design", "live_generation", "live_review")):
                raise ValueError("LIVE_FLOW_NOT_RECOVERABLE")
        print(json.dumps({"status": "PREPARED", "flow": flow, "model_calls": 0}))
        return 0
    except (OSError, ValueError, KeyError, TypeError, ImportError):
        print(json.dumps({"status": "UNVERIFIED"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
