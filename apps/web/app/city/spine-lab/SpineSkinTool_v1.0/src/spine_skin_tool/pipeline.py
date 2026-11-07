"""One durable photo→design→parts→assembly→review→bounded repair orchestrator."""
import copy,json,re,uuid,subprocess
from pathlib import Path
from .design import ROOT,VERSIONS,require,keys,private_path,photo_path,digest,load_design,freeze_design,required_parts,validate_design
from .assembly import canonical,verify_bundle
from .pipeline_store import directory,read,commit,lease,atomic
from .character_flow import source_profile,prepare_requests,assemble_character,bindings_from_directory,bindings_from_source
from .repair import harvest_generation,review_is_approved,NOT_SENT
from .review import create_review,read_review,review_dir,policy,stage_confidence_floor
from .reference_assets import library_root

DEFAULTS={'max_image_calls':12,'max_visual_calls':3,'max_repair_cycles':2,'live_design':False,'live_generation':False,'live_review':False,'pause_design':False}


def limits(value):
    keys(value,DEFAULTS,'FLOW_LIMIT_KEYS')
    for name,lo,hi in [('max_image_calls',1,40),('max_visual_calls',1,20),('max_repair_cycles',0,3)]:require(type(value[name]) is int and lo<=value[name]<=hi,'FLOW_LIMIT')
    for name in ('live_design','live_generation','live_review','pause_design'):require(type(value[name]) is bool,'FLOW_LIMIT')
    return copy.deepcopy(value)


def contract(root):
    from .repair import contract as repair_contract
    source,atlas,_=source_profile(root)
    originals=['harri/arm.png','spineboy/head-base.png','harri/body.png','harri/leg.png','davide/body.png','spineboy/body.png']
    return {'pipeline':VERSIONS['workflow']['pipeline_revision'],'fit':VERSIONS['workflow']['hair_fit_revision'],
        'design_prompt':VERSIONS['models']['design_prompt_revision'],'design_schema':VERSIONS['product']['design_schema'],
        'quality_sha256':digest(ROOT/'runtime/config/quality-policy.json'),'shared':repair_contract(),'mother_sha256':digest(source),'atlas_sha256':digest(atlas),
        'originals_sha256':{p:digest(library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images'/p) for p in originals}}


def context(root,s):
    context_name=s.get('context_file','context.json');require(re.fullmatch(r'context(?:-ear-review-[a-f0-9]{64})?\.json',context_name),'FLOW_CONTEXT_PATH')
    path=directory(root,s['id'])/context_name;require(digest(path)==s['context_sha256'],'FLOW_CONTEXT_CHANGED');c=json.loads(path.read_text(encoding='utf-8'))
    current=contract(root);expected=copy.deepcopy(c['contract'])
    # The analysis prompt has no effect on a frozen design. Keep already
    # generated candidates usable; all photo, rig, image, QA and workflow pins
    # remain mandatory. Unfrozen analysis still rejects prompt drift.
    if s.get('design_id'):expected['design_prompt']=current['design_prompt']
    if s.get('design_id') and expected['fit']=='head-alpha-fit-001' and current['fit']=='head-alpha-fit-002':expected['fit']=current['fit']
    require(current==expected,'FLOW_STALE_CONTRACT')
    require(digest(photo_path(root,s['photo']))==c['photo_sha256'],'FLOW_STALE_PHOTO')
    if s.get('design_id'):load_design(root,s['design_id'])
    for path,sha in c.get('replay_files',{}).items():require(digest(private_path(root,path))==sha,'FLOW_STALE_REPLAY')
    return c


def create(root,payload):
    require(isinstance(payload,dict) and {'mode'}<=set(payload) and not set(payload)-{'mode','photo','character_id','source_output','limits','constraints','auto_fit'},'FLOW_CREATE_KEYS')
    mode=payload['mode'];require(mode in ('GENERATE','REPLAY','HAIR_REFRESH'),'FLOW_MODE');cfg=limits(payload.get('limits',DEFAULTS))
    auto_fit=payload.get('auto_fit',mode!='REPLAY');require(type(auto_fit) is bool,'FLOW_FIT')
    require(mode=='REPLAY' or auto_fit,'FLOW_GENERATION_REQUIRES_FIT')
    draft=None;source_files={};design_id=None
    if mode in ('REPLAY','HAIR_REFRESH'):
        require(set(payload)<= {'mode','source_output','limits','auto_fit'},'FLOW_REPLAY_KEYS')
        output=private_path(root,payload['source_output']);record=json.loads((output/'design.json').read_text(encoding='utf-8'))
        require(load_design(root,record['design_id'])==record,'FLOW_REPLAY_DESIGN');verify_bundle(output/'export/bundle');draft=record['design'];design_id=record['design_id']
        if mode=='HAIR_REFRESH':
            draft=copy.deepcopy(draft)
            # Carry PHOTO identity cues forward, not obsolete flat-paint/ear bans
            # buried in an older design's free-text rendering instructions.
            observed=draft['observed']['hair'].strip()
            require(bool(observed),'HAIR_REFRESH_OBSERVED_DESIGN_REQUIRED')
            draft['appearance']['hair'].update(description=observed+' 原写真の髪型・色を保ち、固定頭部に合う自然な丸みと小さな耳を一体で制作。正背は同じ描画処理。少量の自然な陰影を許可し、厳密な単一影やグラデーション禁止は要求しない。',basis='PHOTO')
            design_id=freeze_design(root,draft)['design_id']
        photo=draft['photo']['file'];cid=draft['character_id'];constraints=''
        for part in required_parts(draft):
            if not part.startswith('ARM'):
                p=private_path(root,(output/'raw'/(part+'.png')).relative_to(Path(root)).as_posix());source_files[p.relative_to(root).as_posix()]=digest(p)
        for name in ('design.json','export/bundle/build-manifest.json','export/bundle/flow-manifest.json'):
            p=output/name;source_files[p.relative_to(root).as_posix()]=digest(p)
    else:
        require('source_output' not in payload,'FLOW_GENERATE_KEYS');photo=payload['photo'];cid=payload['character_id'];photo_path(root,photo)
        require(isinstance(cid,str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}',cid),'CHARACTER_ID')
        constraints=payload.get('constraints','');require(isinstance(constraints,str) and len(constraints)<=1400 and '\x00' not in constraints,'PHOTO_DESIGN_CONSTRAINTS')
    identity='flow-'+uuid.uuid4().hex;folder=directory(root,identity);folder.mkdir(parents=True)
    c={'contract':contract(root),'photo_sha256':digest(photo_path(root,photo)),'replay_files':source_files,'constraints':constraints,'source_output':payload.get('source_output')}
    atomic(folder/'context.json',c)
    s={'id':identity,'schema_version':VERSIONS['product']['pipeline_schema'],'mode':mode,'photo':photo,'character_id':cid,'source_output':payload.get('source_output'),'limits':cfg,'auto_fit':auto_fit,
        'versions':{'pipeline':VERSIONS['workflow']['pipeline_revision'],'workflow':VERSIONS['workflow']['revision'],'image_prompt':VERSIONS['models']['image_prompt_revision'],'design_prompt':VERSIONS['models']['design_prompt_revision'],'fit':VERSIONS['workflow']['hair_fit_revision']},
        'context_sha256':digest(folder/'context.json'),'phase':'REQUESTS' if design_id else 'DESIGN','status':'PLANNED','design_id':design_id,'draft':draft,
        'design_origin':'SAVED_DESIGN' if mode=='REPLAY' else 'NOT_ANALYZED','analysis_reserved':False,'analysis_calls_reserved':0,'initial_image_calls_reserved':0,'initial_visual_calls_reserved':0,'jobs':{},'completed_parts':[],
        'output':(folder/'candidate-initial').relative_to(root).as_posix(),'review_id':'review-'+uuid.uuid4().hex,'superseded_reviews':[],
        'repair_id':None,'candidates':[],'best_output':None,'best_manifest_sha256':None,'quality_approved':False,'production_approved':False}
    return commit(root,s,'FLOW_CREATED_NO_MODEL_CALL')


def checkpoint(root,s,event,hook=None):
    commit(root,s,event)
    if hook:hook(event,s)


def stopped(root,s):return (directory(root,s['id'])/'cancel.requested').exists()


def totals(root,s):
    images=s['initial_image_calls_reserved']+s.get('ear_image_calls_reserved',0);visions=s['initial_visual_calls_reserved']+s.get('ear_front_visual_calls_reserved',0)+s.get('ear_back_visual_calls_reserved',0)
    if s.get('repair_id'):
        from .repair_store import read as read_repair
        r=read_repair(root,s['repair_id']);images+=r['image_calls_reserved'];visions+=r['visual_calls_reserved']
    return {'design_calls_reserved':s['analysis_calls_reserved'],'image_calls_reserved':images,'visual_calls_reserved':visions}


def edit_design(root,identity,value):
    with lease(root,identity):
        s=read(root,identity);context(root,s);require(not stopped(root,s),'FLOW_CANCELLED')
        require(s['mode']=='GENERATE' and s['phase'] in ('DESIGN','DESIGN_REVIEW') and not s['design_id'],'FLOW_DESIGN_ALREADY_FROZEN')
        value=validate_design(value,root);require(value['photo']['file']==s['photo'] and value['character_id']==s['character_id'],'FLOW_DESIGN_SOURCE')
        s['draft']=value;s['design_origin']='USER_EDITED';s['design_id']=freeze_design(root,value)['design_id'];s['phase']='REQUESTS';s['status']='PLANNED'
        from .character_session import bind_design
        bind_design(root,s['id'],s['design_id'])
        return commit(root,s,'EDITED_DESIGN_FROZEN_NO_MODEL_CALL')


def retry_evidence(root,s):
    """A new explicit attempt may follow known unavailability or a terminal quota error.

    A quota interruption does NOT prove no image was generated/billed. Preserve that
    uncertainty and the old reservation; this is not automatic resend/recovery.
    """
    if s['phase']!='GENERATE' or s['status'] not in ('OUTPUT_BLOCKED','ERROR_OR_RESULT_UNKNOWN'):return None
    if s.get('error_code') not in ('CODEX_IMAGEGEN_UNAVAILABLE','CODEX_EXEC_FAILED_NO_RETRY','CODEX_SUBSCRIPTION_LIMIT_REACHED'):return None
    pending=[p for p in s['jobs'] if p not in s['completed_parts']]
    if len(pending)!=1:return None
    part=pending[0];job=s['jobs'][part];f=private_path(root,'runtime/work/M04/generation/jobs/'+job);r=json.loads((f/'report.json').read_text(encoding='utf-8'))
    require(r.get('design_id')==s['design_id'] and r.get('part')==part,'FLOW_RETRY_NOT_ALLOWED')
    text=(f/'codex-stderr.log').read_text(encoding='utf-8',errors='replace').lower() if (f/'codex-stderr.log').exists() else ''
    if 'moderation' in text:return None
    result=f/'codex-result.json'
    if result.exists():
        value=json.loads(result.read_text(encoding='utf-8'))
        if value.get('status')=='GENERATED' or value.get('status')=='OUTPUT_BLOCKED' or value.get('reason_code')=='OUTPUT_MODERATION':return None
        if value.get('status')=='UNAVAILABLE' and value.get('reason_code','TOOL_UNAVAILABLE') in ('TOOL_UNAVAILABLE','TECHNICAL_ERROR','UNKNOWN'):
            return {'part':part,'job_id':job,'result_sha256':digest(result),'code':r.get('error_code'),'outcome':'RETURNED_UNAVAILABLE','prior_image_result_unknown':False}
        if value.get('status')=='RATE_LIMITED' or value.get('reason_code')=='SUBSCRIPTION_LIMIT':
            return {'part':part,'job_id':job,'result_sha256':digest(result),'code':r.get('error_code'),'outcome':'RETURNED_SUBSCRIPTION_LIMIT','prior_image_result_unknown':True}
    from .codex_subscription import terminal_usage_limit
    if terminal_usage_limit(f):return {'part':part,'job_id':job,'events_sha256':digest(f/'codex-events.jsonl'),'code':r.get('error_code'),'outcome':'TERMINAL_CLI_USAGE_LIMIT','prior_image_result_unknown':True}
    return None


def retry_unavailable(root,identity):
    """Explicit new attempt after a verified service stop; no refund or safety bypass."""
    with lease(root,identity):
        s=read(root,identity);context(root,s);require(not stopped(root,s),'FLOW_CANCELLED')
        reason=retry_evidence(root,s);require(reason is not None,'FLOW_RETRY_NOT_ALLOWED');part=reason['part']
        maximum=4 if s['versions']['workflow']=='photo-to-skin-shared-014' else 3
        failed=s.setdefault('failed_jobs',[]);require(1+sum(a['part']==part for a in failed)<maximum and s['initial_image_calls_reserved']<s['limits']['max_image_calls'],'FLOW_RETRY_LIMIT')
        failed.append(reason);s['jobs'].pop(part)
        s['status']='PLANNED';s.pop('error_code',None);return commit(root,s,'KNOWN_UNAVAILABLE_NEW_ATTEMPT_REQUESTED_NO_REFUND')


def enable_part_repairs(root,identity):
    """Explicit authorised correction of a paused current014 zero-repair draft."""
    with lease(root,identity):
        s=read(root,identity);context(root,s)
        require(s['versions']['workflow']=='photo-to-skin-shared-014' and s['phase']!='DONE','FLOW_REPAIR_CONFIGURATION_SCOPE')
        require(s['status'] in ('CANCELLED','OUTPUT_BLOCKED','PLANNED'),'FLOW_REPAIR_CONFIGURATION_BUSY')
        from .character_session import get
        ref=get(root,identity)
        if ref:
            session=json.loads((ref['folder']/'session.json').read_text(encoding='utf-8'))
            require(session['status']=='OPEN' and not session['pending_job'],'SESSION_PENDING_OR_CLOSED')
        if s['status']=='OUTPUT_BLOCKED':require(retry_evidence(root,s) is not None,'FLOW_RETRY_NOT_ALLOWED')
        require(s['limits']['max_repair_cycles']==0,'FLOW_REPAIR_CONFIGURATION_ALREADY_SET')
        s.setdefault('configuration_amendments',[]).append({'field':'max_repair_cycles','before':0,'after':3,'reason':'USER_AUTHORISED_THREE_PART_REGENERATIONS','existing_counts':totals(root,s)})
        s['limits']['max_repair_cycles']=3
        marker=directory(root,identity)/'cancel.requested'
        if marker.exists():marker.unlink()
        if s['status']=='CANCELLED':s['status']='PLANNED'
        return commit(root,s,'EXPLICIT_PART_REPAIR_CONFIGURATION_COUNTS_PRESERVED')


def image_preflight(root,s):
    from .generation import settings
    from .codex_subscription import login_status
    require(s['limits']['live_generation'],'FLOW_IMAGE_DISABLED');cfg=settings(root)
    require(cfg['live_enabled'] and cfg['upload_consent'],'LIVE_DISABLED')
    require(login_status(cfg['codex']),'CODEX_CHATGPT_LOGIN_REQUIRED')
    remaining=len([p for p in s['parts'] if p not in s['completed_parts'] and p not in s['jobs'] and p not in s.get('exhausted_parts',[])])
    require(s['initial_image_calls_reserved']+remaining<=s['limits']['max_image_calls'],'FLOW_IMAGE_LIMIT')
    pool=private_path(root,'runtime/work/M04/generation/jobs')
    require(len(list(pool.glob('codex-call-*.reserved')))+remaining<=cfg['max_live_calls'],'LIVE_CALL_LIMIT')


def update_candidates(root,s):
    if not s.get('repair_id'):return
    from .repair_store import read as read_repair
    r=read_repair(root,s['repair_id'])
    for a in r['attempts']:
        if a.get('manifest_sha256') and not any(c['manifest_sha256']==a['manifest_sha256'] for c in s['candidates']):
            s['candidates'].append({'output':a['output'],'manifest_sha256':a['manifest_sha256'],'review_id':a['review_id'],'kind':'REPAIR','processing_timing_sha256':a.get('processing_timing_sha256')})
        for candidate in s['candidates']:
            if candidate['output']==a['output']:
                candidate['review_id']=a['review_id'];candidate['superseded_reviews']=a.get('superseded_reviews',[])
    s.update(best_output=r['best_output'],best_manifest_sha256=r['best_manifest_sha256'],quality_approved=r['quality_approved'])


def retry_ear(root,s,part,reason,hook):
    if s['versions']['workflow']!='photo-to-skin-shared-014':return False
    label='EARS_'+part.split('_')[1];used=1+sum(x['part']==label for x in s.get('failed_jobs',[]))
    if used>=4:return False
    job=s.get('ear_jobs',{}).get(part)
    require(job is not None,'EAR_RETRY_JOB')
    s.setdefault('failed_jobs',[]).append({'part':label,'job_id':job,'code':reason,'known_terminal':True})
    s['ear_jobs'].pop(part);s.update(ear_stage='GENERATING_FRONT' if part=='HAIR_FRONT' else 'GENERATING_BACK',phase='EARS_REQUESTS')
    checkpoint(root,s,'EAR_PAIR_RETRY_SAME_BASE_NO_HAIR_REDRAW',hook);return True


def work(root,s,hook=None):
    cfg=s['limits'];folder=directory(root,s['id']);c=context(root,s)
    while True:
        context(root,s)
        if stopped(root,s):s['status']='CANCELLED';checkpoint(root,s,'FLOW_CANCELLED',hook);return s
        phase=s['phase']
        if phase=='DESIGN':
            from .photo_design import execute,recover
            if not cfg['live_design']:s['status']='CONFIGURATION_BLOCKED';s['error_code']='PHOTO_DESIGN_LIVE_DISABLED';return commit(root,s,'DESIGN_DISABLED_NO_SEND')
            analysis=folder/'analysis';analysis.mkdir(exist_ok=True)
            if s['analysis_reserved']:
                result=recover(root,analysis,s['photo'],s['character_id'],c['constraints'])
                if result is None:s['status']='WAIT_RESULT';return commit(root,s,'DESIGN_RESULT_UNKNOWN_NO_RESEND')
            else:
                s['analysis_reserved']=True;s['analysis_calls_reserved']=1;checkpoint(root,s,'DESIGN_RESERVED',hook)
                result=execute(root,analysis,s['photo'],s['character_id'],c['constraints'])
            s['ear_mode']=result.get('ear_mode','PARTIAL_BOTH');s['draft']=result['design'];s['design_origin']='PHOTO_ANALYSIS';s['design_needs_input']=result['needs_input'];s['design_message_ja']=result['message_ja'];s['phase']='DESIGN_REVIEW'
            if result.get('ear_observation'):
                from .ear_policy import record,load
                s['ear_decision_id']=record(root,s,result['ear_observation'],'MODEL_PHOTO_ANALYSIS');s['ear_mode']=load(root,s['ear_decision_id'])['mode']
            checkpoint(root,s,'PHOTO_DESIGN_RETURNED',hook)
            if result['needs_input'] or cfg['pause_design']:s['status']='DESIGN_READY';return commit(root,s,'EDITABLE_DESIGN_READY')
        elif phase=='DESIGN_REVIEW':
            require(s['draft'] is not None,'FLOW_DESIGN_REQUIRED')
            # Explicit pause is resumed through edit_design; auto-run freezes without extra choices.
            if cfg['pause_design'] or s.get('design_needs_input'):s['status']='DESIGN_READY';return commit(root,s,'EDITABLE_DESIGN_READY')
            s['design_id']=freeze_design(root,s['draft'])['design_id'];
            from .character_session import bind_design
            bind_design(root,s['id'],s['design_id']);s['phase']='REQUESTS';checkpoint(root,s,'DESIGN_FROZEN',hook)
        elif phase=='REQUESTS':
            record=load_design(root,s['design_id']);plan,_=prepare_requests(root,s['design_id']);s['plan_id']=plan['plan_id'];s['parts']=[p for p in required_parts(record['design']) if not p.startswith('ARM')]
            if s['mode']=='HAIR_REFRESH':s['parts']=['HAIR_FRONT','HAIR_BACK']
            s['part_request_ids']={p:item['prompt_sha256'] for p,item in plan['parts'].items()}
            s['phase']='ASSEMBLE' if s['mode']=='REPLAY' else 'GENERATE';checkpoint(root,s,'SHARED_REQUESTS_FROZEN',hook)
        elif phase=='GENERATE':
            from .generation import generate
            # Existing sent jobs are harvested before any new submission; unknown outcomes stop.
            for part,job in s['jobs'].items():
                if part not in s['completed_parts']:
                    r=harvest_generation(root,job)
                    if r is None:s['status']='WAIT_RESULT';return commit(root,s,'PART_RESULT_UNKNOWN_NO_RESEND')
                    s['completed_parts'].append(part);checkpoint(root,s,'PART_RESULT_RECOVERED',hook)
            if len(s['completed_parts'])<len(s['parts']):image_preflight(root,s)
            _,atlas,profile=source_profile(root)
            for part in s['parts']:
                if part in s['completed_parts'] or part in s.get('exhausted_parts',[]):continue
                if stopped(root,s):break
                job='job-'+uuid.uuid4().hex;s['jobs'][part]=job;s['initial_image_calls_reserved']+=1;checkpoint(root,s,'PART_RESERVED',hook)
                if stopped(root,s):break
                try:generate(root,profile,atlas,{'provider':'codex','part':part,'description':'','execute':True,'design_id':s['design_id'],'flow_id':s['id']},job_id=job)
                except ValueError as error:
                    if s['versions']['workflow']!='photo-to-skin-shared-014' or cfg['max_repair_cycles']<1 or getattr(error,'code','')!='CODEX_OUTPUT_MODERATION_BLOCKED':raise
                    s.setdefault('failed_jobs',[]).append({'part':part,'job_id':job,'code':error.code,'known_terminal':True});s['jobs'].pop(part)
                    if sum(x['part']==part for x in s['failed_jobs'])>=4:s.setdefault('exhausted_parts',[]).append(part)
                    checkpoint(root,s,'KNOWN_BLOCK_SCOPED_NEW_REQUEST_WITHIN_PART_BOUND',hook)
                    return work(root,s,hook)
                s['completed_parts'].append(part);checkpoint(root,s,'PART_RETURNED',hook)
            if stopped(root,s):continue
            if s.get('exhausted_parts'):
                s['status']='OUTPUT_BLOCKED';s['error_code']='PART_REGENERATION_LIMIT';return commit(root,s,'PART_LIMIT_REACHED_OTHER_PARTS_RETAINED')
            s['phase']='ASSEMBLE';checkpoint(root,s,'ALL_REQUIRED_PARTS_READY',hook)
        elif phase=='ASSEMBLE':
            destination=private_path(root,s['output'])
            if destination.exists():verify_bundle(destination/'export/bundle')
            else:
                inherited_fit=False
                if s['mode']=='HAIR_REFRESH':
                    record=load_design(root,s['design_id']);bindings=bindings_from_directory(root,s['design_id'],c['source_output']+'/raw')
                    bindings.update({p:{'job_id':job} for p,job in s['jobs'].items()})
                elif s['mode']=='GENERATE':bindings={p:{'job_id':job} for p,job in s['jobs'].items()}
                else:bindings,inherited_fit=bindings_from_source(root,s['design_id'],c['source_output'])
                s['inherited_geometry_fit']=bool(inherited_fit);s['inherited_fit_revision']=inherited_fit['revision'] if inherited_fit else None;s['replay_jobs']={p:b['job_id'] for p,b in bindings.items() if 'job_id' in b} if s['mode']=='REPLAY' else {}
                inherited_ear_artifact=None
                if inherited_fit:
                    full_fit=json.loads(private_path(root,c['source_output']+'/export/bundle/hair-fit.json').read_text(encoding='utf-8'));require(full_fit['fit_id']==inherited_fit['fit_id'],'FLOW_REPLAY_FIT_BINDING');inherited_ear_artifact=full_fit.get('ear_pass',{}).get('artifact')
                fit_revision=s['versions']['fit'] if s['auto_fit'] else s['inherited_fit_revision']
                assemble_character(root,s['design_id'],bindings,s['output'],auto_fit=bool(s['auto_fit'] or inherited_fit),fit_revision=fit_revision,ear_artifact=inherited_ear_artifact)
            sha=digest(destination/'export/bundle/build-manifest.json');clock=destination/'processing-timing.json';s['candidates']=[{'output':s['output'],'manifest_sha256':sha,'review_id':s['review_id'],'kind':'INITIAL','processing_timing_sha256':digest(clock) if clock.is_file() else None}]
            s.update(best_output=s['output'],best_manifest_sha256=sha,phase='CAPTURE');checkpoint(root,s,'INITIAL_ASSEMBLED',hook)
        elif phase=='CAPTURE':
            from .review_render import collect_evidence
            f=review_dir(root,s['review_id'])
            if (f/'report.json').exists() and read_review(root,s['review_id'])['render']['status'] in ('RUNNING','ERROR'):
                s['superseded_reviews'].append(s['review_id']);s['review_id']='review-'+uuid.uuid4().hex;next(c for c in s['candidates'] if c['output']==s['output'])['review_id']=s['review_id'];checkpoint(root,s,'LOCAL_CAPTURE_RESTART_NO_MODEL_CALL',hook)
            report=create_review(root,s['output'],s['review_id'])
            if report['hard']['status']!='FAIL' and report['render']['status']=='NOT_RUN':report=collect_evidence(root,s['review_id'])
            if report['render']['status']=='ERROR':
                if s.get('local_capture_retries',0)<1:
                    s['local_capture_retries']=s.get('local_capture_retries',0)+1;s['superseded_reviews'].append(s['review_id']);s['review_id']='review-'+uuid.uuid4().hex;next(c for c in s['candidates'] if c['output']==s['output'])['review_id']=s['review_id'];checkpoint(root,s,'LOCAL_CAPTURE_RETRY_ONCE_NO_IMAGE_CALL',hook);continue
                s['status']='ERROR_OR_RESULT_UNKNOWN';return commit(root,s,'LOCAL_CAPTURE_FAILED_RETRY_WITH_NEW_REVIEW')
            s['phase']='VISION';checkpoint(root,s,'INITIAL_CAPTURED',hook)
        elif phase=='VISION':
            visual_key='ear_front_visual_calls_reserved' if s.get('ear_stage')=='FRONT_EARS' else 'ear_back_visual_calls_reserved' if s.get('ear_stage')=='BOTH_EARS' else 'initial_visual_calls_reserved'
            from .review_visual import run_visual,recover_visual_result,review_settings
            report=read_review(root,s['review_id'])
            if report['render']['status']=='PASS' and cfg['live_review']:
                if report['visual_call']['status']=='NOT_RUN':
                    if s.get(visual_key,0) and (s['review_id'] not in s.get('authorized_review_ids',[]) or s['review_id'] in s.get('review_send_intents',[])):s['status']='WAIT_RESULT';return commit(root,s,'VISION_SEND_UNKNOWN_NO_RESEND')
                    if totals(root,s)['visual_calls_reserved']>=cfg['max_visual_calls']:
                        s['status']='LIMIT_REACHED';return commit(root,s,'FLOW_STAGE_VISUAL_LIMIT_NO_SEND')
                    vcfg=review_settings(root);require(vcfg['live_enabled'] and vcfg['upload_consent'],'REVIEW_LIVE_DISABLED')
                    require(len(list(review_dir(root,s['review_id']).parent.glob('review-call-*.reserved')))<vcfg['max_live_calls'],'REVIEW_CALL_LIMIT')
                    s[visual_key]=s.get(visual_key,0)+1;s.setdefault('review_send_intents',[]).append(s['review_id']);checkpoint(root,s,'INITIAL_VISION_RESERVED',hook);report=run_visual(root,s['review_id'])
                if report['visual_call']['status'] in ('RUNNING','ERROR_OR_RESULT_UNKNOWN_NO_RETRY'):
                    report=recover_visual_result(root,s['review_id'])
                    if report is None:s['status']='WAIT_RESULT';return commit(root,s,'VISION_RESULT_UNKNOWN_NO_RESEND')
            s['phase']='REPAIR';checkpoint(root,s,'INITIAL_REVIEWED',hook)
        elif phase=='REPAIR':
            if s.get('ear_stage') in ('FRONT_EARS','BOTH_EARS'):
                s['phase']='DONE';checkpoint(root,s,'EAR_STAGE_REVIEW_RETURNED_NOT_RELEASE_APPROVAL',hook);continue
            from .repair import route,create as create_repair,advance as advance_repair
            report=read_review(root,s['review_id'])
            if review_is_approved(root,report):s['quality_approved']=True;s['phase']='DONE';continue
            if not s['repair_id']:
                scope=s['parts'] if s['mode']=='HAIR_REFRESH' else None
                plan=route(report,scope);actions=[r for r in plan if r['action']!='REQUIRES_REVIEW']
                if not cfg['max_repair_cycles'] or not actions:s['phase']='DONE';continue
                used=totals(root,s);remaining=cfg['max_image_calls']-used['image_calls_reserved'];vleft=cfg['max_visual_calls']-used['visual_calls_reserved']
                content=any(r['action']=='REGENERATE' for r in actions)
                if content and (not cfg['live_generation'] or remaining<1):s['phase']='DONE';s['stop_reason']='FLOW_REPAIR_IMAGE_LIMIT_OR_DISABLED';continue
                initial_max=max([1]+[1+sum(f['part']==p for f in s.get('failed_jobs',[])) for p in s['parts']]);perpart=(4 if s['mode']=='HAIR_REFRESH' or s['versions']['workflow'] in ('photo-to-skin-shared-012','photo-to-skin-shared-013','photo-to-skin-shared-014') else 3)-initial_max
                if s['versions']['workflow']=='photo-to-skin-shared-014':perpart=3
                if content and perpart<1:s['phase']='DONE';s['stop_reason']='FLOW_REPAIR_PART_LIMIT';continue
                options={'max_cycles':cfg['max_repair_cycles']*(2 if scope else 1),'max_image_calls':max(1,min(32,remaining)),'max_calls_per_part':max(1,min(cfg['max_repair_cycles'],3,perpart)),'max_visual_calls':max(1,min(6 if scope else 3,vleft)),
                    'live_generation':cfg['live_generation'] and remaining>0,'live_review':cfg['live_review'] and vleft>0}
                r=create_repair(root,s['review_id'],options,parts=scope);s['repair_id']=r['id'];checkpoint(root,s,'BOUNDED_REPAIR_CREATED',hook)
            # Each M06 advance is one cycle. Its persisted limits are the remaining outer budget.
            while True:
                if stopped(root,s):break
                r=advance_repair(root,s['repair_id']);update_candidates(root,s);checkpoint(root,s,'BOUNDED_REPAIR_CHECKPOINT',hook)
                if r['status']!='REQUIRES_REVIEW' or not r['attempts'] or r['attempts'][-1]['status']!='REJECTED':break
                if len(r['attempts'])>=r['limits']['max_cycles']:break
            if stopped(root,s):continue
            if r['status'] in ('WAIT_RESULT','ERROR_OR_RESULT_UNKNOWN','CONFIGURATION_BLOCKED','STALE','OUTPUT_BLOCKED'):
                s['status']=r['status'];return commit(root,s,'REPAIR_NEEDS_ATTENTION')
            if r['status']=='LIMIT_REACHED' or (r['attempts'] and r['attempts'][-1]['status']=='REJECTED'):s['stop_reason']='FLOW_REPAIR_LIMIT_OR_REJECTED'
            s['phase']='DONE';checkpoint(root,s,'BOUNDED_REPAIR_FINISHED',hook)
        elif phase=='EARS_REQUESTS':
            if s.get('ear_decision_id') and VERSIONS['workflow'].get('standard_ear_revision')=='standard-ear-001':
                from .standard_ears import create_artifact
                s['standard_ear_artifact']=create_artifact(root,s['ear_base_output'],s['ear_decision_id']);s.update(ear_stage='GENERATING_STANDARD_BOTH',phase='EARS_ASSEMBLE');checkpoint(root,s,'STANDARD_EAR_PAIR_LOCAL_NO_MODEL_CALL',hook);continue
            from .ear_pass import create_request
            part='HAIR_FRONT' if s['ear_stage']=='GENERATING_FRONT' else 'HAIR_BACK'
            s.setdefault('ear_requests',{})[part]=create_request(root,s,part);s['phase']='EARS_GENERATE';checkpoint(root,s,'FIXED_BASE_EAR_REQUEST_FROZEN',hook)
        elif phase=='EARS_GENERATE':
            from .generation import generate
            from .ear_pass import pieces
            from PIL import Image
            part='HAIR_FRONT' if s['ear_stage']=='GENERATING_FRONT' else 'HAIR_BACK'
            job=s.setdefault('ear_jobs',{}).get(part)
            if job:
                if harvest_generation(root,job) is None:s['status']='WAIT_RESULT';return commit(root,s,'EAR_RESULT_UNKNOWN_NO_RESEND')
            else:
                require(cfg['live_generation'] and totals(root,s)['image_calls_reserved']<cfg['max_image_calls'],'FLOW_EAR_IMAGE_LIMIT')
                job='job-'+uuid.uuid4().hex;s['ear_jobs'][part]=job;s['ear_image_calls_reserved']=s.get('ear_image_calls_reserved',0)+1;checkpoint(root,s,'EAR_PART_RESERVED',hook)
                if stopped(root,s):continue
                _,atlas,profile=source_profile(root)
                try:generate(root,profile,atlas,{'provider':'codex','part':part,'description':'','execute':True,'design_id':s['design_id'],'flow_id':s['id'],'ear_request_id':s['ear_requests'][part]},job_id=job)
                except ValueError as error:
                    if getattr(error,'code','')=='CODEX_OUTPUT_MODERATION_BLOCKED' and retry_ear(root,s,part,error.code,hook):continue
                    raise
            try:
                with Image.open(private_path(root,'runtime/work/M04/generation/jobs/'+job+'/image.png')) as image:pieces(image)
            except ValueError:
                if retry_ear(root,s,part,'EAR_PAIR_STRUCTURE_INVALID',hook):continue
                raise
            s['phase']='EARS_ASSEMBLE';checkpoint(root,s,'EAR_PAIR_RETURNED_STRUCTURE_CHECKED',hook)
        elif phase=='EARS_ASSEMBLE':
            from .ear_pass import artifact
            standard=s.get('standard_ear_artifact') if s['ear_stage']=='GENERATING_STANDARD_BOTH' else None
            ear_artifact=standard or artifact(root,s);front=s['ear_stage']=='GENERATING_FRONT';output=(folder/(('candidate-standard-ears-'+standard[:16]) if standard else (('candidate-ears-front' if front else 'candidate-ears-both')+('-'+str(s.get('ear_image_calls_reserved',0)) if s['versions']['workflow']=='photo-to-skin-shared-014' else '')))).relative_to(root).as_posix();destination=private_path(root,output)
            if not destination.exists():
                bindings,_=bindings_from_source(root,s['design_id'],s['ear_base_output']);assemble_character(root,s['design_id'],bindings,output,auto_fit=True,fit_revision=s['versions']['fit'],ear_artifact=ear_artifact)
            else:verify_bundle(destination/'export/bundle')
            s.update(output=output,review_id='review-'+uuid.uuid4().hex,ear_stage='FRONT_EARS' if front else 'BOTH_EARS',ear_artifact=ear_artifact,phase='CAPTURE',local_capture_retries=0)
            sha=digest(destination/'export/bundle/build-manifest.json');clock=destination/'processing-timing.json';s['candidates'].append({'output':output,'manifest_sha256':sha,'review_id':s['review_id'],'kind':'EAR_STANDARD' if standard else 'EAR_FRONT' if front else 'EAR_BACK','processing_timing_sha256':digest(clock)})
            s.update(best_output=output,best_manifest_sha256=sha);checkpoint(root,s,'EAR_ASSEMBLED',hook)
        elif phase=='DONE':
            if s['versions']['workflow'] in ('photo-to-skin-shared-013','photo-to-skin-shared-014') and s['mode']!='REPLAY':
                from .hair_stages import stage_gate
                candidate=s['candidates'][-1] if s['candidates'] else None
                if not s.get('ear_stage'):
                    if candidate and stage_gate(root,candidate):
                        if s.get('ear_mode')=='HIDDEN':
                            s['ear_stage']='HIDDEN';s['ear_stop_reason']=None;s['status']='REQUIRES_REVIEW'
                            from .character_session import close
                            close(root,s['id'],'COMPLETED_HIDDEN_EAR_CANDIDATE_NOT_HUMAN_APPROVAL');return commit(root,s,'HIDDEN_EARS_INTENTIONAL_NO_EAR_CALL')
                        s.update(ear_base_output=candidate['output'],ear_base_manifest_sha256=candidate['manifest_sha256'],ear_stage='GENERATING_FRONT',phase='EARS_REQUESTS');checkpoint(root,s,'BARE_HAIR_CONFIRMED_EARS_DEFERRED',hook);continue
                    if s.get('ear_mode')=='HIDDEN':s.update(ear_stage='HIDDEN',ear_stop_reason=None,hair_fit_confirmation_pending=True)
                    else:s.update(ear_stage='STOPPED',ear_stop_reason='BARE_HAIR_NOT_CONFIRMED')
                elif s['ear_stage']=='FRONT_EARS':
                    if stage_gate(root,candidate,front_ears=True):
                        s['front_ear_approval']={'review_id':candidate['review_id'],'report_sha256':digest(review_dir(root,candidate['review_id'])/'report.json'),'output':candidate['output'],'manifest_sha256':candidate['manifest_sha256']}
                        s.update(ear_stage='GENERATING_BACK',phase='EARS_REQUESTS');checkpoint(root,s,'FRONT_EARS_CONFIRMED_COMMON_HEIGHT_FOR_BACK',hook);continue
                    if retry_ear(root,s,'HAIR_FRONT','FRONT_EARS_NOT_CONFIRMED',hook):continue
                    s.update(ear_stage='STOPPED',ear_stop_reason='FRONT_EARS_NOT_CONFIRMED')
                elif s['ear_stage']=='BOTH_EARS' and s['versions']['workflow']=='photo-to-skin-shared-014':
                    fit=json.loads(private_path(root,candidate['output']+'/export/bundle/hair-fit.json').read_text(encoding='utf-8'))
                    ears=fit['ear_pass']['measurements']['HAIR_BACK'].get('per_ear',[]);review=read_review(root,candidate['review_id'])
                    checks=review['visual_reviews'][-1]['data']['checks'] if review['visual_reviews'] else []
                    ok=len(ears)==2 and all(e['visible_fraction']>=.4 for e in ears) and any(c['category']=='ear_visibility' and c['result']=='PASS' and c['confidence']>=stage_confidence_floor() for c in checks)
                    if not ok:
                        if not s.get('standard_ear_artifact') and retry_ear(root,s,'HAIR_BACK','BACK_EARS_NOT_CONFIRMED',hook):continue
                        s.update(ear_stage='STOPPED',ear_stop_reason='BACK_EARS_NOT_CONFIRMED')
            with lease(root,s['id'],'decision.lock',wait=True):
                if stopped(root,s):s['status']='CANCELLED'
                else:s['status']='READY_FOR_REVIEWED_EXPORT' if s['quality_approved'] else 'REQUIRES_REVIEW'
                if s['versions']['workflow']=='photo-to-skin-shared-014':
                    from .character_session import close
                    close(root,s['id'],'STOPPED_'+s['status'])
                return commit(root,s,'PIPELINE_COMPLETED_APPROVAL_SEPARATE')
        else:require(False,'FLOW_PHASE')


def advance(root,identity,hook=None):
    with lease(root,identity):
        s=read(root,identity)
        try:
            context(root,s)
            if stopped(root,s):s['status']='CANCELLED';return commit(root,s,'FLOW_CANCELLED')
            if s['status']=='OUTPUT_BLOCKED':return s
            if s['phase']=='DONE':
                for candidate in reversed(s['candidates']):
                    if review_is_approved(root,read_review(root,candidate['review_id'])):
                        with lease(root,s['id'],'decision.lock',wait=True):
                            if stopped(root,s):break
                            s.update(best_output=candidate['output'],best_manifest_sha256=candidate['manifest_sha256'],quality_approved=True,status='READY_FOR_REVIEWED_EXPORT');return commit(root,s,'VERIFIED_REVIEW_ACCEPTED_NO_MODEL_CALL')
                return s
            s['status']='RUNNING';s.pop('error_code',None);checkpoint(root,s,'FLOW_WORKER_RESUMED',hook);return work(root,s,hook)
        except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError) as error:
            code=getattr(error,'code',type(error).__name__)
            blocked=code in NOT_SENT|{'FLOW_IMAGE_DISABLED','FLOW_IMAGE_LIMIT','REVIEW_CALL_LIMIT','REVIEW_LIVE_DISABLED','PHOTO_DESIGN_LIVE_DISABLED','PHOTO_DESIGN_CALL_LIMIT','PHOTO_DESIGN_SETTINGS','CODEX_CLI_NOT_FOUND','CODEX_NATIVE_EXECUTABLE_REQUIRED'}
            s['status']='STALE' if 'STALE' in code or code in ('PHOTO_CHANGED','DESIGN_VERSION_STALE') else 'OUTPUT_BLOCKED' if code in ('CODEX_OUTPUT_MODERATION_BLOCKED','CODEX_IMAGEGEN_UNAVAILABLE','CODEX_SUBSCRIPTION_LIMIT_REACHED') else 'CONFIGURATION_BLOCKED' if blocked else 'ERROR_OR_RESULT_UNKNOWN'
            if blocked and s['phase']=='DESIGN' and not (directory(root,s['id'])/'analysis/visual-submitted-request.json').exists():s['analysis_reserved']=False;s['analysis_calls_reserved']=0
            if blocked and s['phase']=='VISION' and read_review(root,s['review_id'])['visual_call']['status']=='NOT_RUN':s['initial_visual_calls_reserved']=0
            if blocked and s['phase']=='GENERATE':
                for part,job in list(s['jobs'].items()):
                    if part not in s['completed_parts'] and not private_path(root,'runtime/work/M04/generation/jobs/'+job).exists():s['jobs'].pop(part);s['initial_image_calls_reserved']-=1
            s['error_code']=code;s.setdefault('errors',[]).append({'code':code,'phase':s['phase']});return commit(root,s,'FLOW_ERROR_NO_AUTOMATIC_RESEND')


def resume_hair_scope(root,identity):
    """Auditable correction for a stopped two-hair routing bug, no model call.

    Preserve every prior reservation/result. Three corrections per part means
    six one-part cycles, not a shared three-cycle ceiling. The user-authorized
    image ceiling (8 including initials) never increases.
    """
    from . import repair as repairs
    from .repair_store import read as rr,lease as rl,commit as rc
    with lease(root,identity):
        s=read(root,identity);context(root,s)
        require(s['mode']=='HAIR_REFRESH' and s['phase']=='DONE' and s['repair_id'] and not stopped(root,s),'HAIR_SCOPE_RESUME')
        with rl(root,s['repair_id']):
            r=rr(root,s['repair_id']);repairs.context(root,r)
            require(set(r['parts'] or [])=={'HAIR_FRONT','HAIR_BACK'} and r['attempts'] and not r['quality_approved'],'HAIR_SCOPE_RESUME')
            a=r['attempts'][-1];review=read_review(root,a['review_id']);plan=repairs.route(review,r['parts'])
            actionable=[p for p in plan if p['action']=='REGENERATE' and r['part_calls'].get(p['part'],0)<3]
            require(a['phase']=='DONE' and review['status']=='FAIL' and actionable,'HAIR_SCOPE_NO_DEFINITE_REPAIR')
            require(s['limits']['max_image_calls']==8 and r['image_calls_reserved']<6 and len(r['attempts'])<6,'HAIR_SCOPE_LIMIT')
            previous={k:r['limits'][k] for k in ('max_cycles','max_visual_calls')}
            r['limits'].update(max_cycles=6,max_visual_calls=6,max_calls_per_part=3)
            a['status']='REJECTED';r['status']='REQUIRES_REVIEW'
            r.setdefault('scope_corrections',[]).append({'previous_limits':previous,'image_ceiling_unchanged':8,'per_part_limit_unchanged':3,'reason':'DEFINITE_DEFECT_IN_OTHER_AUTHORIZED_HAIR_PART'})
            rc(root,r,'HAIR_SCOPE_ROUTING_CORRECTED_NO_MODEL_CALL')
        s['limits']['max_visual_calls']=7;s['phase']='REPAIR';s['status']='PLANNED'
        return commit(root,s,'HAIR_SCOPE_RESUMED_COUNTS_PRESERVED_NO_MODEL_CALL')


def reassess_ear_stage(root,identity):
    """Explicit review-only008→009 migration. Preserve every original context/call."""
    from .maintenance import fingerprint
    with lease(root,identity):
        s=read(root,identity);require(s['phase']=='DONE' and s.get('ear_stop_reason')=='FRONT_EARS_NOT_CONFIRMED' and s.get('ear_jobs',{}).get('HAIR_FRONT') and not s.get('stage_reassessments'),'EAR_REASSESS_SCOPE')
        require(s['limits']['live_review'] and totals(root,s)['visual_calls_reserved']<s['limits']['max_visual_calls'],'FLOW_STAGE_VISUAL_LIMIT')
        folder=directory(root,identity);old_name=s.get('context_file','context.json');old_path=folder/old_name;require(digest(old_path)==s['context_sha256'],'FLOW_CONTEXT_CHANGED');old=json.loads(old_path.read_text(encoding='utf-8'));current=contract(root);expected=copy.deepcopy(old['contract'])
        require(expected['shared']['review_prompt']=='review-prompt-008' and current['shared']['review_prompt']=='review-prompt-009','EAR_REASSESS_REVIEW_VERSION');expected['shared']['review_prompt']=current['shared']['review_prompt'];require(expected==current,'EAR_REASSESS_OTHER_CONTRACT_CHANGED')
        require(digest(photo_path(root,s['photo']))==old['photo_sha256'],'FLOW_STALE_PHOTO');load_design(root,s['design_id'])
        previous=s['candidates'][-1]['review_id'];r=read_review(root,previous,fresh=False);require(r['visual_call']['status']=='COMPLETED_ADVISORY','EAR_REASSESS_VALID_OLD_REVIEW_REQUIRED');check=next(c for c in r['visual_reviews'][-1]['data']['checks'] if c['category']=='ear_visibility');require(check['result']=='UNKNOWN','EAR_REASSESS_NOT_UNKNOWN')
        from .review_visual import evidence as validated_evidence
        _,evidence=validated_evidence(root,previous);require('ear-layer-guide.png' not in evidence['files'],'EAR_REASSESS_LAYER_ALREADY_SHOWN')
        updated=copy.deepcopy(old);updated['contract']=current;key=__import__('hashlib').sha256(canonical(updated)).hexdigest();name='context-ear-review-'+key+'.json';path=folder/name
        if not path.exists():atomic(path,updated)
        require(json.loads(path.read_text(encoding='utf-8'))==updated,'EAR_REASSESS_CONTEXT_CHANGED');new_review='review-'+uuid.uuid4().hex
        s['stage_reassessments']=[{'old_context_file':old_name,'old_context_sha256':s['context_sha256'],'new_context_file':name,'new_context_sha256':digest(path),'previous_review_id':previous,'new_review_id':new_review,'source_fingerprint':fingerprint(root),'additional_image_calls':0,'reason':'ADD_BOUND_UNOCCLUDED_EAR_LAYER_EVIDENCE'}]
        s.update(context_file=name,context_sha256=digest(path),review_id=new_review,phase='CAPTURE',status='PLANNED',ear_stage='FRONT_EARS',local_capture_retries=0)
        s.setdefault('authorized_review_ids',[]).append(new_review);s['candidates'][-1].setdefault('superseded_reviews',[]).append(previous);s['candidates'][-1]['review_id']=new_review;s.setdefault('previous_ear_stops',[]).append(s.pop('ear_stop_reason'));return commit(root,s,'EAR_LAYER_REASSESSMENT_NO_IMAGE_RESEND')
