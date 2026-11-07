"""Preview-only stage confidence threshold keeps production policy unchanged."""
import unittest

from spine_skin_tool.review import stage_confidence_floor


class PreviewStageConfidenceTests(unittest.TestCase):
    def test_namespace_and_optin_required(self):
        enabled = {
            "AI_CITY_VISITOR_NAMESPACE": "preview-staging-20261107",
            "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH": "1",
        }
        self.assertEqual(stage_confidence_floor(enabled), 0.8)
        for env in ({}, {"AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH": "1"},
                    {**enabled, "AI_CITY_VISITOR_NAMESPACE": "production"},
                    {**enabled, "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH": "0"}):
            self.assertEqual(stage_confidence_floor(env), 0.9)


if __name__ == "__main__":
    unittest.main()
