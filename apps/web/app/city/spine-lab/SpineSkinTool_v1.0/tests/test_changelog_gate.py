"""Offline, stdlib-only smoke tests for the Codex changelog gate.

Run: python -m unittest discover -s tests -p 'test_*.py' -v
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parents[1]


class ChangelogGateTests(unittest.TestCase):
    tool_subdir = "."

    def test_uncommitted_next_task_uses_previous_snapshot(self):
        self.update_file()
        self.approved_log()
        previous = next((self.repo / 'docs/changes/entries').glob('*.json'))
        self.changed_file.write_text(self.changed_file.read_text() + '# next task\n')
        proc = self.run_cmd('python', 'scripts/record_change.py', '--task-id', 'TASK-ZZZ', '--since-entry', previous.relative_to(self.repo).as_posix())
        self.assertEqual(proc.returncode,0,proc.stderr)
        current = next((self.repo / 'docs/changes/entries').glob('*-TASK-ZZZ.json'))
        data = json.loads(current.read_text(encoding='utf-8'))
        self.assertEqual([item['path'] for item in data['files']], ['runtime/config/defaults.toml'])
        self.assertEqual(data['files'][0]['change_type'],'MODIFY')
        self.assertEqual(data['files'][0]['before_sha256'],json.loads(previous.read_text())['files'][0]['after_sha256'])

    def test_three_uncommitted_tasks_preserve_cumulative_baseline(self):
        self.update_file();self.approved_log()
        previous=next((self.repo/'docs/changes/entries').glob('*.json'))
        (self.repo/'second-task.md').write_text('second task')
        result=self.run_cmd('python','scripts/record_change.py','--task-id','TASK-ZZZ','--since-entry',previous.relative_to(self.repo).as_posix())
        self.assertEqual(result.returncode,0,result.stderr)
        middle=next((self.repo/'docs/changes/entries').glob('*-TASK-ZZZ.json'))
        self.changed_file.write_text(self.changed_file.read_text()+'# third task\n')
        result=self.run_cmd('python','scripts/record_change.py','--task-id','TASK-ZZZZ','--since-entry',middle.relative_to(self.repo).as_posix())
        self.assertEqual(result.returncode,0,result.stderr)
        latest=next((self.repo/'docs/changes/entries').glob('*-TASK-ZZZZ.json'))
        self.assertEqual([f['path'] for f in json.loads(latest.read_text())['files']],['runtime/config/defaults.toml'])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="spine-changelog-")
        self.git_root = Path(self.temp.name)
        self.repo = self.git_root / self.tool_subdir
        self.repo.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "init", "-q"], cwd=self.git_root, check=True)
        for rel in ("scripts/verify_changes.py", "scripts/record_change.py", "scripts/sync_changelog.py"):
            dest = self.repo / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(SOURCE_ROOT / rel, dest)
        doc = self.repo / "docs/changes/CHANGELOG.md"
        doc.parent.mkdir(parents=True, exist_ok=True)
        doc.write_text("# Implementation changelog\n")
        (self.repo / ".gitignore").write_text("__pycache__/\n*.pyc\n")
        self.changed_file = self.repo / "runtime/config/defaults.toml"
        self.changed_file.parent.mkdir(parents=True, exist_ok=True)
        self.changed_file.write_text("[server]\nhost = '127.0.0.1'\n")
        self.run_cmd("git", "config", "user.email", "test@example.invalid", must=True)
        self.run_cmd("git", "config", "user.name", "Codex QA", must=True)
        self.run_cmd("git", "add", ".", must=True)
        self.run_cmd("git", "commit", "-qm", "base", must=True)

    def tearDown(self):
        self.temp.cleanup()

    def run_cmd(self, *args, must=False):
        if args[0] == "python":
            args = (sys.executable, *args[1:])
        proc = subprocess.run(args, cwd=self.repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if must and proc.returncode:
            raise AssertionError(f"Command failed: {args}: {proc.stderr}")
        return proc

    def update_file(self):
        self.changed_file.write_text("[server]\nhost = '127.0.0.1'\nport = 8765\n")

    def approved_log(self):
        now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        label = now.strftime("%Y%m%dT%H%M%SZ")
        batch = f"{label}-TASK-P00-01"
        entry_dir = self.repo / "docs/changes/entries"
        entry_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "schema_version": "1.0.0",
            "batch_id": batch,
            "task_id": "TASK-P00-01",
            "timestamp_local": now.astimezone(dt.timezone(dt.timedelta(hours=9))).isoformat(),
            "timestamp_utc": now.isoformat(),
            "status": "COMPLETE",
            "goal": "Test actual changelog coverage",
            "files": [{
                "path": "runtime/config/defaults.toml",
                "change_type": "MODIFY",
                "reason": "Make the test config change visible to verifier",
                "symbol": "server.port",
                "line_range": "3-3",
                "code_excerpt": "port = 8765",
                "before_sha256": None,
                "after_sha256": hashlib.sha256(self.changed_file.read_bytes()).hexdigest(),
            }],
            "tests": [{"command": "python -m unittest discover -s tests", "exit_code": 0, "result": "PASS", "evidence": "Isolated unittest process passed; this is fixture evidence."}],
            "risks": ["None known for isolated fixture"],
            "next_task": "TASK-P00-02"
        }
        (entry_dir / f"{batch}.json").write_text(json.dumps(record, indent=2))
        change = self.repo / "docs/changes/CHANGELOG.md"
        change.write_text(change.read_text() + f"\n## {now.isoformat()} | {batch} | COMPLETE\n- MODIFY runtime/config/defaults.toml :: server.port :: port = 8765\n")

    def test_missing_entry_is_rejected(self):
        self.update_file()
        proc = self.run_cmd("python", "scripts/verify_changes.py")
        self.assertEqual(proc.returncode, 1)
        self.assertIn("Unrecorded files", proc.stderr)

    def test_matching_entry_passes_both_worktree_and_committed_range(self):
        self.update_file()
        self.approved_log()
        proc = self.run_cmd("python", "scripts/verify_changes.py")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        baseline = self.run_cmd("git", "rev-parse", "HEAD", must=True).stdout.strip()
        self.run_cmd("git", "add", ".", must=True)
        self.run_cmd("git", "commit", "-qm", "change", must=True)
        verified = self.run_cmd("python", "scripts/verify_changes.py", "--base", baseline)
        self.assertEqual(verified.returncode, 0, verified.stderr)

    def test_hash_stale_after_a_second_edit_is_rejected(self):
        self.update_file()
        self.approved_log()
        self.changed_file.write_text(self.changed_file.read_text() + "# unlogged edit\n")
        proc = self.run_cmd("python", "scripts/verify_changes.py")
        self.assertEqual(proc.returncode, 1)
        self.assertIn("after_sha256 mismatch", proc.stderr)


    def test_sync_populates_human_log_with_real_code(self):
        self.update_file()
        self.approved_log()
        # Deliberately strip the code from human log (JSON still has it).
        changelog = self.repo / "docs/changes/CHANGELOG.md"
        changelog.write_text(changelog.read_text().replace(" :: port = 8765", ""))
        self.assertEqual(self.run_cmd("python", "scripts/verify_changes.py").returncode, 1)
        entry = next((self.repo / "docs/changes/entries").glob("*.json"))
        sync = self.run_cmd("python", "scripts/sync_changelog.py", str(entry.relative_to(self.repo)))
        self.assertEqual(sync.returncode, 0, sync.stderr)
        result = self.run_cmd("python", "scripts/verify_changes.py")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_wrong_code_location_is_rejected(self):
        self.update_file()
        self.approved_log()
        entry_path = next((self.repo / "docs/changes/entries").glob("*.json"))
        item = json.loads(entry_path.read_text())
        item["files"][0]["line_range"] = "1-1"
        entry_path.write_text(json.dumps(item))
        proc = self.run_cmd("python", "scripts/verify_changes.py")
        self.assertEqual(proc.returncode, 1)
        self.assertIn("code excerpt not at declared line_range", proc.stderr)


class NestedChangelogGateTests(ChangelogGateTests):
    tool_subdir = "nested/Spine Skin Tool"

    def test_parent_changes_are_out_of_scope(self):
        (self.git_root / "unrelated.txt").write_text("parent change")
        self.update_file()
        self.approved_log()
        proc = self.run_cmd("python", "scripts/verify_changes.py")
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_record_uses_tool_relative_paths_and_before_hash(self):
        (self.git_root / "unrelated.txt").write_text("parent change")
        self.update_file()
        proc = self.run_cmd("python", "scripts/record_change.py", "--task-id", "TASK-M01")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        entry = next((self.repo / "docs/changes/entries").glob("*.json"))
        record = json.loads(entry.read_text(encoding="utf-8"))
        self.assertEqual([f["path"] for f in record["files"]], ["runtime/config/defaults.toml"])
        self.assertEqual(record["files"][0]["before_sha256"], hashlib.sha256(b"[server]\nhost = '127.0.0.1'\n").hexdigest())

    def test_absolute_script_from_parent_has_same_scope(self):
        self.update_file()
        self.approved_log()
        proc = subprocess.run([sys.executable, str(self.repo / "scripts/verify_changes.py")], cwd=self.git_root, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)


if __name__ == "__main__":
    unittest.main()
