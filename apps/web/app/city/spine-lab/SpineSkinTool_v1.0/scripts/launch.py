"""Launch the bundled-reference tool, reusing each operator's own CLI login."""
import argparse,importlib.util,json,os,subprocess,sys,threading,time,urllib.request,webbrowser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))

def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    p=argparse.ArgumentParser(description='同梱の参考素材で制作画面を起動');p.add_argument('--subscription',action='store_true',help='本人のChatGPTログイン・写真送信設定を利用（開始ボタンを押すまで生成なし）');p.add_argument('--check-only',action='store_true');p.add_argument('--open-browser',action='store_true');p.add_argument('--port',type=int,default=8783);a=p.parse_args()
    from spine_skin_tool.environment import venv_python,process_env
    venv=venv_python(ROOT)
    if not venv.is_file():
        print('先に使用説明に従って scripts/bootstrap.py --install --online を実行してください。');return 1
    if Path(sys.executable).resolve()!=venv.resolve():return subprocess.call([str(venv),'-B',str(Path(__file__).resolve()),*sys.argv[1:]],cwd=ROOT)
    from spine_skin_tool.reference_assets import inspect
    from spine_skin_tool.codex_subscription import login_status,executable,clean_environment
    try:
        references=inspect(ROOT);spec={'executable':'codex'};signed_in=login_status(spec)
        if a.check_only:
            print(json.dumps({'status':'READY' if signed_in else 'CHATGPT_LOGIN_REQUIRED','references':references,'chatgpt_login':signed_in,'model_calls':0}));return 0 if signed_in else 1
        if not 1024<=a.port<=65535:raise ValueError('PORT')
        if a.subscription:
            if not signed_in:
                if subprocess.call([executable(spec),'login'],env=clean_environment())!=0 or not login_status(spec):
                    print('本人のChatGPTアカウントで codex login を完了してください。');return 1
            module_spec=importlib.util.spec_from_file_location('subscription_setup',ROOT/'scripts/configure_subscription.py');module=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(module)
            module.configure(ROOT,enable=True,calls=24,preserve_existing_limits=True)
        url=f'http://127.0.0.1:{a.port}/characters';print(url,flush=True)
        if a.open_browser:
            def show():
                for _ in range(60):
                    try:
                        with urllib.request.urlopen(url,timeout=1) as response:
                            if response.status==200:webbrowser.open(url);return
                    except OSError:pass
                    time.sleep(.5)
            threading.Thread(target=show,daemon=True).start()
        return subprocess.call([str(venv),'-B',str(ROOT/'scripts/start_trials.py'),'--port',str(a.port)],cwd=ROOT,env=process_env(ROOT))
    except (OSError,ValueError,KeyError):
        print('参考素材・本人のログイン・利用環境を確認してください。既存データや送信記録は消していません。');return 1

if __name__=='__main__':raise SystemExit(main())
