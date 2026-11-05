"""Read-only, batch-bound original-photo comparison. No generation or approval."""
import json,re,time
from .blind_trials import load,folder,metrics
from .design import photo_path,private_path,require,digest
from .pipeline_service import report,preview
from .review import read_review,review_dir
from .pipeline_store import atomic,read as read_flow


def photo(root,identity,number,sha):
    batch=load(root,identity,verify_source=False)
    require(type(number) is int and 1<=number<=len(batch['cases']),'BLIND_CASE_NUMBER')
    case=batch['cases'][number-1];p=photo_path(root,case['photo'])
    require(case['photo_sha256']==sha and digest(p)==sha,'BLIND_DISPLAY_PHOTO_CHANGED')
    return p


def returned(root,task):
    rows=[]
    for part,job in task['jobs'].items():
        require(part in ('HAIR_FRONT','HAIR_BACK','BODY_FRONT','BODY_BACK','LEG_FRONT','LEG_BACK','SKIRT_FRONT','SKIRT_BACK') and re.fullmatch(r'job-[a-f0-9]{32}',job),'BLIND_DISPLAY_JOB')
        p=private_path(root,'runtime/work/M04/generation/jobs/'+job);file=p/'report.json'
        if not file.is_file():rows.append({'part':part,'status':'NOT_RETURNED','sha256':None});continue
        r=json.loads(file.read_text(encoding='utf-8'));require(r['id']==job and r['flow_id']==task['id'] and r['part']==part,'BLIND_DISPLAY_JOB_BINDING')
        sha=None
        if r['status']=='GENERATED_AWAITING_MANUAL_REVIEW':
            sha=r['image_sha256'];require(digest(p/'image.png')==sha,'BLIND_DISPLAY_IMAGE_CHANGED')
        reason=None
        if r.get('error_code')=='CODEX_OUTPUT_MODERATION_BLOCKED':
            log=p/'codex-stderr.log'
            sexual=log.is_file() and 'safety_violations=[sexual]' in log.read_text(encoding='utf-8',errors='replace')
            reason='生成サービスの出力審査'+('（sexual）' if sexual else '')+'で停止しました。画像は返却されず、具体的な箇所は特定できません。'
        rows.append({'part':part,'status':r['status'],'sha256':sha,'error_code':r.get('error_code'),'reason_ja':reason})
    return rows


def part_image(root,identity,number,part,sha):
    batch=load(root,identity,verify_source=False)
    require(type(number) is int and 1<=number<=len(batch['cases']),'BLIND_CASE_NUMBER')
    s=report(root,batch['cases'][number-1]['task_id']);row=next((x for x in returned(root,s) if x['part']==part),None)
    require(row is not None and row['sha256']==sha,'BLIND_DISPLAY_PART_SHA')
    return private_path(root,'runtime/work/M04/generation/jobs/'+s['jobs'][part]+'/image.png')


def publish(root,identity,replaces,archived_read_only=False):
    require(type(archived_read_only) is bool,'DISPLAY_ARCHIVE_FLAG')
    batch=load(root,identity,verify_source=not archived_read_only);require(batch.get('scope')=='EXPLICIT_USER_RETEST_NOT_BLIND' and batch.get('parent_batch')==replaces,'DISPLAY_RETEST_SCOPE')
    value=snapshot(root,identity,follow_current=False)
    require(all(c['status'] not in ('PLANNED','RUNNING','INTERRUPTED') for c in value['cases']),'DISPLAY_TRIAL_NOT_STOPPED')
    path=private_path(root,'runtime/work/M08/display');path.mkdir(parents=True,exist_ok=True)
    atomic(path/'current.json',{'active':identity,'replaces':replaces,'published_at':time.time(),'source_fingerprint':batch['source_fingerprint'],'quality_approved':False,'archived_read_only':archived_read_only})
    return {'status':'PUBLISHED_LOCAL_COMPARISON_NOT_APPROVED','id':identity,'replaces':replaces}


def snapshot(root,identity,follow_current=True):
    requested=identity;current=private_path(root,'runtime/work/M08/display/current.json')
    if follow_current and current.is_file():
        alias=json.loads(current.read_text(encoding='utf-8'))
        if alias['replaces']==identity:
            active=load(root,alias['active'],verify_source=False);require(active.get('parent_batch')==identity and active.get('scope')=='EXPLICIT_USER_RETEST_NOT_BLIND','DISPLAY_ALIAS_BINDING');identity=active['id']
    batch=load(root,identity,verify_source=False);m=metrics(root,identity,allow_archived=True);rows=[]
    provenance=folder(root,identity)/'photo-sources.json'
    sources=json.loads(provenance.read_text(encoding='utf-8')) if provenance.is_file() else []
    for case,count in zip(batch['cases'],m['cases']):
        source=next((x for x in sources if x['case']==case['number']),None)
        if source:
            require(source['photo_sha256']==case['photo_sha256'] and source['source_url'].startswith(('https://commons.wikimedia.org/wiki/','https://www.pexels.com/photo/')),'BLIND_DISPLAY_SOURCE_BINDING')
            source={k:source[k] for k in ('framing_ja','group_ja','source_url','credit','license')}
        s=report(root,case['task_id']);candidates=[]
        parts=returned(root,s)
        for item in parts:
            item['url']=f"/blind-display/{identity}/part/{case['number']}/{item['part']}/{item['sha256']}.png" if item['sha256'] else None
        for c in s['previews']:
            preview(root,s['id'],c['manifest_sha256'])
            entry={k:c[k] for k in ('manifest_sha256','kind','url')};entry.update(review_id=c.get('review_id'),checks=[],defects=[],review_status='NOT_RUN')
            if c.get('review_id'):
                r=read_review(root,c['review_id'],fresh=m['source_current']);context=json.loads((review_dir(root,c['review_id'])/'context.json').read_text(encoding='utf-8'))
                require(context['character_output']==c['output'],'BLIND_DISPLAY_REVIEW_BINDING')
                latest=next((v['data'] for v in reversed(r['visual_reviews']) if v['source']=='CODEX_SUBSCRIPTION'),None)
                errors=[]
                if r['visual_call']['status'] in ('RUNNING','ERROR_OR_RESULT_UNKNOWN_NO_RETRY'):
                    code=r['visual_call'].get('error_code')
                    errors=[{'code':code or 'VISUAL_RESULT_UNKNOWN','part':'CHARACTER','result':'UNKNOWN','message_ja':('審査結果の証拠ID照合に失敗したため未検証です。保存時のツール側の証拠登録も確認が必要です。' if code=='VISUAL_FRAME_ID' else '視覚審査の結果を検証できません。美術適合とは扱いません。')}]
                entry.update(review_status=r['status'],render_status=r['render']['status'],visual_status=r['visual_call']['status'],visual_error_code=r['visual_call'].get('error_code'),checks=latest['checks'] if latest else [],defects=[*r['hard']['defects'],*r['render']['defects'],*(latest['defects'] if latest else []),*errors])
            from .production_timing import summary
            fit_file=private_path(root,c['output']+'/export/bundle/hair-fit.json')
            if fit_file.is_file():
                fit=json.loads(fit_file.read_text(encoding='utf-8'));flow=json.loads(private_path(root,c['output']+'/export/bundle/flow-manifest.json').read_text(encoding='utf-8'));entry['hair_alignment']={'height':fit['metrics'].get('height_alignment'),'ear_targets':fit['metrics'].get('shared_ear_targets'),'ear_mode':flow.get('ear_mode'),'ear_stage':flow.get('ear_stage',fit['metrics'].get('ear_stage')),'ear_measurements':fit.get('ear_pass',{}).get('measurements')}
            entry['timing']=summary(root,s['id'],c['manifest_sha256'])
            candidates.append(entry)
        from .production_timing import summary
        head_only=None
        if not candidates:
            from .head_diagnostic import diagnostic
            found=diagnostic(root,s['id'])
            if found:
                head_only={**found[0],'url':f"/blind-display/{identity}/head/{case['number']}/{found[0]['sha256']}.png"}
        stored=read_flow(root,s['id'])
        ear_review=None
        if stored.get('ear_decision_id'):
            from .ear_policy import load as load_ear_decision
            choice=load_ear_decision(root,stored['ear_decision_id']);ear_review={k:choice[k] for k in ('mode','source','observation','quality_approved')}
        rows.append({'case':case['number'],'task_id':s['id'],'status':stored['status'] if not m['source_current'] else s['status'],'source_validation_status':s['status'],'phase':s['phase'],'ear_stage':stored.get('ear_stage'),'ear_stop_reason':stored.get('ear_stop_reason'),'error_code':stored.get('error_code'),'photo_sha256':case['photo_sha256'],
                     'photo_url':f"/blind-display/{identity}/photo/{case['number']}/{case['photo_sha256']}.png",'best_manifest_sha256':s.get('best_manifest_sha256'),
                     'head_diagnostic':head_only,'stage_reassessments':stored.get('stage_reassessments',[]),'ear_review':ear_review,'candidates':candidates,'metrics':count,'quality_approved':False,'source':source,'initial_parts':parts,'timing':summary(root,s['id'])})
    return {'id':identity,'requested_batch':requested,'scope':batch['scope'],'cases':rows,'source_current':m['source_current'],'source_fingerprint':batch['source_fingerprint'],'production_approved':False,'photo_scope':'USER_REQUESTED_LOCAL_BATCH_ONLY'}


def head_image(root,identity,number,sha):
    batch=load(root,identity,verify_source=False);require(type(number) is int and 1<=number<=len(batch['cases']),'BLIND_CASE_NUMBER')
    from .head_diagnostic import diagnostic
    found=diagnostic(root,batch['cases'][number-1]['task_id']);require(found is not None and found[0]['sha256']==sha,'HEAD_DIAGNOSTIC_BINDING');return found[1]
