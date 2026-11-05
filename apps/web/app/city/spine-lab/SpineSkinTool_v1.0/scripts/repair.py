"""CLI for the shared durable M06 repair core."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.repair_service import dispatch
from spine_skin_tool.design import private_path

def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    p=argparse.ArgumentParser();p.add_argument('action',choices=('create','advance','report','cancel'));p.add_argument('--review');p.add_argument('--id');p.add_argument('--options');p.add_argument('--parts',nargs='+');a=p.parse_args()
    try:
        payload={'review_id':a.review} if a.action=='create' else {'id':a.id}
        if a.action=='create':
            if a.options:payload['limits']=json.loads(private_path(ROOT,a.options).read_text(encoding='utf-8'))
            if a.parts:payload['parts']=a.parts
        result=dispatch(a.action,payload,ROOT);print(json.dumps(result,ensure_ascii=False));return 2 if result['status'] in ('STALE','ERROR_OR_RESULT_UNKNOWN','WAIT_RESULT','OUTPUT_BLOCKED') else 0
    except (ValueError,OSError,KeyError,TypeError) as error:
        print(json.dumps({'status':'REQUIRES_REVIEW','code':getattr(error,'code','REPAIR_INVALID'),'message':'返修の入力・元資料・保存済み作業を確認してください。以前の候補は保存されています。'},ensure_ascii=False));return 2
if __name__=='__main__':raise SystemExit(main())
