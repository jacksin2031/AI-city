"""配置边界与尺寸可调整性的离线回归测试。"""
from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

SOURCE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE_ROOT / "src"))

from spine_skin_tool.config import ConfigError, load_config


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="spine config ")
        self.root = Path(self.temp.name)
        shutil.copytree(SOURCE_ROOT / "runtime/config", self.root / "runtime/config", ignore=shutil.ignore_patterns("local.toml"))

    def tearDown(self):
        self.temp.cleanup()

    def local(self, text):
        (self.root / "runtime/config/local.toml").write_text(text, encoding="utf-8")

    def test_defaults_are_experimental_and_do_not_create_data(self):
        config = load_config(self.root)
        self.assertEqual(config.values["execution"]["mode"], "mock")
        self.assertEqual(config.trial["trial"]["status"], "EXPERIMENTAL")
        self.assertFalse(config.trial["trial"]["production_approved"])
        self.assertFalse((self.root / "runtime/data").exists())

    def test_dimensions_come_from_trial_and_change_its_hash(self):
        before = load_config(self.root)
        path = self.root / "runtime/config/size-trials.toml"
        path.write_text(path.read_text(encoding="utf-8").replace("width = 289", "width = 512"), encoding="utf-8")
        after = load_config(self.root)
        self.assertEqual(after.trial["parts"]["HAIR_FRONT"]["width"], 512)
        self.assertNotEqual(before.trial_sha256, after.trial_sha256)

    def test_local_override_merges_without_dropping_defaults(self):
        self.local("[server]\nport = 9000\n")
        config = load_config(self.root)
        self.assertEqual(config.values["server"]["port"], 9000)
        self.assertEqual(config.values["server"]["host"], "127.0.0.1")

    def test_unknown_key_does_not_echo_potential_secret(self):
        self.local('[execution]\napi_key = "PRIVATE_TEST_SENTINEL"\n')
        with self.assertRaises(ConfigError) as error:
            load_config(self.root)
        self.assertNotIn("PRIVATE_TEST_SENTINEL", str(error.exception))

    def test_invalid_types_and_ranges_are_rejected(self):
        for text in ('[execution]\npaid_api_enabled = "false"', '[execution]\nmax_active_jobs = true', '[server]\nport = 0', '[execution]\nmax_total_model_calls = -1'):
            with self.subTest(text=text):
                self.local(text)
                with self.assertRaises(ConfigError):
                    load_config(self.root)

    def test_non_loopback_and_real_execution_are_rejected(self):
        for text in ('[server]\nhost = "0.0.0.0"', '[execution]\nmode = "real"', '[execution]\npaid_api_enabled = true'):
            self.local(text)
            with self.assertRaises(ConfigError):
                load_config(self.root)

    def test_path_escape_absolute_and_drive_paths_are_rejected(self):
        for value in ("../outside", "runtime/../../outside", "/tmp/outside", "C:/outside", "runtime\\outside", "src/output"):
            with self.subTest(value=value):
                self.local('[paths]\nwork = ' + json.dumps(value))
                with self.assertRaises(ConfigError):
                    load_config(self.root)

    def test_persistent_paths_cannot_overlap_cache(self):
        for value in ("runtime/cache", "runtime/cache/data", "runtime"):
            self.local('[paths]\ndata = ' + json.dumps(value))
            with self.assertRaises(ConfigError):
                load_config(self.root)

    def test_missing_part_empty_dimensions_and_fake_approval_are_rejected(self):
        path = self.root / "runtime/config/size-trials.toml"
        original = path.read_text(encoding="utf-8")
        for mutated in (original.replace("width = 289", "width = 0"), original.replace("[parts.HAIR_FRONT]", "[parts.NOT_A_PART]"), original.replace("production_approved = false", "production_approved = true")):
            path.write_text(mutated, encoding="utf-8")
            with self.assertRaises(ConfigError):
                load_config(self.root)

    def test_invalid_toml_does_not_echo_values(self):
        self.local('[execution]\napi_key = "PRIVATE_TEST_SENTINEL')
        with self.assertRaises(ConfigError) as error:
            load_config(self.root)
        self.assertNotIn("PRIVATE_TEST_SENTINEL", str(error.exception))

    def test_custom_data_cannot_escape_git_ignored_area(self):
        self.local('[paths]\ndata = "runtime/untracked-data"')
        with self.assertRaises(ConfigError):
            load_config(self.root)

    def test_safe_custom_subdirectory_and_alternative_trial(self):
        source = self.root / "runtime/config/size-trials.toml"
        alternative = source.with_name("trial-002.toml")
        alternative.write_text(source.read_text(encoding="utf-8").replace('revision = "trial-001"', 'revision = "trial-002"'), encoding="utf-8")
        self.local('[paths]\ndata = "runtime/data/experiment"\n[template]\nsize_trial = "runtime/config/trial-002.toml"')
        config = load_config(self.root)
        self.assertEqual(config.trial["trial"]["revision"], "trial-002")
        self.assertEqual(config.resolved_paths["data"], self.root / "runtime/data/experiment")


if __name__ == "__main__":
    unittest.main()
