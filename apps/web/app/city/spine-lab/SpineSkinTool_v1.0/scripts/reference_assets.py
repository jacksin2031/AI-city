"""Import only the required licensed reference files into ignored local storage."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.reference_assets import import_library,inspect

if __name__=='__main__':
    p=argparse.ArgumentParser(description='私用の正規参考素材を準備');p.add_argument('--source',type=Path);a=p.parse_args()
    try:
        print(json.dumps(import_library(ROOT,a.source) if a.source else inspect(ROOT)));raise SystemExit(0)
    except (OSError,ValueError,KeyError):
        print(json.dumps({'status':'NOT_READY','message_ja':'必要な正規参考素材を確認できません。使用説明の素材構成を確認してください。既存素材は上書きしていません。'},ensure_ascii=False));raise SystemExit(1)
