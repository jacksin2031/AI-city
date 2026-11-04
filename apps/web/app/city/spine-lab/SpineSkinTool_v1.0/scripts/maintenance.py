"""M08 local-only CLI. Model calls exist ONLY in explicit blind-run via pipeline."""
import argparse,json,sys,time,unittest,uuid,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.maintenance import create_archive,verify_archive,restore_archive,fingerprint,inventory
from spine_skin_tool.acceptance import seal,report,artifact,attest
from spine_skin_tool.design import private_path,require,digest
from spine_skin_tool.pipeline_store import atomic


def regression():
    sys.path.insert(0,str(ROOT/'tests'));pin=fingerprint(ROOT);cases=[]
    class Result(unittest.TextTestResult):
        def addSuccess(self,test):super().addSuccess(test);cases.append({'id':test.id(),'status':'PASS'})
        def addFailure(self,test,err):super().addFailure(test,err);cases.append({'id':test.id(),'status':'FAIL'})
        def addError(self,test,err):super().addError(test,err);cases.append({'id':test.id(),'status':'ERROR'})
        def addSkip(self,test,reason):super().addSkip(test,reason);cases.append({'id':test.id(),'status':'NOT_RUN'})
    directory=private_path(ROOT,'runtime/work/M08/regressions/'+uuid.uuid4().hex);directory.mkdir(parents=True);start=time.monotonic()
    with (directory/'tests.log').open('w',encoding='utf-8') as output:r=unittest.TextTestRunner(stream=output,verbosity=2,resultclass=Result).run(unittest.defaultTestLoader.discover(str(ROOT/'tests')))
    require(fingerprint(ROOT)==pin,'REGRESSION_SOURCE_CHANGED')
    status='PASS' if r.wasSuccessful() and not r.skipped else 'FAIL' if not r.wasSuccessful() else 'PARTIAL'
    value={'status':status,'source_fingerprint':pin,'tests_run':r.testsRun,'seconds':time.monotonic()-start,'cases':cases,'scope':'LOCAL_UNIT_AND_INJECTED_FAULTS_NOT_REAL_CLOUD_FAILURES'}
    atomic(directory/'results.json',value)
    seal(ROOT,'regression',{'status':status,'message_ja':'ローカル回帰と注入障害の結果です。クラウド実障害や実停電の試験ではありません。','facts':{'tests':r.testsRun,'seconds':value['seconds'],'scope':value['scope']},'artifacts':[artifact(ROOT,directory/'results.json'),artifact(ROOT,directory/'tests.log')]})
    return {'status':status,'tests_run':r.testsRun,'result':(directory/'results.json').relative_to(ROOT).as_posix()}


def equivalence(results):
    from spine_skin_tool.pipeline_service import report as flow_report
    from spine_skin_tool.review import read_review,review_dir
    from spine_skin_tool.assembly import bundle_zip
    p=private_path(ROOT,results);v=json.loads(p.read_text(encoding='utf-8'));require(v['status']=='PASS' and len(v['rows'])>=3,'EQUIVALENCE_RESULTS');artifacts=[artifact(ROOT,p)]
    for row in v['rows']:
        s=flow_report(ROOT,row['task_id']);r=read_review(ROOT,row['review_id'])
        require(row['mode']=='EXACT_REPLAY' and row['zip_byte_equal'] and s['mode']=='REPLAY' and s['review_id']==row['review_id'],'EQUIVALENCE_BINDING')
        require(not any(s[k] for k in ('design_calls_reserved','image_calls_reserved','visual_calls_reserved')),'EQUIVALENCE_MODEL_CALL')
        require(r['render']['status']=='PASS' and r['render']['frame_count']==246 and r['render']['scales']==[1,2,4],'EQUIVALENCE_RENDER')
        require(bundle_zip(private_path(ROOT,row['source']+'/export/bundle'))==bundle_zip(private_path(ROOT,s['output']+'/export/bundle')),'EQUIVALENCE_BYTES')
        evidence=review_dir(ROOT,row['review_id'])/'evidence/manifest.json';artifacts.append(artifact(ROOT,evidence))
    seal(ROOT,'equivalence',{'status':'PASS','message_ja':'既存素材の再構築・246フレーム・倍率1/2/4が一致しました。新しい写真の生成・美術承認ではありません。','facts':{'characters':len(v['rows']),'frames_per_character':246,'scales':[1,2,4],'new_model_calls':0},'artifacts':artifacts})
    return {'status':'PASS','characters':len(v['rows']),'new_model_calls':0}


def main():
    sys.stdout.reconfigure(encoding='utf-8');sys.stderr.reconfigure(encoding='utf-8')
    p=argparse.ArgumentParser(description='ローカル検証・開発ソースZIP・私用バックアップ');sub=p.add_subparsers(dest='action',required=True)
    for action in ('source','backup'):
        q=sub.add_parser(action);q.add_argument('--output',required=True)
    q=sub.add_parser('verify');q.add_argument('--archive',required=True)
    q=sub.add_parser('restore');q.add_argument('--archive',required=True);q.add_argument('--destination',required=True);q.add_argument('--source-archive')
    sub.add_parser('regression');sub.add_parser('report')
    q=sub.add_parser('equivalence');q.add_argument('--results',required=True)
    q=sub.add_parser('blind-register');q.add_argument('--spec',required=True)
    q=sub.add_parser('retest-register');q.add_argument('--spec',required=True);q.add_argument('--parent',required=True);q.add_argument('--reuse-current-photos',action='store_true')
    q=sub.add_parser('publish-retest');q.add_argument('--id',required=True);q.add_argument('--replaces',required=True);q.add_argument('--archived-read-only',action='store_true')
    q=sub.add_parser('blind-run');q.add_argument('--id',required=True);q.add_argument('--case',type=int,required=True);q.add_argument('--execute-live',action='store_true',required=True)
    q=sub.add_parser('blind-report');q.add_argument('--id',required=True);q.add_argument('--archived-read-only',action='store_true')
    q=sub.add_parser('blind-adjudicate');q.add_argument('--id',required=True);q.add_argument('--case',type=int,required=True);q.add_argument('--labels',required=True);q.add_argument('--human-confirmed',action='store_true',required=True)
    q=sub.add_parser('attest');q.add_argument('--kind',required=True);q.add_argument('--evidence',required=True);q.add_argument('--statement',required=True);q.add_argument('--human-confirmed',action='store_true',required=True)
    args=p.parse_args()
    try:
        if args.action in ('source','backup'):
            value=create_archive(ROOT,args.output,'SOURCE' if args.action=='source' else 'PRIVATE_BACKUP')
            if args.action=='source':
                m=verify_archive(ROOT/args.output);seal(ROOT,'source_package',{'status':'PASS','message_ja':'写真・鍵・依存物・原素材を含まない開発用ソースZIPを検証しました。実行環境同梱インストーラーではありません。','facts':value,'artifacts':[artifact(ROOT,ROOT/args.output)]})
        elif args.action=='verify':
            m=verify_archive(ROOT/args.archive);value={'status':'PASS','kind':m['kind'],'files':len(m['files']),'bytes':m['bytes']}
        elif args.action=='restore':
            value=restore_archive(ROOT,args.archive,args.destination,args.source_archive)
            if value['kind'] in ('PRIVATE_BACKUP','RECOVERED_INSTALLATION'):
                receipt=ROOT/args.destination/'RESTORE-RECEIPT.json';seal(ROOT,'private_restore',{'status':'PASS','message_ja':'新規ディレクトリへ私用データを復元し、全ファイルのSHAを確認しました。現環境への上書き・秘密鍵の復元・自動再送はしていません。','facts':value,'artifacts':[artifact(ROOT,receipt)]})
        elif args.action=='regression':value=regression()
        elif args.action=='equivalence':value=equivalence(args.results)
        elif args.action=='report':value=report(ROOT)
        elif args.action=='blind-register':
            from spine_skin_tool.blind_trials import register
            value=register(ROOT,json.loads(Path(args.spec).read_text(encoding='utf-8'))['cases'])
        elif args.action=='retest-register':
            from spine_skin_tool.blind_trials import register_retest
            value=register_retest(ROOT,json.loads(Path(args.spec).read_text(encoding='utf-8'))['cases'],args.parent,reuse_all=args.reuse_current_photos,one_version=args.reuse_current_photos)
        elif args.action=='publish-retest':
            from spine_skin_tool.blind_display import publish
            value=publish(ROOT,args.id,args.replaces,archived_read_only=args.archived_read_only)
        elif args.action=='blind-run':
            from spine_skin_tool.blind_trials import advance_case
            s=advance_case(ROOT,args.id,args.case);value={'status':s['status'],'phase':s['phase'],'quality_approved':s['quality_approved']}
        elif args.action=='blind-adjudicate':
            from spine_skin_tool.blind_trials import adjudicate
            value=adjudicate(ROOT,args.id,args.case,json.loads(Path(args.labels).read_text(encoding='utf-8'))['labels'],args.human_confirmed)
        elif args.action=='attest':value=attest(ROOT,args.kind,args.evidence,args.statement,args.human_confirmed)
        else:
            from spine_skin_tool.blind_trials import metrics
            value=metrics(ROOT,args.id,allow_archived=args.archived_read_only)
        print(json.dumps(value,ensure_ascii=False));return 0 if value.get('status') not in ('FAIL','ERROR') else 1
    except (ValueError,OSError,KeyError,TypeError,zipfile.BadZipFile,EOFError,RuntimeError) as error:
        print(json.dumps({'status':'NOT_COMPLETED','code':getattr(error,'code','LOCAL_OPERATION_FAILED'),'message_ja':'処理は完了していません。保存先・入力・実行中の作業を確認してください。既存データは上書きしていません。'},ensure_ascii=False));return 2


if __name__=='__main__':raise SystemExit(main())
