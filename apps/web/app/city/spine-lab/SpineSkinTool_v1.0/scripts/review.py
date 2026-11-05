"""Quality review CLI; same operations as the loopback workbench."""
from pathlib import Path
import sys,argparse,json
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.review_service import dispatch
from spine_skin_tool.design import private_path

def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser();commands=parser.add_subparsers(dest='command',required=True)
    create=commands.add_parser('create');create.add_argument('--character',required=True)
    for action in ('capture','report','request','vision'):
        p=commands.add_parser(action);p.add_argument('--review',required=True)
    p=commands.add_parser('import');p.add_argument('--review',required=True);p.add_argument('--input',required=True);p.add_argument('--source',choices=('HUMAN','EXTERNAL_MODEL'),required=True)
    args=parser.parse_args()
    try:
        payload={'character_output':args.character} if args.command=='create' else {'review_id':args.review}
        if args.command=='import':payload.update(data=json.loads(private_path(ROOT,args.input).read_text(encoding='utf-8')),source=args.source)
        result=dispatch(args.command,payload,ROOT)
        if args.command=='request':result={k:result[k] for k in ('review_id','evidence_hash','status','model_calls')}
    except (ValueError,OSError,KeyError,TypeError) as e:
        print(json.dumps({'status':'REQUIRES_REVIEW','code':getattr(e,'code','REVIEW_INVALID'),'message':'入力または証拠を確認してください。以前の候補は保存されています。'},ensure_ascii=False));return 2
    print(json.dumps(result,ensure_ascii=False));return 0

if __name__=='__main__':raise SystemExit(main())
