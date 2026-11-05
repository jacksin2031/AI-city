"""Real local fixed-input equivalence/capture via the public pipeline service. No models."""
import argparse,json,sys,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.pipeline_service import dispatch
from spine_skin_tool.pipeline import DEFAULTS
from spine_skin_tool.design import private_path,digest
from spine_skin_tool.review import read_review,hard_checks
from spine_skin_tool.pipeline_store import atomic
from spine_skin_tool.assembly import bundle_zip,canonical


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',action='append',required=True);p.add_argument('--auto-fit',action='store_true');a=p.parse_args()
    folder=private_path(ROOT,'runtime/work/M07/validation-'+uuid.uuid4().hex);folder.mkdir(parents=True);rows=[]
    for source in a.source:
        original=private_path(ROOT,source);before=digest(original/'export/bundle/build-manifest.json')
        s=dispatch('create',{'mode':'REPLAY','source_output':source,'auto_fit':a.auto_fit,'limits':{**DEFAULTS,'max_repair_cycles':0}},ROOT)
        print(json.dumps({'task_id':s['id'],'status':'STARTED_LOCAL_REPLAY','source':source}),flush=True)
        s=dispatch('advance',{'id':s['id']},ROOT);report=dispatch('report',{'id':s['id']},ROOT);review=read_review(ROOT,s['review_id'])
        assert not any(report[k] for k in ('design_calls_reserved','image_calls_reserved','visual_calls_reserved'))
        assert review['render']['status']=='PASS' and review['render']['frame_count']==246,review['render']
        assert not s['quality_approved'] and digest(original/'export/bundle/build-manifest.json')==before
        equal=bundle_zip(original/'export/bundle')==bundle_zip(private_path(ROOT,s['output'])/'export/bundle')
        if not a.auto_fit:
            assert equal,'FIXED_INPUT_BYTES_CHANGED'
            hard=hard_checks(ROOT,source)[0];assert canonical(hard)==canonical(review['hard']),'FIXED_INPUT_HARD_JUDGEMENT_CHANGED'
        row={'task_id':s['id'],'character_id':s['character_id'],'mode':'AUTO_FIT_REPLAY' if a.auto_fit else 'EXACT_REPLAY','source':source,'status':s['status'],'zip_byte_equal':equal,
            'review_id':s['review_id'],'render_frames':246,'render_status':review['render']['status'],'hard_status':review['hard']['status'],'quality_approved':False,'model_calls':0,'preview_url':report['best_preview_url']}
        rows.append(row);atomic(folder/'results.json',{'status':'PASS','rows':rows});print(json.dumps(row),flush=True)
    print(json.dumps({'status':'PASS','results':(folder/'results.json').relative_to(ROOT).as_posix(),'characters':len(rows),'model_calls':0}),flush=True)
    return 0


if __name__=='__main__':raise SystemExit(main())
