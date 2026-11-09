import sys, traceback
from pathlib import Path
tool = Path(sys.argv[1])
sys.path.insert(0, str(tool / "src"))
print("SRC_EXISTS", (tool / "src").exists())
try:
    from spine_skin_tool.reference_assets import verify_bundled
    print("IMPORTED")
    r = verify_bundled(tool)
    print("READY", len(r["files"]))
except Exception as e:
    print("TYPE", type(e).__name__, "CODE", getattr(e,"code",None))
    traceback.print_exc(limit=4)
