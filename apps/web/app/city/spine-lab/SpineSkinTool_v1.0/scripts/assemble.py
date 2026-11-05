"""固定 profile CLI；所有新产物限定在本工具 runtime/work 或 output 内。"""
import argparse
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.assembly import make_profile,build,AssemblyError,verify_bundle,bundle_zip

def output_path(value):
    path=value.resolve()
    if not any(path.is_relative_to(ROOT/'runtime'/area) for area in ('work','output')):raise AssemblyError('OUTPUT_OUTSIDE_RUNTIME')
    return path

def main():
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='command',required=True)
    for command in ('profile','build'):
        p=sub.add_parser(command);p.add_argument('--source',type=Path,required=True);p.add_argument('--atlas',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
        if command=='build':p.add_argument('--parts',type=Path,required=True);p.add_argument('--profile',type=Path,required=True)
    p=sub.add_parser('verify');p.add_argument('--bundle',type=Path,required=True)
    args=parser.parse_args()
    try:
        if args.command=='verify':result=verify_bundle(args.bundle)
        elif args.command=='profile':
            path=output_path(args.out)
            if path.exists():raise AssemblyError('OUTPUT_EXISTS')
            result=make_profile(args.source,args.atlas);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        else:result=build(args.source,args.atlas,args.parts,json.loads(args.profile.read_text(encoding='utf-8')),output_path(args.out))
        print(json.dumps({'status':result.get('status'),'template_revision':result.get('template_revision'),'production_approved':False}));return 0
    except (AssemblyError,OSError,ValueError) as error:
        print(json.dumps({'status':'FAILED','message':'部品、profile と出力先を確認してください。','code':str(error) if isinstance(error,AssemblyError) else 'INVALID_INPUT'},ensure_ascii=True));return 1

if __name__=='__main__':raise SystemExit(main())
