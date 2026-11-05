"""Compatibility entry: shared original-head/ear template preparation."""
from pathlib import Path
import sys,json
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.mother import prepare
if __name__=='__main__':
    source,atlas,inputs,profile=prepare(ROOT)
    print(json.dumps({'status':'PREPARED_EXPERIMENTAL','source':str(source),'atlas':str(atlas),'inputs':str(inputs),'profile':str(profile)}))
