"""Single UI/CLI pipeline entry, persisted previews, no implicit external calls."""
import json,threading
from pathlib import Path
from .design import ROOT,require,keys,private_path,digest
from .pipeline_store import read,directory,lease,cancel as cancel_flow
from .pipeline import create,advance,edit_design,totals,context,DEFAULTS,retry_unavailable,retry_evidence

ACTIVE=set();LOCK=threading.Lock()


def report(root,identity):
    s=read(root,identity);result={**s,**totals(root,s)}
    try:
        context(root,s)
        if s['phase']=='DONE' and s['best_output']:
            from .review import read_review
            rid=s['review_id']
            if s['repair_id']:
                from .repair_store import read as read_repair
                rid=read_repair(root,s['repair_id'])['best_review']
            read_review(root,rid)
    except (ValueError,OSError,KeyError,TypeError) as e:result.update(status='STALE',quality_approved=False,error_code=getattr(e,'code','FLOW_SOURCE_UNAVAILABLE'))
    with LOCK:result['worker_active']=identity in ACTIVE
    if not result['worker_active'] and s['status']=='RUNNING':
        try:
            with lease(root,identity):pass
        except ValueError as e:
            if getattr(e,'code',None)=='REPAIR_BUSY':result['worker_active']=True
            else:raise
        if not result['worker_active'] and result['status']!='STALE':result['status']='INTERRUPTED'
    result['previews']=[{**c,'url':'/flow-view/'+identity+'/'+c['manifest_sha256']+'/'} for c in s['candidates']]
    result['best_preview_url']='/flow-view/'+identity+'/'+s['best_manifest_sha256']+'/' if s['best_manifest_sha256'] else None
    if s.get('versions',{}).get('workflow') in ('photo-to-skin-shared-012','photo-to-skin-shared-013','photo-to-skin-shared-014'):
        from .production_timing import summary
        try:result['timing']=summary(root,identity)
        except (ValueError,OSError,KeyError,TypeError):result['timing']=None
    reason=retry_evidence(root,s) if result['status']!='STALE' else None
    result['can_retry_generation']=bool(reason);result['retry_reason']=reason['outcome'] if reason else None
    if s['repair_id']:
        from .repair_store import read as read_repair
        r=read_repair(root,s['repair_id']);result['repair_summary']={k:r.get(k) for k in ('id','status','phase','error_code','quality_approved')};result['repair_url']='/repairs?task='+r['id']
        statuses={a.get('manifest_sha256'):a['status'] for a in r['attempts']}
        for candidate in result['previews']:
            if candidate['kind']=='REPAIR':candidate['candidate_status']=statuses.get(candidate['manifest_sha256'],'UNKNOWN')
    hair_view=s['mode']=='HAIR_REFRESH'
    if s['mode']=='REPLAY' and s.get('best_output'):
        policy_path=private_path(root,s['best_output']+'/export/bundle/orientation-policy.json')
        hair_view=json.loads(policy_path.read_text(encoding='utf-8')).get('ear_mode')=='INTEGRATED_SMALL_EARS_IN_HAIR'
    if hair_view:
        result['hair_trials']=hair_trials(root,s,result['previews'])
    return result


def hair_trials(root,s,previews):
    """All real attempts, including no-image failures, with evidence-bound causes."""
    from .review import read_review
    initial=s['jobs'] if s['mode']!='REPLAY' else {p:j for p,j in s.get('replay_jobs',{}).items() if p.startswith('HAIR')}
    attempts=[{'cycle':0,'jobs':initial,'status':s['status'],'output':s['output'],'new_image_generation':s['mode']!='REPLAY'}]
    if s.get('repair_id'):
        from .repair_store import read as read_repair
        attempts.extend({'cycle':a['number'],'jobs':a['jobs'],'status':a['status'],'output':a['output']} for a in read_repair(root,s['repair_id'])['attempts'])
    for a in attempts:
        a['images']=[]
        for part,job in a['jobs'].items():
            path=private_path(root,'runtime/work/M04/generation/jobs/'+job+'/report.json')
            r=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
            a['images'].append({'part':part,'job_id':job,'url':'/generation/image/'+job if r.get('image_sha256') else None,'status':r.get('status','RESERVED_RESULT_UNKNOWN'),'reason_ja':r.get('error_code','')})
        candidate=next((c for c in previews if c['output']==a['output']),None)
        a.update(candidate=candidate,verdict='UNKNOWN',reasons=[])
        if candidate:
            from .appearance_opinions import lookup
            try:a['user_opinion']=lookup(root,s['id'],candidate['manifest_sha256'])
            except (ValueError,OSError,KeyError,TypeError):a['user_opinion_error']='外観確認記録を検証できません。合格扱いにはしません。'
        if not candidate:
            a['reasons']=[{'part':'CHARACTER','code':'NO_ASSEMBLED_RESULT','message_ja':'組立結果はありません。生成成功・不合格とは別の状態です。'+('後続処理は取り消されています。' if s['status']=='CANCELLED' else '画像エラーまたは保存作業の状態を確認してください。')}];continue
        try:
            r=read_review(root,candidate['review_id']);visual=r['visual_reviews'][-1]['data'] if r['visual_reviews'] else None
            a['hard_status']=r['hard']['status'];a['render_status']=r['render']['status'];a['frame_count']=r['render'].get('frame_count',0)
            a['reasons']=[*r['hard']['defects'],*r['render']['defects'],*(visual['defects'] if visual else [])]
            if r['render']['status']=='ERROR':
                a['reasons'].append({'code':r['render'].get('error_code','RENDER_FAILED'),'part':'CHARACTER','message_ja':'ローカルの動作図証収集に失敗しました。素材の美術不合格とは判定していません。保存作業から画像再生成なしで図証を再収集できます。'})
            a['superseded_reviews']=s.get('superseded_reviews',[]) if a['cycle']==0 else []
            a['checks']=visual['checks'] if visual else []
            if any(c['category']=='hair_consistency' and c['result']=='PASS' and c.get('confidence',0)>=.9 for c in a['checks']):
                for reason in a['reasons']:
                    if reason.get('part')=='HAIR_BACK' and reason['code'] in ('STYLE_DRIFT','NOISY_TEXTURE'):
                        reason['scope_note_ja']='前後の描画一致は確認されています。後髪単体と原作参考との差だけでは、現行ルールの自動返修理由にしません。この補助指摘は再確認対象です。'
            from .review import policy
            floor=policy()['visual_confidence_floor']
            focused=[c for c in a['checks'] if c['category'] in ('hair_fit','hair_consistency','ear_visibility','style')]
            defects=[d for d in a['reasons'] if d.get('part') in ('HAIR_FRONT','HAIR_BACK') and d.get('result')!='UNKNOWN' and d.get('confidence',0)>=floor]
            if r['hard']['status']=='FAIL' or r['render']['status']=='FAIL' or defects or any(c['result']=='FAIL' and c.get('confidence',0)>=floor for c in focused):a['verdict']='FAIL'
            elif len(focused)==4 and all(c['result']=='PASS' and c.get('confidence',0)>=floor for c in focused) and r['hard']['status']!='FAIL' and r['render']['status']=='PASS':a['verdict']='ADVISORY_PASS_NOT_APPROVED'
            if not visual:a['reasons'].append({'part':'CHARACTER','code':'VISUAL_NOT_COMPLETED','message_ja':'視覚レビュー未完了。成功とは判定していません。'})
            a['quality_approved']=False
        except (ValueError,OSError,KeyError,TypeError) as error:
            a['reasons'].append({'code':getattr(error,'code','REVIEW_UNAVAILABLE'),'message_ja':'保存済みレビューを検証できません。未確認です。'})
    return attempts


def configuration(root=ROOT):
    from .character_service import configuration as characters
    from .review_service import configuration as reviews
    from .photo_design import settings as design_settings
    from .generation import settings as generation_settings
    from .review_visual import review_settings
    c=characters(root);tasks=[];folder=private_path(root,'runtime/work/M07/tasks')
    if folder.is_dir():
        for path in sorted(folder.glob('flow-*/events'))[-200:]:
            try:
                s=read(root,path.parent.name);tasks.append({k:s[k] for k in ('id','status','character_id','mode','photo')})
            except (ValueError,OSError,KeyError,TypeError):continue
    d,g,v=design_settings(root),generation_settings(root),review_settings(root)
    def budget(enabled,cap,path,pattern):
        used=len(list(private_path(root,path).glob(pattern)));return {'enabled':enabled,'max_calls':cap,'reserved':used,'remaining':max(0,cap-used)}
    return {'photos':c['photos'],'sources':reviews(root)['characters'],'tasks':tasks,'limits':DEFAULTS,
        'budgets':{'design':budget(d['live_enabled'] and d['upload_consent'],d['max_live_calls'],'runtime/work/M07/design-calls','design-call-*.reserved'),
        'image':budget(g['live_enabled'] and g['upload_consent'],g['max_live_calls'],'runtime/work/M04/generation/jobs','codex-call-*.reserved'),
        'visual':budget(v['live_enabled'] and v['upload_consent'],v['max_live_calls'],'runtime/work/M05/reviews','review-call-*.reserved')}}


def preview(root,identity,token):
    s=read(root,identity);c=next((c for c in s['candidates'] if c['manifest_sha256']==token),None)
    require(c is not None,'FLOW_VIEW_TOKEN');bundle=private_path(root,c['output']+'/export/bundle');require(digest(bundle/'build-manifest.json')==token,'FLOW_VIEW_CHANGED');return bundle


def dispatch(action,payload,root=ROOT,background=False):
    root=Path(root).resolve()
    if action=='create':return create(root,payload)
    if action=='design':keys(payload,('id','design'),'FLOW_REQUEST_KEYS');return edit_design(root,payload['id'],payload['design'])
    if action=='standard-ears':
        keys(payload,('id','ear_observation'),'FLOW_REQUEST_KEYS')
        from .ear_service import apply
        return apply(root,payload['id'],payload['ear_observation'])
    keys(payload,('id',),'FLOW_REQUEST_KEYS');identity=payload['id']
    if action=='report':return report(root,identity)
    if action=='retry':return retry_unavailable(root,identity)
    if action=='resume-hair-scope':
        from .pipeline import resume_hair_scope
        return resume_hair_scope(root,identity)
    if action=='reassess-ear-stage':
        from .pipeline import reassess_ear_stage
        return reassess_ear_stage(root,identity)
    if action=='cancel':
        result=cancel_flow(root,identity);s=read(root,identity)
        if s.get('repair_id'):
            from .repair_store import cancel
            cancel(root,s['repair_id'])
        return result
    require(action=='advance','FLOW_ACTION');read(root,identity)
    if not background:return advance(root,identity)
    with LOCK:require(identity not in ACTIVE,'FLOW_BUSY');ACTIVE.add(identity)
    def worker():
        try:advance(root,identity)
        finally:
            with LOCK:ACTIVE.discard(identity)
    threading.Thread(target=worker,daemon=True).start();return {'id':identity,'status':'RUNNING'}
