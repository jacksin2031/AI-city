"""Shared HTTP/CLI quality-review operations. No implicit cloud review."""
import hashlib,json,threading
from pathlib import Path
from .design import ROOT,keys,require,private_path,DesignError
from .review import create_review,read_review,review_dir,policy
from .review_render import collect_evidence
from .assembly import canonical

ACTIVE=set();ACTIVE_LOCK=threading.Lock()


def public_report(root,report):
    """Advertise only recorded evidence images, including older incomplete captures."""
    images=[]
    if report['render'].get('evidence_hash'):
        try:
            file=private_path(root,(review_dir(root,report['review_id'])/'evidence/manifest.json').relative_to(root).as_posix())
            manifest=json.loads(file.read_text(encoding='utf-8'));expected=manifest.pop('evidence_hash')
            require(expected==report['render']['evidence_hash']==hashlib.sha256(canonical(manifest)).hexdigest(),'EVIDENCE_BINDING')
            images=[name for name in ('overview.png','near-head.png','near-body.png','parts-sheet.png','head-height-guide.png','ear-layer-guide.png') if name in manifest['files']]
        except (ValueError,OSError,KeyError,TypeError):pass
    return {**report,'evidence_images':images}


def configuration(root=ROOT):
    root=Path(root).resolve();characters=[]
    sources=[]
    for name,pattern in [('runtime/work/M04/character-flow/exports','*/design.json'),('runtime/work/M04/shared-flow-20261101','*/design.json'),('runtime/work/M05/corrected','*/design.json'),
        ('runtime/work/M07/tasks','flow-*/candidate-initial/design.json'),('runtime/work/M06/tasks','repair-*/attempts/*/candidate/design.json')]:
        base=private_path(root,name)
        if base.is_dir():sources.extend(base.glob(pattern))
    from .design import load_design
    valid={}
    for path in sorted(set(sources))[-500:]:
        try:
            safe=private_path(root,path.relative_to(root).as_posix());record=json.loads(safe.read_text(encoding='utf-8'));identity=record['design_id']
            if identity not in valid:valid[identity]=load_design(root,identity)
            require(valid[identity]==record,'CHARACTER_CATALOG_DESIGN')
            characters.append({'output':safe.parent.relative_to(root).as_posix(),'character_id':record['design']['character_id']})
        except (ValueError,OSError,KeyError,TypeError):continue
    reviews=[];folder=private_path(root,'runtime/work/M05/reviews')
    if folder.is_dir():
        for path in sorted(folder.glob('review-*/report.json'))[-100:]:
            try:
                r=read_review(root,path.parent.name,fresh=False);reviews.append({k:r[k] for k in ('review_id','character_id','status')})
            except (ValueError,OSError,KeyError,TypeError):continue
    from .review_visual import review_settings
    visual=review_settings(root);reserved=len(list(folder.glob('review-call-*.reserved'))) if folder.is_dir() else 0;visual['remaining_calls']=max(0,visual['max_live_calls']-reserved)
    from .review_benchmark import listing
    return {'characters':characters,'reviews':reviews,'policy':policy(),'cloud_review_default':'NOT_RUN','visual_settings':visual,'calibrations':listing(root)}


def dispatch(action,payload,root=ROOT,background=False):
    root=Path(root).resolve()
    if action=='create':keys(payload,('character_output',),'REVIEW_REQUEST_KEYS');return create_review(root,payload['character_output'])
    if action in ('report','capture','request','vision'):
        keys(payload,('review_id',),'REVIEW_REQUEST_KEYS')
        if action=='report':
            try:return public_report(root,read_review(root,payload['review_id']))
            except DesignError as error:
                if not error.code.startswith('REVIEW_STALE'):raise
                r=read_review(root,payload['review_id'],fresh=False);return public_report(root,{**r,'status':'REQUIRES_REVIEW','stale_code':error.code})
        if action in ('request','vision'):
            from .review_visual import visual_request,run_visual
            if action=='request':return visual_request(root,payload['review_id'])
            if not background:return run_visual(root,payload['review_id'])
            identity=payload['review_id']
            # Validate evidence/config before starting a background model job.
            visual_request(root,identity)
            from .review_visual import review_settings
            cfg=review_settings(root);require(cfg['live_enabled'] and cfg['upload_consent'],'REVIEW_LIVE_DISABLED')
            with ACTIVE_LOCK:
                require(not ACTIVE,'REVIEW_BUSY');ACTIVE.add(identity)
            def visual_work():
                try:run_visual(root,identity)
                except (ValueError,OSError,KeyError,TypeError) as error:
                    from .review import LOCK,save_report,aggregate
                    with LOCK:
                        r=read_review(root,identity,fresh=False);r['visual_call'].update(status='ERROR_OR_RESULT_UNKNOWN_NO_RETRY',error_code=getattr(error,'code','VISUAL_INVALID'));r['status']=aggregate(r);save_report(root,r)
                finally:
                    with ACTIVE_LOCK:ACTIVE.discard(identity)
            threading.Thread(target=visual_work,daemon=True).start();return {'review_id':identity,'status':'RUNNING'}
        identity=payload['review_id'];read_review(root,identity)
        if not background:return collect_evidence(root,identity)
        with ACTIVE_LOCK:
            require(identity not in ACTIVE and not ACTIVE,'RENDER_BUSY')
            require(not (review_dir(root,identity)/'render.started').exists(),'RENDER_ALREADY_STARTED');ACTIVE.add(identity)
        def work():
            try:collect_evidence(root,identity)
            except (ValueError,OSError,KeyError,TypeError) as error:
                from .review import LOCK,save_report,aggregate,finding
                with LOCK:
                    r=read_review(root,identity,fresh=False);r['render']={'status':'ERROR','defects':[finding('RENDER_FAILED',result='UNKNOWN')],'error_code':getattr(error,'code','RENDER_INVALID')};r['status']=aggregate(r);save_report(root,r)
            finally:
                with ACTIVE_LOCK:ACTIVE.discard(identity)
        threading.Thread(target=work,daemon=True).start()
        return {'review_id':identity,'status':'RUNNING'}
    if action=='import':
        keys(payload,('review_id','data','source'),'REVIEW_REQUEST_KEYS')
        require(payload['source'] in ('HUMAN','EXTERNAL_MODEL'),'REVIEW_SOURCE')
        from .review_visual import import_visual
        return public_report(root,import_visual(root,payload['review_id'],payload['data'],payload['source']))
    raise DesignError('REVIEW_ACTION')
