import hashlib
import subprocess
import sys
from pathlib import Path

python, prepare, tool, root, task = sys.argv[1:]
digest = hashlib.sha256((Path(root) / task / "photo.png").read_bytes()).hexdigest()
for n in (1, 2):
    out = subprocess.run([python, "-B", prepare, tool, root, task], input=digest.encode("ascii"), capture_output=True, timeout=90, check=False)
    print("ATTEMPT", n, "EXIT", out.returncode, "STDOUT", out.stdout.decode("utf-8", "replace").strip()[:300], "STDERR_PRESENT", bool(out.stderr), flush=True)
