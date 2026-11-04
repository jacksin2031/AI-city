"""Local config only. Never reads, copies, logs or embeds authentication tokens."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.codex_subscription import login_status

def configure(root,enable=False,calls=24):
    root=Path(root).resolve();folder=root/'runtime/secrets'
    if folder.is_symlink() or not folder.resolve().is_relative_to(root):raise ValueError('CONFIG_PATH')
    folder.mkdir(parents=True,exist_ok=True)
    for name in ('providers','design','review'):
        path=folder/(name+'.json')
        if path.is_symlink():raise ValueError('CONFIG_PATH')
        value=json.loads(path.read_text(encoding='utf-8')) if path.exists() else json.loads((root/'runtime/config'/(name+'.example.json')).read_text(encoding='utf-8'))
        if enable:
            value.update(live_enabled=True,upload_consent=True,max_live_calls=calls)
        # Initialisation never silently disables or resets an existing budget/config.
        if enable or not path.exists():path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return {'status':'CONFIGURED','live_enabled_requested':enable,'model_calls':0}

if __name__=='__main__':
    p=argparse.ArgumentParser(description='購読用のローカル設定（実行・ログインは行いません）');p.add_argument('--enable',action='store_true',help='写真アップロードと購読利用を明示的に許可');p.add_argument('--max-calls',type=int,default=24);a=p.parse_args()
    try:
        if not 1<=a.max_calls<=1000000:raise ValueError('LIMIT')
        result=configure(ROOT,a.enable,a.max_calls);result['chatgpt_login']=login_status({'executable':'codex'});print(json.dumps(result));raise SystemExit(0)
    except (OSError,ValueError,KeyError):
        print(json.dumps({'status':'NOT_CONFIGURED','message_ja':'設定ファイルと権限を確認してください。認証情報は表示していません。'},ensure_ascii=False));raise SystemExit(1)
