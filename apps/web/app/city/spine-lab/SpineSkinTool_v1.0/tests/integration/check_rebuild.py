"""显式运行的离线重建验收，真实调用 uv/pnpm，不调用模型。"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from verify_changes import git, git_context


def main() -> None:
    workspace = ROOT / "runtime/tmp"
    workspace.mkdir(parents=True, exist_ok=True)
    repository, prefix = git_context(ROOT)
    names = git(repository, "ls-files", "--cached", "--others", "--exclude-standard", "--full-name", "-z", "--", prefix.rstrip("/") or ".").decode("utf-8").split("\0")
    evidence = {"scope": "M01_OFFLINE_REBUILD", "steps": []}
    with tempfile.TemporaryDirectory(prefix="clean rebuild ", dir=workspace) as temp:
        target = Path(temp) / "Spine Tool"
        # TemporaryDirectory cleanup is restricted to this verified workspace path.
        assert Path(temp).resolve().is_relative_to(workspace.resolve())
        target.mkdir()
        for name in names:
            if name and name.startswith(prefix):
                relative = name[len(prefix):]
                source = ROOT / relative
                if source.is_file():
                    destination = target / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, destination)
        locks = ["runtime/python/uv.lock", "runtime/js/pnpm-lock.yaml"]
        hashes = {name: hashlib.sha256((target / name).read_bytes()).hexdigest() for name in locks}
        for kind in ("data", "output"):
            keep = target / f"runtime/{kind}/keep.txt"
            keep.parent.mkdir(parents=True)
            keep.write_text("preserve-user-artifact", encoding="utf-8")
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONUTF8="1", PYTHONIOENCODING="utf-8", UV_PROJECT_ENVIRONMENT=str(Path(temp) / "must-not-create"))

        def run(label, command, expected=0):
            result = subprocess.run(command, cwd=target.parent, env=env, capture_output=True, text=True, encoding="utf-8", timeout=90)
            evidence["steps"].append({"step": label, "exit_code": result.returncode, "expected_exit_code": expected})
            if result.returncode != expected:
                raise AssertionError(f"{label}: {result.stdout}\n{result.stderr}")
            return result

        run("fresh_locked_offline_install", [sys.executable, "-B", str(target / "scripts/bootstrap.py"), "--install"])
        local_python = target / ("runtime/python/.venv/Scripts/python.exe" if os.name == "nt" else "runtime/python/.venv/bin/python")
        run("repeat_install_preserves_data", [str(local_python), "-B", str(target / "scripts/bootstrap.py"), "--install"])
        doctor = run("read_only_doctor", [str(local_python), "-B", str(target / "scripts/doctor.py"), "--json"])
        assert json.loads(doctor.stdout)["status"] == "LOCAL_ENVIRONMENT_READY"
        production = run("production_rejected", [str(local_python), "-B", str(target / "scripts/doctor.py"), "--production", "--json"], 1)
        assert json.loads(production.stdout)["status"] == "NOT_READY"
        run("copied_source_tests", [str(local_python), "-B", "-m", "unittest", "discover", "-s", str(target / "tests"), "-p", "test_*.py", "-v"])
        for name, expected_hash in hashes.items():
            assert hashlib.sha256((target / name).read_bytes()).hexdigest() == expected_hash
        for kind in ("data", "output"):
            assert (target / f"runtime/{kind}/keep.txt").read_text(encoding="utf-8") == "preserve-user-artifact"
        assert not (Path(temp) / "must-not-create").exists()
        lock = target / "runtime/python/uv.lock"
        lock.write_text(lock.read_text(encoding="utf-8").replace('requires-python = "==3.12.10"', 'requires-python = "==3.11.0"'), encoding="utf-8")
        run("stale_lock_rejected", [str(local_python), "-B", str(target / "scripts/bootstrap.py"), "--install"], 1)
        evidence["assertions"] = ["source_lockfiles_unchanged", "data_output_preserved", "inherited_venv_not_used", "space_paths_and_parent_cwd"]
    evidence["status"] = "PASS"
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
