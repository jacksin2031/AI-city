"""Read-only integration boundary for an existing Spine Skin Tool task.

Does not invoke a model, edit the tool, or print photos, prompts, credentials or raw reports.
The caller must bind the tool flow to its own authenticated job before trusting this result.
"""
import json
import re
import sys
from pathlib import Path


def main():
    if len(sys.argv) != 4 or not re.fullmatch(r"flow-[a-f0-9]{32}", sys.argv[3]):
        print(json.dumps({"status": "INVALID"}))
        return 1
    tool = Path(sys.argv[1]).resolve()
    root = Path(sys.argv[2]).resolve()
    flow = sys.argv[3]
    sys.path.insert(0, str(tool / "src"))
    try:
        from spine_skin_tool.assembly import verify_bundle
        from spine_skin_tool.design import digest, private_path
        from spine_skin_tool.pipeline import context
        from spine_skin_tool.pipeline_store import read
        from spine_skin_tool.repair import review_is_approved
        from spine_skin_tool.review import read_review

        state = read(root, flow)
        context(root, state)
        if state["status"] != "READY_FOR_REVIEWED_EXPORT" or not state["quality_approved"]:
            print(json.dumps({"status": "REQUIRES_REVIEW" if state["status"] == "REQUIRES_REVIEW" else "NOT_READY"}))
            return 0
        output, expected = state.get("best_output"), state.get("best_manifest_sha256")
        candidate = next((item for item in state["candidates"] if item.get("output") == output and item.get("manifest_sha256") == expected), None)
        if not candidate or not review_is_approved(root, read_review(root, candidate["review_id"])):
            raise ValueError("REVIEW_NOT_VERIFIED")
        bundle = private_path(root, output + "/export/bundle")
        verify_bundle(bundle)
        if digest(bundle / "build-manifest.json") != expected:
            raise ValueError("MANIFEST_CHANGED")
        print(json.dumps({"status": "APPROVED", "bundle": bundle.relative_to(root).as_posix(), "manifest_sha256": expected}))
        return 0
    except (OSError, ValueError, KeyError, TypeError, ImportError):
        print(json.dumps({"status": "UNVERIFIED"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
