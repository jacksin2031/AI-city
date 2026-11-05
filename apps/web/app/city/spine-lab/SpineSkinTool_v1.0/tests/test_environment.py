"""运行环境报告、跨 cwd/编码入口和安装失败边界。"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE_ROOT / "src"))
from spine_skin_tool.config import load_config
from spine_skin_tool.environment import environment_report, process_env


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="spine environment ")
        self.root = Path(self.temp.name) / "tool"
        for relative in ("src", "scripts", "runtime/config"):
            shutil.copytree(SOURCE_ROOT / relative, self.root / relative, ignore=shutil.ignore_patterns("__pycache__", "local.toml"))
        for relative in ("runtime/versions.toml", "runtime/python/pyproject.toml", "runtime/js/package.json", "runtime/python/uv.lock", "runtime/js/pnpm-lock.yaml"):
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(SOURCE_ROOT / relative, target)

    def tearDown(self):
        self.temp.cleanup()

    def report(self, production=False):
        with patch("spine_skin_tool.environment.toolchain_checks", return_value=[{"code": "TEST_TOOLCHAIN", "ok": True}]), patch("sys.prefix", str(self.root / "runtime/python/.venv")):
            return environment_report(load_config(self.root), production)

    def test_bootstrap_report_keeps_unverified_features_explicit(self):
        report = self.report()
        self.assertEqual(report["status"], "LOCAL_ENVIRONMENT_READY")
        self.assertIn("M07_FULL_CHARACTER_QUALITY_NOT_APPROVED", report["unverified"])
        self.assertNotIn("IMAGE_GENERATOR_NOT_IMPLEMENTED",report['unverified'])

    def test_production_rejects_even_when_base_environment_is_ready(self):
        report = self.report(production=True)
        self.assertEqual(report["status"], "NOT_READY")
        self.assertFalse(all(check["ok"] for check in report["checks"]))

    def test_version_drift_and_missing_lock_fail(self):
        manifest = self.root / "runtime/js/package.json"
        data = json.loads(manifest.read_text(encoding="utf-8"))
        data["version"] = "99.0.0"
        manifest.write_text(json.dumps(data), encoding="utf-8")
        (self.root / "runtime/python/uv.lock").unlink()
        report = self.report()
        self.assertEqual(report["status"], "NOT_READY")
        self.assertTrue(any(check["code"] == "MANIFEST_VERSIONS" and not check["ok"] for check in report["checks"]))

    def test_subprocess_environment_does_not_reuse_other_virtualenv(self):
        with patch.dict(os.environ, {"PYTHONHOME": "outside", "PYTHONPATH": "outside", "UV_PROJECT_ENVIRONMENT": "outside"}):
            env = process_env(self.root)
            self.assertNotIn("PYTHONHOME", env)
            self.assertEqual(env["UV_PROJECT_ENVIRONMENT"], str(self.root / "runtime/python/.venv"))
            self.assertEqual(env["PYTHONPATH"], str(self.root / "src"))
            self.assertEqual(os.environ["PYTHONHOME"], "outside")

    def run_script(self, name, *args):
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="gbk")
        return subprocess.run([sys.executable, "-B", str(self.root / "scripts" / name), *args], cwd=self.temp.name, env=env, capture_output=True, text=True, encoding="utf-8", timeout=30)

    def test_cli_works_from_parent_under_non_utf8_locale(self):
        proc = self.run_script("tool.py", "config", "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(proc.stdout)["size_trial"]["trial"]["status"], "EXPERIMENTAL")

    def test_invalid_config_does_not_leak_secrets_or_create_environment(self):
        (self.root / "runtime/config/local.toml").write_text('[execution]\napi_key = "PRIVATE_TEST_SENTINEL"', encoding="utf-8")
        proc = self.run_script("tool.py", "config", "--json")
        self.assertEqual(proc.returncode, 2)
        self.assertNotIn("PRIVATE_TEST_SENTINEL", proc.stdout + proc.stderr)
        proc = self.run_script("bootstrap.py", "--install")
        self.assertEqual(proc.returncode, 2)
        self.assertFalse((self.root / "runtime/python/.venv").exists())
        self.assertFalse((self.root / "runtime/data").exists())


if __name__ == "__main__":
    unittest.main()
