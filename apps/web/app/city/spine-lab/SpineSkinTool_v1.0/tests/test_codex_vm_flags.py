"""Codex VM compatibility flags: build arguments only; no model, photos or network."""
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from spine_skin_tool.character_session import command
from spine_skin_tool.codex_subscription import vision_only_flags
from spine_skin_tool.review_visual import execute_review_request

VISION = ("features.code_mode=false", "features.code_mode_host=false")


class CodeModeVmTests(unittest.TestCase):
    def test_design_and_review_sessions_disable_optional_code_host(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ref = {"folder": root, "flow_id": "flow-" + "1" * 32}
            for sid in (None, "session-previous-id"):
                state = {"session_id": sid, "requested_model": "gpt-6-luna"}
                argv = command("codex", ref, state, root, root / "schema.json",
                               root / "result.json", False)
                self.assertTrue(all(v in argv for v in VISION))
                self.assertIn("--ignore-user-config", argv)
                self.assertIn("resume", argv) if sid else self.assertNotIn("resume", argv)

    def test_imagegen_path_keeps_its_existing_tool_features(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ref = {"folder": root}
            state = {"session_id": None, "requested_model": "gpt-6-luna"}
            argv = command("codex", ref, state, root, root / "schema.json",
                           root / "result.json", True)
            self.assertNotIn("features.code_mode=false", argv)
            self.assertNotIn("features.code_mode_host=false", argv)
            self.assertIn("features.image_generation=true", argv)
            self.assertEqual(vision_only_flags(), [
                "-c", "features.code_mode=false", "-c", "features.code_mode_host=false",
            ])

    def test_standalone_review_call_disables_code_host(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "review"
            folder.mkdir()
            seen = []

            def fake_run(argv, **kwargs):
                seen.extend(argv)
                (folder / "visual-result.json").write_text(json.dumps({"test": "ok"}), encoding="utf-8")
                return types.SimpleNamespace(returncode=0)

            with patch("spine_skin_tool.review_visual.executable", return_value="codex"), \
                 patch("spine_skin_tool.review_visual.subprocess.run", side_effect=fake_run):
                result = execute_review_request(
                    Path(tmp), folder, {"schema": {"type": "object"}, "prompt": "Return JSON",
                                        "image_files": []},
                    {"executable": "codex", "timeout_seconds": 90}, 90,
                )
            self.assertEqual(result, {"test": "ok"})
            self.assertTrue(all(v in seen for v in VISION))
            self.assertIn("features.image_generation=false", seen)
            self.assertEqual(seen.count("--image"), 0)


if __name__ == "__main__":
    unittest.main()
