"""Read-only Spine reference integrity preflight; safe to run on a Preview Worker VM.

No photo, model or credential is read. The output contains only static reason codes
and aggregate counts, never file paths, image bytes or private workspace contents.
"""
import json
import sys
from pathlib import Path

REFERENCE_REASONS = frozenset({
    "REFERENCE_MANIFEST_MISSING",
    "REFERENCE_MANIFEST_INVALID",
    "REFERENCE_LICENSE_MISSING",
    "REFERENCE_MANIFEST_PATH",
    "REFERENCE_FILE_MISSING",
    "REFERENCE_LINK",
    "REFERENCE_ASSET_CHANGED",
})


def check(tool: Path) -> dict:
    result = {"status": "BROKEN", "code": "REFERENCE_RUNTIME_ERROR", "expected_files": 0,
              "missing_files": 0, "sha_mismatches": 0, "links": 0}
    if not tool.is_dir():
        result["code"] = "TOOL_ROOT_MISSING"
        return result
    library = tool / "references" / "spine"
    manifest_path = library / "ASSET_MANIFEST.json"
    if not manifest_path.is_file():
        result["code"] = "REFERENCE_MANIFEST_MISSING"
        return result
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        files = manifest.get("files", {})
        if not isinstance(files, dict):
            result["code"] = "REFERENCE_MANIFEST_INVALID"
            return result
        result["expected_files"] = len(files)
        # Count only manifest-listed assets; never reveal individual filenames.
        for name, item in files.items():
            if not isinstance(name, str) or not isinstance(item, dict):
                result["code"] = "REFERENCE_MANIFEST_INVALID"
                return result
            relative = Path(name)
            if relative.is_absolute() or ".." in relative.parts or "\\" in name:
                result["code"] = "REFERENCE_MANIFEST_PATH"
                return result
            target = library / relative
            if any(part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction())
                   for part in (target, *target.parents) if part == library or part.is_relative_to(library)):
                result["links"] += 1
            if not target.is_file():
                result["missing_files"] += 1
                continue
            import hashlib
            if hashlib.sha256(target.read_bytes()).hexdigest() != item.get("sha256"):
                result["sha_mismatches"] += 1
    except (OSError, ValueError, UnicodeError, TypeError):
        result["code"] = "REFERENCE_MANIFEST_INVALID"
        return result
    try:
        sys.path.insert(0, str(tool / "src"))
        from spine_skin_tool.reference_assets import verify_bundled
        verify_bundled(tool)
        result["status"] = "READY"
        result["code"] = "NONE"
    except Exception as error:
        code = getattr(error, "code", None)
        result["code"] = code if code in REFERENCE_REASONS else "REFERENCE_RUNTIME_ERROR"
    return result


def main() -> int:
    tool = (Path(__file__).resolve().parents[1] / "apps" / "web" / "app"
            / "city" / "spine-lab" / "SpineSkinTool_v1.0")
    if len(sys.argv) != 1:
        print(json.dumps({"status": "BROKEN", "code": "ARGUMENTS_INVALID"}))
        return 2
    outcome = check(tool)
    print(json.dumps(outcome, sort_keys=True))
    return 0 if outcome["status"] == "READY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
