"""Model bbox formatting recovery must never remove a visual defect."""
import unittest

from spine_skin_tool.review_visual import normalize_defect_bbox


class VisualBBoxCompatibilityTests(unittest.TestCase):
    def test_normalized_xyxy_and_unlocated_are_unchanged(self):
        self.assertEqual(normalize_defect_bbox([0.2, 0.1, 0.6, 0.7]), [0.2, 0.1, 0.6, 0.7])
        self.assertEqual(normalize_defect_bbox([]), [])

    def test_model_xywh_slip_gets_normalized_to_xyxy(self):
        # Observed on a synthetic Preview role without exposing raw model output.
        actual = normalize_defect_bbox([0.35, 0.28, 0.3, 0.14])
        for value, expected in zip(actual, (0.35, 0.28, 0.65, 0.42)):
            self.assertAlmostEqual(value, expected, places=8)
        defect = {"code": "EAR_OCCLUDED", "severity": "MAJOR",
                  "bbox": [0.35, 0.28, 0.3, 0.14]}
        defect["bbox"] = normalize_defect_bbox(defect["bbox"])
        self.assertEqual(defect["code"], "EAR_OCCLUDED")
        self.assertEqual(defect["severity"], "MAJOR")
        self.assertEqual(len(defect["bbox"]), 4)

    def test_unknown_or_out_of_frame_boxes_still_fail_closed(self):
        for value in ([0.95, 0.95, 0.2, 0.2], [0.5, 0.5, 0, 0],
                      [-0.1, 0.1, 0.6, 0.6], [0.8, 0.8, 0.7, 0.9],
                      [True, 0.2, 0.3, 0.5], [0.2, 0.3, 0.4],
                      "0,0,1,1", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_defect_bbox(value)


if __name__ == "__main__":
    unittest.main()
