"""Model-free evidence release gate tests."""
import copy
import unittest

from spine_preview_release import preview_release_eligible

ENV = {
    "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH": "1",
    "AI_CITY_VISITOR_NAMESPACE": "preview-staging-20261107",
}
REQUIRED = ["hair_fit", "hair_consistency", "style", "garment_parts",
            "material_outlines", "ear_visibility", "leg_connections", "skirt_occlusion"]


def fixture():
    identity = "review-" + "a" * 32
    manifest = "f" * 64
    output = "runtime/work/M07/flow/candidate-initial"
    state = {"phase": "DONE", "status": "REQUIRES_REVIEW", "error_code": None,
             "review_id": identity, "best_output": output, "best_manifest_sha256": manifest,
             "ear_stage": None, "candidates": [
                 {"output": output, "review_id": identity, "manifest_sha256": manifest}]}
    evidence = "b" * 64
    report = {"review_id": identity, "status": "REQUIRES_REVIEW",
              "hard": {"status": "PASS", "defects": [], "parts": {"HAIR_FRONT": {}}},
              "render": {"status": "PASS", "defects": [], "frame_count": 64,
                         "scales": [1, 2, 4],
                         "assembled_alpha_revision": "assembled-composite-alpha-001",
                         "assembled_alpha_frames": 110,
                         "assembled_alpha_outlier_frames": 0,
                         "evidence_hash": evidence},
              "visual_call": {"status": "COMPLETED_ADVISORY", "model_calls_reserved": 1},
              "visual_reviews": [{"source": "CODEX_SUBSCRIPTION", "data": {
                  "review_id": identity, "evidence_hash": evidence,
                  "defects": [], "checks": [
                      {"category": category, "result": "PASS", "confidence": 0.97,
                       "evidence_ids": ["overview"]} for category in REQUIRED]}}]}
    policy = {"visual_confidence_floor": 0.9, "required_visual_checks": REQUIRED,
              "render_scales": [1, 2, 4]}
    return state, report, policy


class ReleaseGateTests(unittest.TestCase):
    def test_strict_clean_preview_evidence(self):
        state, report, quality = fixture()
        self.assertTrue(preview_release_eligible(state, report, quality, ENV))

    def test_fail_closed_without_explicit_preview_namespace_and_opt_in(self):
        state, report, quality = fixture()
        for env in ({}, {"AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH": "1"},
                    {**ENV, "AI_CITY_VISITOR_NAMESPACE": "production"},
                    {**ENV, "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH": "true"}):
            self.assertFalse(preview_release_eligible(state, report, quality, env))

    def test_never_release_incomplete_unreviewed_or_tampered_candidate(self):
        state, report, quality = fixture()
        for key, value in [("status", "UNKNOWN"), ("phase", "CAPTURE"),
                           ("stop_reason", "FRONT_EARS_NOT_CONFIRMED"),
                           ("best_manifest_sha256", "f" * 63)]:
            changed = dict(state, **{key: value})
            self.assertFalse(preview_release_eligible(changed, report, quality, ENV))
        for key, value in [("status", "FAIL"), ("defects", [{"code":"BAD","result":"FAIL"}])]:
            changed = copy.deepcopy(report)
            changed["hard"][key] = value
            self.assertFalse(preview_release_eligible(state, changed, quality, ENV))
        for key, value in [("status", "NOT_RUN"), ("defects", [{"code":"BAD","result":"UNKNOWN"}])]:
            changed = copy.deepcopy(report)
            changed["render"][key] = value
            self.assertFalse(preview_release_eligible(state, changed, quality, ENV))

    def test_prior_review_without_composite_proof_cannot_auto_release(self):
        state, report, quality = fixture()
        for field, value in (
            ("assembled_alpha_revision", None),
            ("assembled_alpha_frames", 0),
            ("assembled_alpha_outlier_frames", 1),
        ):
            changed = copy.deepcopy(report)
            changed["render"][field] = value
            self.assertFalse(preview_release_eligible(state, changed, quality, ENV))

    def test_visual_review_must_be_complete_and_confident(self):
        state, report, quality = fixture()
        cases = [
            ("visual_call", "status", "NOT_RUN"),
            ("visual_reviews", None, None),
        ]
        for section, key, value in cases:
            changed = copy.deepcopy(report)
            if key: changed[section][key] = value
            else: changed[section] = []
            self.assertFalse(preview_release_eligible(state, changed, quality, ENV))
        for change in (
            {"source": "HUMAN"},
            {"source": "EXTERNAL_MODEL"},
        ):
            changed = copy.deepcopy(report)
            changed["visual_reviews"][-1].update(change)
            self.assertFalse(preview_release_eligible(state, changed, quality, ENV))
        for label, field, val in (
            ("unknown", "result", "UNKNOWN"), ("low", "confidence", 0.4),
            ("unsupported", "evidence_ids", []),
        ):
            with self.subTest(label=label):
                changed = copy.deepcopy(report)
                changed["visual_reviews"][-1]["data"]["checks"][0][field] = val
                self.assertFalse(preview_release_eligible(state, changed, quality, ENV))
        changed = copy.deepcopy(report)
        changed["visual_reviews"][-1]["data"]["defects"] = [{"severity": "MINOR"}]
        self.assertFalse(preview_release_eligible(state, changed, quality, ENV))

    def test_pants_can_be_not_applicable_but_ears_cannot(self):
        state, report, quality = fixture()
        changed = copy.deepcopy(report)
        changed["visual_reviews"][-1]["data"]["checks"][-1]["result"] = "NOT_APPLICABLE"
        self.assertTrue(preview_release_eligible(state, changed, quality, ENV))
        changed["visual_reviews"][-1]["data"]["checks"][-2]["result"] = "NOT_APPLICABLE"
        self.assertFalse(preview_release_eligible(state, changed, quality, ENV))


if __name__ == "__main__":
    unittest.main()
