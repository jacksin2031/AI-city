"""Shared CLI/HTTP repair operations; all live execution is explicit and bounded."""
import json,threading
from pathlib import Path
from .design import ROOT,keys,require,private_path,digest
from .repair_store import directory,read,cancel,lease
from .repair import create,advance,task_report,DEFAULTS
from .review import review_dir,policy

ACTIVE=set();LOCK=threading.Lock()


def configuration(root=ROOT):
    folder=private_path(root,'runtime/work/M06/tasks');tasks=[]
    if folder.is_dir():
        for path in folder.glob('repair-*/events'):
            try:
                s=read(root,path.parent.name);tasks.append({k:s[k] for k in ('id','status','design_id')})
            except (ValueError,OSError,KeyError,TypeError):continue
    from .review_service import configuration as reviews
    return {'limits':DEFAULTS,'tasks':tasks,'reviews':[r for r in reviews(root)['reviews'] if json.loads((review_dir(root,r['review_id'])/'report.json').read_text(encoding='utf-8')).get('quality_policy')==policy()['revision']]}


def preview(root,identity,token):
    s=read(root,identity);ctx=json.loads((directory(root,identity)/'context.json').read_text(encoding='utf-8'))
    # The original manifest SHA is pinned by the source review context.
    source=json.loads((review_dir(root,s['source_review'])/'context.json').read_text(encoding='utf-8'))
    candidates=[(ctx['base_output'],source['source_files']['export/bundle/build-manifest.json'])]
    candidates.extend((a['output'],a.get('manifest_sha256')) for a in s['attempts'])
    output=next((p for p,h in candidates if h==token),None);require(output is not None,'REPAIR_VIEW_TOKEN')
    bundle=private_path(root,output+'/export/bundle');require(digest(bundle/'build-manifest.json')==token,'REPAIR_VIEW_CHANGED');return bundle


def dispatch(action,payload,root=ROOT,background=False):
    root=Path(root).resolve()
    if action=='create':
        require(isinstance(payload,dict) and {'review_id'}<=set(payload) and not set(payload)-{'review_id','limits','parts'},'REPAIR_REQUEST_KEYS')
        return create(root,payload['review_id'],payload.get('limits'),payload.get('parts'))
    keys(payload,('id',),'REPAIR_REQUEST_KEYS');identity=payload['id']
    if action=='report':
        result=task_report(root,identity)
        with LOCK:result['worker_active']=identity in ACTIVE
        if not result['worker_active'] and result['status']=='RUNNING':
            try:
                with lease(root,identity):pass
            except ValueError as e:
                if getattr(e,'code',None)=='REPAIR_BUSY':result['worker_active']=True
                else:raise
            if not result['worker_active']:result['status']='INTERRUPTED'
        return result
    if action=='cancel':return cancel(root,identity)
    require(action=='advance','REPAIR_ACTION')
    read(root,identity)
    if not background:return advance(root,identity)
    with LOCK:require(identity not in ACTIVE,'REPAIR_BUSY');ACTIVE.add(identity)
    def worker():
        try:advance(root,identity)
        finally:
            with LOCK:ACTIVE.discard(identity)
    threading.Thread(target=worker,daemon=True).start();return {'id':identity,'status':'RUNNING'}
