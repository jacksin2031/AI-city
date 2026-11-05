"""Real-tool preflight with generated pixels only; no model calls or credentials."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parents[2]
TOOL = PROJECT / "apps/web/app/city/spine-lab/SpineSkinTool_v1.0"
SCRIPT = PROJECT / "scripts/prepare-spine-tool-task.py"
sys.path.insert(0, str(TOOL / "src"))


class ToolPreparationTest(unittest.TestCase):
    def test_isolates_duplicate_images_and_does_not_call_models(self):
        from spine_skin_tool.pipeline_store import read

        with tempfile.TemporaryDirectory(prefix="ai-city-spine-tool-") as temporary:
            root = Path(temporary).resolve()
            tasks = []
            for _ in range(2):
                task = "spine-" + str(uuid.uuid4())
                folder = root / task
                folder.mkdir()
                photo = folder / "photo.png"
                Image.new("RGB", (8, 8), "red").save(photo)
                sha = hashlib.sha256(photo.read_bytes()).hexdigest()
                command = [sys.executable, "-B", str(SCRIPT), str(TOOL), str(root), task]
                result = subprocess.run(command, input=sha, capture_output=True, text=True, timeout=120, check=True)
                response = json.loads(result.stdout)
                self.assertEqual(response["status"], "PREPARED")
                self.assertEqual(response["model_calls"], 0)
                workspace = folder / "tool-workspace"
                state = read(workspace, response["flow"])
                self.assertEqual(state["status"], "PLANNED")
                self.assertFalse(state["limits"]["live_design"])
                self.assertFalse(state["limits"]["live_generation"])
                self.assertFalse(state["limits"]["live_review"])
                receipt = json.loads((workspace / "integration-receipt.json").read_text())
                self.assertEqual(receipt["photo_sha256"], sha)
                self.assertEqual(receipt["flow"], response["flow"])
                self.assertEqual(subprocess.run(command, input=sha, capture_output=True, text=True, timeout=120).returncode, 1)
                tasks.append(workspace)
            self.assertNotEqual(tasks[0], tasks[1])
            self.assertTrue((tasks[0] / "runtime/work/M04/character-reference1.png").exists())
            self.assertTrue((tasks[1] / "runtime/work/M04/character-reference1.png").exists())

    def test_rejects_photo_digest_mismatch_before_creating_workspace(self):
        with tempfile.TemporaryDirectory(prefix="ai-city-spine-tool-") as temporary:
            root = Path(temporary).resolve()
            task = "spine-" + str(uuid.uuid4())
            folder = root / task
            folder.mkdir()
            Image.new("RGB", (8, 8), "blue").save(folder / "photo.png")
            command = [sys.executable, "-B", str(SCRIPT), str(TOOL), str(root), task]
            result = subprocess.run(command, input="0" * 64, capture_output=True, text=True, timeout=120)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)["status"], "NOT_PREPARED")
            self.assertFalse((folder / "tool-workspace").exists())


if __name__ == "__main__":
    unittest.main()
