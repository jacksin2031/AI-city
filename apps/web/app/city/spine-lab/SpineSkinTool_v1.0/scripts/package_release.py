"""Audit/build the public source allowlist; never packages private runtime state."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.distribution import audit,build

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path);p.add_argument('--report',type=Path);a=p.parse_args()
    try:
        value=build(ROOT,a.output) if a.output else audit(ROOT)
        if a.report:
            path=a.report.resolve()
            if not path.is_relative_to(ROOT/'runtime/output/M08'):raise ValueError('REPORT_PATH')
            path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'status':value['status'],'files':len(value['files']) if isinstance(value['files'],dict) else value['files'],'credentials_included':False}));raise SystemExit(0)
    except (OSError,ValueError,KeyError):
        print(json.dumps({'status':'NOT_PACKAGED','message_ja':'公開用のファイル一覧・内容・保存先を確認してください。秘密情報は表示していません。'},ensure_ascii=False));raise SystemExit(1)
