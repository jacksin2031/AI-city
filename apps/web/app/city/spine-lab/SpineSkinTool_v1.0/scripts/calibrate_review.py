"""Prepare/freeze/score/run normative review calibration. Real runs must be explicit."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.review_benchmark import prepare,score,run,request,folder,save

def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    p=argparse.ArgumentParser();p.add_argument('action',choices=('prepare','score','request','run'));p.add_argument('--benchmark');p.add_argument('--batch',type=int);a=p.parse_args()
    try:
        if a.action=='prepare':result=prepare(ROOT)
        elif a.action=='score':result=score(ROOT,a.benchmark)
        elif a.action=='request':
            req=request(ROOT,a.benchmark,a.batch);save(folder(ROOT,a.benchmark)/('batch-'+str(a.batch)+'-preview.json'),req);print(json.dumps({'status':'REQUEST_ONLY_NO_MODEL_CALL','model_calls':0}));return 0
        else:result=run(ROOT,a.benchmark,a.batch)
        print(json.dumps({k:result[k] for k in ('benchmark_id','status','summary','model_release_decision')},ensure_ascii=False))
        return 0 if a.action!='run' or any(c['batch']==a.batch and c['status']=='COMPLETED' for c in result['calls']) else 2
    except (ValueError,OSError,KeyError,TypeError) as e:
        print(json.dumps({'status':'REQUIRES_REVIEW','code':getattr(e,'code',type(e).__name__),'message':'校正の入力・証拠・利用設定を確認してください。自動再試行は行いません。'},ensure_ascii=False));return 2
if __name__=='__main__':raise SystemExit(main())
