"""Opt-in, namespace-locked, evidence-bound exhibition release gate.

The internal SpineTool report remains human-review-only. The separate Preview
and Production exhibition integrations may publish verified, complete outputs
with zero structural, rendered or visual defects. A server-side publication
transaction additionally enforces the participant's active automatic-publication
consent and active session; this Python gate never receives participant data.
"""
import math
import re

RELEASE_FLAGS = {
    "preview-staging-20261107": "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH",
    "preview-visitors-20261019": "AI_CITY_SPINE_PRODUCTION_AUTO_PUBLISH",
}
# The exhibition release floor is separate from the immutable tool quality policy.
EXHIBITION_VISUAL_CONFIDENCE_FLOOR = 0.8


def exhibition_release_enabled(environment):
    namespace = environment.get("AI_CITY_VISITOR_NAMESPACE")
    flag = RELEASE_FLAGS.get(namespace)
    return bool(flag and environment.get(flag) == "1")


def preview_release_eligible(state, report, quality, environment):
    if not exhibition_release_enabled(environment):
        return False
    if state.get("phase") != "DONE" or state.get("status") != "REQUIRES_REVIEW":
        return False
    if state.get("error_code") or state.get("stop_reason"):
        return False
    if state.get("ear_stage") in ("STOPPED", "FRONT_EARS", "GENERATING_FRONT", "GENERATING_BACK"):
        return False
    output = state.get("best_output")
    review_id = state.get("review_id")
    if not output or not review_id or review_id != report.get("review_id"):
        return False
    if not any(c.get("output") == output and c.get("review_id") == review_id
               and c.get("manifest_sha256") == state.get("best_manifest_sha256")
               for c in state.get("candidates", ())):
        return False

    if report.get("status") != "REQUIRES_REVIEW":
        return False
    hard = report.get("hard", {})
    render = report.get("render", {})
    # Raw images are checked for structure/provenance; alpha decisions now
    # come from genuine assembled transparent Spine frames, not raw textures.
    # Reject old reviews that lack the verified composite-check revision.
    if hard.get("status") != "PASS" or hard.get("defects"):
        return False
    if render.get("status") != "PASS" or render.get("defects"):
        return False
    if not isinstance(hard.get("parts"), dict) or not hard["parts"]:
        return False
    if not isinstance(render.get("frame_count"), int) or render["frame_count"] < 10:
        return False
    if render.get("scales") != quality.get("render_scales"):
        return False
    if (render.get("assembled_alpha_revision") != "assembled-composite-alpha-001"
            or type(render.get("assembled_alpha_frames")) is not int
            or render["assembled_alpha_frames"] < 20
            or render.get("assembled_alpha_outlier_frames") != 0):
        return False
    if not re.fullmatch(r"[0-9a-f]{64}", str(render.get("evidence_hash", ""))):
        return False

    call = report.get("visual_call", {})
    if call.get("status") != "COMPLETED_ADVISORY" or call.get("model_calls_reserved") != 1:
        return False
    visual = report.get("visual_reviews", ())
    if len(visual) != 1 or visual[-1].get("source") != "CODEX_SUBSCRIPTION":
        return False
    data = visual[-1].get("data", {})
    if data.get("defects") or data.get("review_id") != review_id:
        return False
    if data.get("evidence_hash") != render["evidence_hash"]:
        return False

    required = quality.get("required_visual_checks")
    policy_floor = quality.get("visual_confidence_floor")
    if (not isinstance(required, list) or not required or type(policy_floor) not in (float, int)
            or not math.isfinite(policy_floor) or not 0.9 <= policy_floor <= 1.0):
        return False
    # The base policy remains validated/pinned; only explicitly enabled,
    # namespace-locked exhibition integrations use the 0.80 release threshold.
    floor = EXHIBITION_VISUAL_CONFIDENCE_FLOOR
    checks = data.get("checks")
    if not isinstance(checks, list) or len(checks) != len(required):
        return False
    if {c.get("category") for c in checks if isinstance(c, dict)} != set(required):
        return False
    for check in checks:
        category = check["category"]
        if check.get("result") == "NOT_APPLICABLE":
            # The original visual validator restricts this to pants designs;
            # we do not waive the ear or character assembly checks here.
            if category != "skirt_occlusion":
                return False
            continue
        if (check.get("result") != "PASS"
                or type(check.get("confidence")) not in (int, float)
                or not math.isfinite(check["confidence"])
                or check["confidence"] < floor
                or not check.get("evidence_ids")):
            return False
    return True
