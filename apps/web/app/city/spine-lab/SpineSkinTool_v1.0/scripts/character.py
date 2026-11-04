"""Thin CLI for the same experimental design/assembly service used by the UI."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.design import draft_design,freeze_design,private_path,DesignError
from spine_skin_tool.character_service import dispatch


def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description='共通設計書と全身構築（画像生成は実行しません）')
    commands=parser.add_subparsers(dest='command',required=True)
    draft=commands.add_parser('draft');draft.add_argument('--photo',required=True);draft.add_argument('--id',default='character');draft.add_argument('--preset',default='short');draft.add_argument('--output',required=True)
    freeze=commands.add_parser('freeze');freeze.add_argument('--input',required=True)
    plan=commands.add_parser('requests');plan.add_argument('--design',required=True)
    assemble=commands.add_parser('assemble');assemble.add_argument('--design',required=True);assemble.add_argument('--output',required=True)
    assemble.add_argument('--raw');assemble.add_argument('--bindings')
    args=parser.parse_args()
    try:
        if args.command=='draft':
            value=dispatch('draft',{'photo':args.photo,'character_id':args.id,'preset':args.preset},ROOT)['design'];path=private_path(ROOT,args.output);path.parent.mkdir(parents=True,exist_ok=True)
            with path.open('x',encoding='utf-8') as stream:stream.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
            result={'status':'EDITABLE_EXAMPLE_NOT_PHOTO_ANALYSIS','output':args.output}
        elif args.command=='freeze':
            value=json.loads(private_path(ROOT,args.input).read_text(encoding='utf-8'));record=dispatch('freeze',{'design':value},ROOT)
            result={'status':record['status'],'design_id':record['design_id']}
        elif args.command=='requests':
            data=dispatch('requests',{'design_id':args.design},ROOT);result={'status':data['status'],'design_id':args.design,'plan_id':data['plan']['plan_id'],'output':data['output'],'parts':list(data['plan']['parts'])}
        else:
            payload={'design_id':args.design,'output':args.output}
            if args.raw:payload['raw_directory']=args.raw
            if args.bindings:payload['bindings']=json.loads(private_path(ROOT,args.bindings).read_text(encoding='utf-8'))
            result=dispatch('assemble',payload,ROOT)
    except (ValueError,OSError,KeyError,TypeError) as error:
        print(json.dumps({'status':'FAILED_PREVIOUS_CANDIDATE_PRESERVED','code':getattr(error,'code','CHARACTER_INVALID'),'message':'設計書・写真・入力素材を確認してください。以前の候補は保存されています。'},ensure_ascii=False));return 2
    print(json.dumps(result,ensure_ascii=False));return 0


if __name__=='__main__':raise SystemExit(main())
