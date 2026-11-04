"""CLI to the same whole-character service as /characters. Private input/output only."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.design import private_path
from spine_skin_tool.pipeline_service import dispatch


def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    p=argparse.ArgumentParser();p.add_argument('action',choices=['create','advance','report','cancel','design','import-photo','retry']);p.add_argument('--input');p.add_argument('--id');p.add_argument('--output');a=p.parse_args()
    try:
        if a.action=='import-photo':
            from spine_skin_tool.photo_import import import_photo,MAX_BYTES
            from spine_skin_tool.design import require
            file=Path(a.input);require(not file.is_symlink() and file.is_file() and file.stat().st_size<=MAX_BYTES,'PHOTO_IMPORT_SIZE');result=import_photo(ROOT,file.read_bytes())
        else:
            payload=json.loads(private_path(ROOT,a.input).read_text(encoding='utf-8')) if a.input else {'id':a.id}
            result=dispatch(a.action,payload,ROOT)
        if a.output:
            path=private_path(ROOT,a.output);path.parent.mkdir(parents=True,exist_ok=True)
            from spine_skin_tool.pipeline_store import atomic
            atomic(path,result)
        print(json.dumps(result,ensure_ascii=False))
        return 1 if result.get('status') in ('STALE','WAIT_RESULT','CONFIGURATION_BLOCKED','ERROR_OR_RESULT_UNKNOWN','OUTPUT_BLOCKED') else 0
    except (ValueError,OSError,KeyError,TypeError) as e:
        print(json.dumps({'code':getattr(e,'code','FLOW_INVALID'),'message':'入力・利用設定・元資料を確認してください。以前の候補は保存されています。'},ensure_ascii=False));return 1


if __name__=='__main__':raise SystemExit(main())
