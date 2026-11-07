"""Assembled alpha evidence uses actual transparent character frames, not raw textures."""
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from spine_skin_tool.review import image_metrics
from spine_skin_tool.review_render import assess_assembled_alpha, assembled_alpha_evidence
from spine_skin_tool.texture import prepare_texture


FRAME = {"frame_id": "s1-000", "direction": "front"}


def assembled_sprite():
    image = Image.new("RGBA", (512, 512))
    # The sample is already a rendered/composited character. Transparent canvas
    # allows alpha measurements without relying on the original image parts.
    image.paste((88, 76, 66, 255), (190, 80, 330, 340))
    image.paste((120, 100, 88, 255), (175, 340, 345, 420))
    return image


class AssembledAlphaTests(unittest.TestCase):
    def test_faint_raw_corner_pixels_removed_by_normalization_never_block_clean_composite(self):
        raw = Image.new("RGBA", (128, 128))
        raw.paste((80, 65, 60, 255), (32, 28, 96, 108))
        raw.putpixel((0, 0), (1, 1, 1, 1))
        self.assertGreater(image_metrics(raw)["outlier_bbox_ratio"], 1.15)
        normal, metadata = prepare_texture(raw, (130, 130), "hair")
        self.assertEqual(normal.getpixel((0, 0))[3], 0)
        self.assertGreaterEqual(metadata["removed_alpha_fraction"], 0)
        assembled = assembled_sprite()
        assembled.alpha_composite(normal, (190, 80))
        metrics, defects = assess_assembled_alpha(assembled, FRAME)
        self.assertLessEqual(metrics["outlier_bbox_ratio"], 1.15)
        self.assertFalse(defects)

    def test_real_stray_alpha_on_composited_frame_is_still_reviewable(self):
        assembled = assembled_sprite()
        assembled.putpixel((0, 0), (1, 1, 1, 25))
        measured, defects = assess_assembled_alpha(assembled, FRAME)
        self.assertGreater(measured["outlier_bbox_ratio"], 1.15)
        self.assertEqual(len(defects), 1)
        self.assertEqual(defects[0]["code"], "ASSEMBLED_ALPHA_OUTLIERS")
        self.assertEqual(defects[0]["result"], "UNKNOWN")
        self.assertEqual(defects[0]["severity"], "MINOR")
        self.assertEqual(defects[0]["frame_id"], FRAME["frame_id"])

    def test_empty_or_opaque_assembled_capture_fails(self):
        for im, code in (
            (Image.new("RGBA", (512, 512)), "ASSEMBLED_EMPTY_ALPHA"),
            (Image.new("RGBA", (512, 512), (1, 1, 1, 255)), "ASSEMBLED_OPAQUE_BACKGROUND"),
        ):
            with self.subTest(code=code):
                _, defects = assess_assembled_alpha(im, FRAME)
                self.assertEqual(defects[0]["code"], code)
                self.assertEqual(defects[0]["result"], "FAIL")

    def test_batched_evidence_checks_all_actual_pose_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "frames").mkdir()
            good = assembled_sprite()
            good.save(base / "frames" / "composite.png")
            frames = [{"frame_id": f"s1-{i:03}", "scale": 1, "direction": "back" if i % 2 else "front",
                       "screenshot": "frames/composite.png"} for i in range(20)]
            bad = good.copy()
            bad.putpixel((1, 1), (1, 1, 1, 20))
            bad.save(base / "frames" / "stray.png")
            frames[-1]["screenshot"] = "frames/stray.png"
            issues, metrics = assembled_alpha_evidence(base, frames)
            self.assertEqual(len(metrics), 20)
            self.assertEqual([x["frame_id"] for x in issues], ["s1-019"])
            self.assertEqual(metrics[-1]["has_outliers"], True)
            self.assertFalse(metrics[0]["has_outliers"])

    def test_evidence_rejects_missing_frames_or_untrusted_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            with self.assertRaisesRegex(ValueError, "ASSEMBLED_ALPHA_EVIDENCE_MISSING"):
                assembled_alpha_evidence(base, [])
            frames = [{"frame_id": str(i), "scale": 1, "direction": "front",
                       "screenshot": "../outside.png"} for i in range(20)]
            with self.assertRaisesRegex(ValueError, "ASSEMBLED_ALPHA_EVIDENCE_INVALID"):
                assembled_alpha_evidence(base, frames)


if __name__ == "__main__":
    unittest.main()
