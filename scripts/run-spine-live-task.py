"""Run one prepared Spine tool task live inside its isolated workspace.

This command CALLS EXTERNAL MODELS through the tool's own Codex transport. It exists only for an
explicitly started worker that the operator authorised. Every task gets its own call budget
(--cap), settings are written only inside the task workspace, and an unknown model result is never
re-sent. The participant photo and generated files stay in the task's private directory.
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

TASK = re.compile(r"spine-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")


def regular(path):
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
        raise ValueError("LINK_NOT_ALLOWED")
    return path


def write_settings(workspace, cap):
    secrets = workspace / "runtime" / "secrets"
    secrets.mkdir(parents=True, exist_ok=True)
    live = {"live_enabled": True, "upload_consent": True, "max_live_calls": cap, "timeout_seconds": 600}
    providers = {
        "schema_version": "2.0.0",
        "live_enabled": True,
        "upload_consent": True,
        "billing_source": "UNVERIFIED",
        "max_live_calls": cap,
        "codex": {"executable": "codex", "timeout_seconds": 600},
        "grok": {"model": "grok-imagine-image-2.0", "key_env": "XAI_API_KEY", "api_key": ""},
        "comfyui": {"url": "http://127.0.0.1:8188", "workflow": "runtime/secrets/comfy-workflow.json", "prompt_node": "", "prompt_input": "text", "image_bindings": [], "output_node": "", "poll_seconds": 1, "max_polls": 120},
    }
    for name, value in (("providers.json", providers), ("design.json", live), ("review.json", live)):
        target = secrets / name
        if not target.exists():  # never widen an existing budget on resume
            with target.open("x", encoding="utf-8") as stream:
                json.dump(value, stream)


def main():
    expected = sys.stdin.read(65).strip()
    if len(sys.argv) != 5 or not TASK.fullmatch(sys.argv[3]) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        print(json.dumps({"status": "INVALID"}))
        return 1
    cap = int(sys.argv[4])
    if not 4 <= cap <= 20:
        print(json.dumps({"status": "INVALID"}))
        return 1
    tool = regular(Path(sys.argv[1])).resolve(strict=True)
    root = regular(Path(sys.argv[2])).resolve(strict=True)
    task = sys.argv[3]
    directory = regular(root / task).resolve(strict=True)
    workspace = regular(directory / "tool-workspace").resolve(strict=True)
    if directory.parent != root or workspace.parent != directory:
        print(json.dumps({"status": "INVALID"}))
        return 1
    if not Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe").exists() and not (
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe"
    ).exists():
        os.environ.setdefault("AI_CITY_SPINE_BROWSER", "chrome")
    # The tool's renderer only accepts private work paths under this base.
    os.environ["AI_CITY_SPINE_WORK_BASE"] = str(workspace)
    sys.path.insert(0, str(tool / "src"))
    try:
        from spine_skin_tool.photo_import import import_photo
        from spine_skin_tool.pipeline import advance, create
        from spine_skin_tool.pipeline_store import read
        from spine_skin_tool.review import read_review

        photo = regular(directory / "photo.png")
        data = photo.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("PHOTO_CHANGED")
        receipt = json.loads((workspace / "integration-receipt.json").read_text(encoding="utf-8"))
        if receipt["task"] != task or receipt["photo_sha256"] != expected:
            raise ValueError("RECEIPT_MISMATCH")
        write_settings(workspace, cap)
        live_path = workspace / "live-receipt.json"
        if live_path.exists():
            flow = json.loads(live_path.read_text(encoding="utf-8"))["flow"]
        else:
            imported = import_photo(workspace, data)
            # A small cap keeps one design call, the six part images and a single review, no repairs.
            small = cap <= 8
            limits = {"max_image_calls": min(14, cap - 2 if small else cap - 4), "max_visual_calls": 1 if small else 3, "max_repair_cycles": 0 if small else 1, "live_design": True, "live_generation": True, "live_review": True, "pause_design": False}
            flow = create(workspace, {"mode": "GENERATE", "photo": imported["photo"], "character_id": task, "limits": limits})["id"]
            with live_path.open("x", encoding="utf-8") as stream:
                json.dump({"task": task, "flow": flow}, stream)
        state = read(workspace, flow)
        for _ in range(4):
            state = advance(workspace, flow)
            # A failed LOCAL capture may be retried; any later unknown model result is never re-sent.
            if not (state["status"] == "ERROR_OR_RESULT_UNKNOWN" and state["phase"] == "CAPTURE"):
                break
        result = {"status": state["status"], "phase": state["phase"], "flow": flow, "bundle": None, "auto_publish": False,
                  "image_calls": state["initial_image_calls_reserved"], "visual_calls": state["initial_visual_calls_reserved"], "analysis_calls": state["analysis_calls_reserved"], "error_code": state.get("error_code")}
        output = state.get("best_output")
        if output:
            review = read_review(workspace, state["review_id"])
            hard = review["hard"]["status"]
            render = review["render"]["status"]
            visual_fail = any(str(item.get("result", item.get("status"))).upper() == "FAIL" for item in review.get("visual_reviews", []) if isinstance(item, dict))
            bundle = (workspace / output / "export" / "bundle").resolve(strict=True)
            if workspace not in bundle.parents:
                raise ValueError("BUNDLE_PATH")
            defects = sorted({str(d.get("code")) for d in review["hard"].get("defects", []) if isinstance(d, dict) and d.get("result") == "FAIL"})[:8]
            result.update(bundle=bundle.relative_to(directory).as_posix(), render=render, hard=hard, hard_fail_codes=defects, visual_fail=visual_fail,
                          auto_publish=render == "PASS" and hard != "FAIL" and not visual_fail)
        print(json.dumps(result))
        return 0
    except (OSError, ValueError, KeyError, TypeError, ImportError) as error:
        print(json.dumps({"status": "FAILED", "code": getattr(error, "code", type(error).__name__)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
