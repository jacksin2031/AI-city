"""Stage-A bare hair may proceed to ear generation, but never skip final ear checks."""
import copy
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from spine_skin_tool.hair_stages import stage_gate
from spine_skin_tool.hair_fit import make


ENV = {
    "AI_CITY_VISITOR_NAMESPACE": "preview-staging-20261107",
    "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH": "1",
}


def review():
    return {
        "hard": {"status": "PASS"},
        "render": {"status": "PASS"},
        "visual_call": {"status": "COMPLETED_ADVISORY"},
        "visual_reviews": [{"data": {
            "checks": [
                {"category": "hair_fit", "result": "PASS", "confidence": 0.85},
                {"category": "hair_consistency", "result": "PASS", "confidence": 0.86},
                {"category": "ear_visibility", "result": "FAIL", "confidence": 0.97},
            ],
            "defects": [
                {"part": "HAIR_FRONT", "code": "EAR_OCCLUDED", "confidence": 0.95},
                {"part": "HAIR_BACK", "code": "EAR_OCCLUDED", "confidence": 0.93},
            ],
        }}],
    }


class PreviewBareHairStageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.folder = self.root / "runtime/work/candidate/export/bundle"
        self.folder.mkdir(parents=True)
        self.candidate = {"output": "runtime/work/candidate", "review_id": "synthetic-review"}
        self.fit = {
            "revision": "head-alpha-fit-008",
            "metrics": {
                "status": "ESTIMATED_NOT_VISUALLY_APPROVED",
                "ear_stage": "BARE_HAIR",
            },
        }
        self.report = review()

    def tearDown(self):
        self.tmp.cleanup()

    def evaluate(self, front_ears=False, environment=ENV):
        (self.folder / "hair-fit.json").write_text(json.dumps(self.fit), encoding="utf-8")
        with patch.dict("os.environ", environment, clear=True), patch(
            "spine_skin_tool.review.read_review", return_value=self.report
        ):
            return stage_gate(self.root, self.candidate, front_ears=front_ears)

    def test_preview_eighty_percent_passes_bare_hair_into_ear_stage(self):
        self.assertTrue(self.evaluate())
        self.assertFalse(self.evaluate(environment={}))
        self.assertFalse(self.evaluate(environment={
            **ENV, "AI_CITY_VISITOR_NAMESPACE": "production"
        }))

    def test_genuine_geometry_or_other_hair_defect_still_blocks(self):
        self.fit["metrics"]["status"] = "REQUIRES_REVIEW"
        self.assertFalse(self.evaluate())
        self.fit["metrics"]["status"] = "ESTIMATED_NOT_VISUALLY_APPROVED"
        self.report["visual_reviews"][0]["data"]["defects"].append({
            "part": "HAIR_FRONT", "code": "BAD_HAIR_ALIGNMENT", "confidence": 0.91
        })
        self.assertFalse(self.evaluate())

    def test_ear_occclusion_is_not_waived_after_ear_pass(self):
        self.fit["metrics"]["ear_stage"] = "FRONT_EARS"
        self.fit["ear_pass"] = {"measurements": {"HAIR_FRONT": {
            "visible_ear_pixels": 50,
            "per_ear": [{"visible_fraction": 0.9}, {"visible_fraction": 0.8}],
        }}}
        self.assertFalse(self.evaluate(front_ears=True))
        data = self.report["visual_reviews"][0]["data"]
        data["defects"] = []
        data["checks"][2].update(result="PASS", confidence=0.84)
        self.assertTrue(self.evaluate(front_ears=True))
        self.fit["ear_pass"]["measurements"]["HAIR_FRONT"]["per_ear"][1]["visible_fraction"] = 0.2
        self.assertFalse(self.evaluate(front_ears=True))

    def test_008_inherits_007_jaw_measurement_without_changing_back_scaling(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            head_file = root / "head.png"
            Image.new("RGBA", (200, 200), (240, 180, 140, 255)).save(head_file)
            png = io.BytesIO()
            Image.new("RGBA", (8, 8), (70, 45, 34, 255)).save(png, format="PNG")
            raw = png.getvalue()
            resolved = {
                part: {"content": raw, "sha256": hashlib.sha256(raw).hexdigest()}
                for part in ("HAIR_FRONT", "HAIR_BACK")
            }
            with patch("spine_skin_tool.hair_fit.target_head", return_value=(
                {"width": 200, "height": 200, "x": 100}, head_file
            )), patch("spine_skin_tool.hair_fit.prepare_texture", side_effect=lambda im, size, kind: (im, {})), patch(
                "spine_skin_tool.hair_stages.fit_pair",
                return_value=({"front_width": 210, "back_width": 210, "top": 200},
                              {"status": "ESTIMATED_NOT_VISUALLY_APPROVED"}),
            ) as mocked_fit, patch("spine_skin_tool.ear_geometry.target_roots", return_value={
                "points": []
            }), patch("spine_skin_tool.character_flow.source_profile", return_value=(
                head_file, None, None
            )):
                output = make(root, {"design_id": "synthetic"}, resolved,
                              revision="head-alpha-fit-008")
            self.assertEqual(output["revision"], "head-alpha-fit-008")
            self.assertTrue(mocked_fit.call_args.kwargs["current"])
            self.assertTrue(mocked_fit.call_args.kwargs["non_uniform"])


if __name__ == "__main__":
    unittest.main()
