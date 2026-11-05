"""Bounded original-photo repair cycles built on shared generation/assembly/review."""
import copy,hashlib,json,time,uuid
from pathlib import Path
from .assembly import canonical,VERSIONS,verify_bundle
from .design import ROOT,private_path,require,load_design,required_parts,digest,keys
from .repair_store import directory,read,commit,lease,cancel,atomic
from .character_flow import source_profile,bindings_from_directory,assemble_character
from .review import read_review,create_review,review_dir,policy,aggregate

DETERMINISTIC={'STANDARD_ARM_OUTLINE_OR_PALETTE','NORMALIZED_PART_MISMATCH','LAYOUT_GEOMETRY_MISMATCH','ORIENTATION_GUARD_CHANGED','HAIR_ATTACHMENT_MISSING','EAR_ATTACHMENT_VISIBILITY','EAR_IN_FRONT_OF_HAIR','ARM_BODY_ORDER','ARM_SKIRT_ORDER','ARM_IN_FRONT_OF_HEAD','LEG_BODY_ORDER','REAR_HEAD_RULE'}
CONTENT={'HEIGHT_MISMATCH','EAR_ALIGNMENT','HAIR_GAP','HAIR_COVERAGE','FRONT_BACK_HAIR_MISMATCH','STYLE_FAMILY_MISMATCH','VIEW_ANGLE','COARSE_COLOR_MISMATCH','GARMENT_TYPE_MISMATCH','NOISY_TEXTURE','SHOULDER_WING','BAKED_SLEEVE','LEG_GAP','SKIRT_LEG_EXPOSED','EMPTY_PART','OPAQUE_BACKGROUND','RAW_EMPTY_PART','RAW_OPAQUE_BACKGROUND','PROPORTION'}
DEFAULTS={'max_cycles':3,'max_image_calls':6,'max_calls_per_part':3,'max_visual_calls':3,'live_generation':False,'live_review':False}
NOT_SENT={'LIVE_DISABLED','LIVE_CALL_LIMIT','CODEX_CHATGPT_LOGIN_REQUIRED','CONFIG_KEYS','CONFIG_TYPE','PROVIDER_KEYS','CODEX_EXECUTABLE','CODEX_TIMEOUT','CALL_LIMIT','BILLING_CONFIG'}


def contract():
    from .review_visual import normative_criteria
    return {'workflow':VERSIONS['workflow']['revision'],'orientation':VERSIONS['workflow']['orientation_revision'],
        'review_prompt':VERSIONS['models']['review_prompt_revision'],'repair':VERSIONS['workflow']['repair_revision'],
        'criteria_sha256':hashlib.sha256(canonical(normative_criteria())).hexdigest()}


def limits(value,hair_scope=False):
    keys(value,tuple(DEFAULTS),'REPAIR_LIMIT_KEYS')
    for key,maximum in [('max_cycles',6 if hair_scope else 3),('max_image_calls',32 if VERSIONS['workflow']['revision']=='photo-to-skin-shared-014' else 18),('max_calls_per_part',3),('max_visual_calls',6 if hair_scope else 3)]:require(type(value[key]) is int and 1<=value[key]<=maximum,'REPAIR_LIMIT')
    for key in ('live_generation','live_review'):require(type(value[key]) is bool,'REPAIR_LIMIT')
    return copy.deepcopy(value)


def route(report,parts=None):
    defects=[*report['hard']['defects'],*report['render']['defects']]
    for review in report['visual_reviews']:
        if review is report['visual_reviews'][-1] or review['source']=='HUMAN':defects.extend(review['data']['defects'])
    rows=[];seen=set()
    latest=report['visual_reviews'][-1]['data'] if report['visual_reviews'] else {}
    rear_matches_front=any(c['category']=='hair_consistency' and c['result']=='PASS' and c.get('confidence',0)>=policy()['visual_confidence_floor'] for c in latest.get('checks',[]))
    for d in defects:
        code=d['code'];part=d.get('part','CHARACTER')
        if parts and part not in (*parts,'CHARACTER'):continue
        identity=(code,part)
        if identity in seen:continue
        seen.add(identity)
        certain=d.get('result')!='UNKNOWN' and d.get('confidence',0)>=policy()['visual_confidence_floor']
        kind='REQUIRES_REVIEW'
        if certain and code in DETERMINISTIC:kind='REASSEMBLE'
        elif certain and code in CONTENT and part!='CHARACTER':kind='STANDARD_ARM' if part.startswith('ARM') else 'REGENERATE'
        # User: rear rendering is judged only relative to front. A model's
        # standalone rear-vs-original style complaint cannot spend a repaint
        # when the same bound review confirms front/rear consistency.
        if part=='HAIR_BACK' and code in ('STYLE_DRIFT','NOISY_TEXTURE') and rear_matches_front:kind='REQUIRES_REVIEW'
        rows.append({'code':code,'part':part,'action':kind,'coordinate_action':'NONE_UNVERIFIED_BOXES_IGNORED'})
    return rows


def context(root,state):
    file=private_path(root,(directory(root,state['id'])/'context.json').relative_to(Path(root)).as_posix());require(digest(file)==state['context_sha256'],'REPAIR_CONTEXT_CHANGED')
    data=json.loads(file.read_text(encoding='utf-8'))
    try:require(load_design(root,state['design_id'])==data['design'],'REPAIR_STALE_DESIGN')
    except (ValueError,OSError,KeyError,TypeError):
        from .design import DesignError
        raise DesignError('REPAIR_STALE_DESIGN') from None
    require(digest(ROOT/'runtime/config/quality-policy.json')==data['policy_sha256'],'REPAIR_STALE_POLICY')
    source,atlas,_=source_profile(root);require(digest(source)==data['mother_sha256'] and digest(atlas)==data['atlas_sha256'],'REPAIR_STALE_TEMPLATE')
    require(VERSIONS['workflow']['repair_revision']==data['repair_revision'],'REPAIR_STALE_VERSION')
    require(data.get('contract')==contract(),'REPAIR_STALE_VERSION')
    require(digest(private_path(root,(review_dir(root,state['source_review'])/'report.json').relative_to(Path(root)).as_posix()))==data['source_review_sha256'],'REPAIR_STALE_REVIEW')
    read_review(root,state['source_review']);return data


def create(root,review_id,options=None,parts=None):
    root=Path(root).resolve();report=read_review(root,review_id);record=load_design(root,report['design_id']);cfg=limits(DEFAULTS if options is None else options,hair_scope=isinstance(parts,list) and set(parts)=={'HAIR_FRONT','HAIR_BACK'})
    require(parts is None or (isinstance(parts,list) and bool(parts) and len(set(parts))==len(parts) and set(parts)<=set(required_parts(record['design']))),'REPAIR_PARTS')
    src=json.loads((review_dir(root,review_id)/'context.json').read_text(encoding='utf-8'));base=src['character_output'];verify_bundle(private_path(root,base+'/export/bundle'))
    identity='repair-'+uuid.uuid4().hex;folder=directory(root,identity);folder.mkdir(parents=True)
    source,atlas,_=source_profile(root)
    frozen={'source_review_sha256':digest(review_dir(root,review_id)/'report.json'),'design':record,'base_output':base,'policy_sha256':digest(ROOT/'runtime/config/quality-policy.json'),
        'mother_sha256':digest(source),'atlas_sha256':digest(atlas),'repair_revision':VERSIONS['workflow']['repair_revision'],'contract':contract()}
    atomic(folder/'context.json',frozen)
    state={'id':identity,'schema_version':VERSIONS['product']['repair_schema'],'design_id':record['design_id'],'source_review':review_id,'context_sha256':digest(folder/'context.json'),
        'limits':cfg,'parts':parts,'plan':route(report,parts),'attempts':[],'image_calls_reserved':0,'visual_calls_reserved':0,'part_calls':{},
        'best_output':base,'best_review':review_id,'best_manifest_sha256':digest(private_path(root,base+'/export/bundle/build-manifest.json')),
        'status':'PLANNED','phase':'PLAN','production_approved':False,'quality_approved':False,'sequence':0}
    source_flow=json.loads(private_path(root,base+'/export/bundle/flow-manifest.json').read_text(encoding='utf-8'))
    if source_flow.get('owner_flow_id'):state['parent_flow_id']=source_flow['owner_flow_id']
    return commit(root,state,'CREATED')


def task_report(root,identity):
    state=read(root,identity);state['cancel_requested']=(directory(root,identity)/'cancel.requested').exists()
    try:context(root,state)
    except (ValueError,OSError,KeyError,TypeError) as error:state={**state,'status':'STALE','stale_code':getattr(error,'code','REPAIR_SOURCE_INVALID')}
    return state


def candidate_bindings(root,state,attempt):
    from .character_flow import bindings_from_source
    bindings,_=bindings_from_source(root,state['design_id'],attempt['base_output'])
    for part,job in attempt['jobs'].items():bindings[part]={'job_id':job}
    return bindings


def harvest_generation(root,job_id):
    """Do not resend a queued/unknown call; collect only a returned original result."""
    from .codex_subscription import collect_image_result
    from .generation import image_bytes,settings
    folder=private_path(root,'runtime/work/M04/generation/jobs/'+job_id)
    if not (folder/'report.json').is_file():return None
    r=json.loads((folder/'report.json').read_text(encoding='utf-8'))
    if r.get('error_code') in ('CODEX_OUTPUT_MODERATION_BLOCKED','CODEX_IMAGEGEN_UNAVAILABLE','CODEX_SUBSCRIPTION_LIMIT_REACHED'):
        from .generation import GenerationError
        raise GenerationError(r['error_code'])
    if r['status']=='GENERATED_AWAITING_MANUAL_REVIEW':require(digest(folder/'image.png')==r['image_sha256'],'JOB_IMAGE_CHANGED');return r
    if r.get('provider')!='codex' or not (folder/'codex-result.json').is_file():return None
    refs=[private_path(root,(folder/'references'/x['file']).relative_to(Path(root)).as_posix()) for x in r['references']]
    require(all(digest(p)==ref['sha256'] for p,ref in zip(refs,r['references'])),'JOB_REFERENCE_CHANGED')
    from .character_session import for_design,recover_returned
    session=for_design(root,r.get('design_id'),r.get('character_session_flow') or r.get('flow_id'))
    content,usage=collect_image_result(settings(root)['codex'],refs,folder,r['started_at'],session=session);image=image_bytes(content)
    (folder/'raw-image.bin').write_bytes(content);image.save(folder/'image.png');r.update(status='GENERATED_AWAITING_MANUAL_REVIEW',canvas=list(image.size),alpha_ready=image.getchannel('A').getextrema()[0]<255,
        raw_sha256=hashlib.sha256(content).hexdigest(),image_sha256=digest(folder/'image.png'),local_harvest_no_model_call=True)
    proof=folder/'local-output-path-recovery.json'
    if proof.is_file():
        r['local_output_path_recovery_sha256']=digest(proof);r['recovery_previous_error_code']=r.pop('error_code',None)
    from .character_session import for_design,recover_returned
    recover_returned(for_design(root,r.get('design_id'),r.get('character_session_flow') or r.get('flow_id')),folder,folder/'codex-events.jsonl')
    atomic(folder/'report.json',r);return r


def review_is_approved(root,review):
    if review['status']!='PASS' or aggregate(review)!='PASS':return False
    from .review_visual import validate_visual
    require(review['visual_reviews'][-1]['source']=='HUMAN','REPAIR_QUALITY_APPROVAL_REQUIRED')
    validate_visual(root,review['review_id'],review['visual_reviews'][-1]['data']);return True


def begin_attempt(root,state):
    cfg=state['limits'];n=len(state['attempts'])+1
    if any(a['code'] in ('BUNDLE_INTEGRITY','INPUT_PROVENANCE','DESIGN_OR_PHOTO_CHANGED','FIXED_RIG_CHANGED','FIXED_ATTACHMENT_CHANGED','ANIMATION_CURVES_CHANGED','FIXED_TEXTURE_CHANGED') for a in state['plan']):
        state['status']='REQUIRES_REVIEW';return commit(root,state,'INTEGRITY_REVIEW_REQUIRED_NO_AUTOMATIC_REPAIR')
    if n>cfg['max_cycles']:state['status']='LIMIT_REACHED';return commit(root,state,'CYCLE_LIMIT')
    todo={}
    for action in state['plan']:
        if action['action']=='REGENERATE':todo.setdefault(action['part'],[]).append(action['code'])
    if VERSIONS['workflow']['revision']=='photo-to-skin-shared-014' and todo:
        from .character_session import for_design
        ref=for_design(root,state['design_id'],state.get('parent_flow_id'))
        if ref:
            counts=json.loads((ref['folder']/'session.json').read_text(encoding='utf-8'))['parts'];todo={p:c for p,c in todo.items() if counts.get(p,0)<4}
    if not todo and not any(a['action'] in ('REASSEMBLE','STANDARD_ARM') for a in state['plan']):
        state['status']='REQUIRES_REVIEW';return commit(root,state,'NO_SAFE_AUTOMATIC_ACTION')
    if todo and not cfg['live_generation']:state['status']='LIVE_DISABLED';return commit(root,state,'GENERATION_DISABLED')
    if state['image_calls_reserved']+len(todo)>cfg['max_image_calls'] or any(state['part_calls'].get(p,0)>=cfg['max_calls_per_part'] for p in todo):
        state['status']='LIMIT_REACHED';return commit(root,state,'IMAGE_LIMIT')
    _,_,profile=source_profile(root);requests={}
    from .repair_requests import make,feedback
    feedback_review=state['attempts'][-1]['review_id'] if state['attempts'] and state['attempts'][-1]['phase']=='DONE' else state['source_review']
    for part,codes in todo.items():requests[part]=make(root,state['design_id'],profile,part,codes,state['id'],n,model_feedback=feedback(root,feedback_review,part,codes))[0]
    output=(directory(root,state['id'])/'attempts'/str(n)/'candidate').relative_to(Path(root)).as_posix()
    (directory(root,state['id'])/'attempts'/str(n)).mkdir(parents=True)
    attempt={'number':n,'base_output':state.get('working_output',state['best_output']),'output':output,'requests':requests,'jobs':{},'sent':[],
        'review_id':'review-'+uuid.uuid4().hex,'superseded_reviews':[],'phase':'GENERATE','status':'RUNNING','deterministic_only':not bool(todo)}
    state['attempts'].append(attempt);state.update(status='RUNNING',phase='GENERATE');return commit(root,state,'ATTEMPT_PLANNED')


def checkpoint(root,state,event,hook):
    if state['attempts']:state['phase']=state['attempts'][-1]['phase']
    commit(root,state,event)
    if hook:hook(event,copy.deepcopy(state))


def work_attempt(root,state,hook=None):
    from .generation import generate
    from .review_render import collect_evidence
    from .review_visual import run_visual,recover_visual_result
    attempt=state['attempts'][-1];cfg=state['limits'];_,atlas,profile=source_profile(root)
    def cancelled():return (directory(root,state['id'])/'cancel.requested').exists()
    if attempt['phase']=='GENERATE':
        for part,request_id in attempt['requests'].items():
            context(root,state)
            if cancelled():break
            if part in attempt['sent']:
                r=harvest_generation(root,attempt['jobs'][part])
                if r is None:state['status']='WAIT_RESULT';checkpoint(root,state,'GENERATION_RESULT_UNKNOWN',hook);return state
            else:
                # Persist the intended job ID and upper-bound spend BEFORE any send.
                attempt['jobs'][part]='job-'+uuid.uuid4().hex;attempt['sent'].append(part);state['image_calls_reserved']+=1;state['part_calls'][part]=state['part_calls'].get(part,0)+1
                checkpoint(root,state,'GENERATION_RESERVED',hook)
                if cancelled():break
                generate(root,profile,atlas,{'provider':'codex','part':part,'description':'','execute':True,'design_id':state['design_id'],'repair_request_id':request_id},job_id=attempt['jobs'][part])
                checkpoint(root,state,'GENERATION_RETURNED',hook)
        if cancelled():state['status']='CANCELLED';checkpoint(root,state,'CANCELLED',hook);return state
        attempt['phase']='ASSEMBLE';checkpoint(root,state,'READY_TO_ASSEMBLE',hook)
    if attempt['phase']=='ASSEMBLE':
        context(root,state)
        destination=private_path(root,attempt['output'])
        if destination.exists():verify_bundle(destination/'export/bundle')
        else:
            flow=json.loads(private_path(root,attempt['base_output']+'/export/bundle/flow-manifest.json').read_text(encoding='utf-8'))
            if flow.get('geometry_fit'):assemble_character(root,state['design_id'],candidate_bindings(root,state,attempt),attempt['output'],auto_fit=True,fit_revision=flow['geometry_fit']['revision'])
            else:assemble_character(root,state['design_id'],candidate_bindings(root,state,attempt),attempt['output'])
        attempt['manifest_sha256']=digest(destination/'export/bundle/build-manifest.json');clock=destination/'processing-timing.json';attempt['processing_timing_sha256']=digest(clock) if clock.is_file() else None;attempt['phase']='CAPTURE';checkpoint(root,state,'ASSEMBLED',hook)
    if cancelled():state['status']='CANCELLED';checkpoint(root,state,'CANCELLED',hook);return state
    if attempt['phase']=='CAPTURE':
        context(root,state)
        folder=review_dir(root,attempt['review_id'])
        if (folder/'report.json').exists():
            review=read_review(root,attempt['review_id'])
            if review['render']['status'] in ('RUNNING','ERROR'):
                attempt['superseded_reviews'].append(attempt['review_id']);attempt['review_id']='review-'+uuid.uuid4().hex;checkpoint(root,state,'LOCAL_CAPTURE_RESTART_NO_MODEL_CALL',hook)
        review=create_review(root,attempt['output'],attempt['review_id']);checkpoint(root,state,'REVIEW_CREATED',hook)
        if review['hard']['status']=='FAIL':attempt['phase']='COMPARE'
        else:
            if review['render']['status']=='NOT_RUN':review=collect_evidence(root,attempt['review_id'])
            if review['render']['status']=='ERROR' and attempt.get('local_capture_retries',0)<1:
                attempt['local_capture_retries']=attempt.get('local_capture_retries',0)+1;attempt['superseded_reviews'].append(attempt['review_id']);attempt['review_id']='review-'+uuid.uuid4().hex;checkpoint(root,state,'LOCAL_CAPTURE_RETRY_ONCE_NO_IMAGE_CALL',hook)
                review=create_review(root,attempt['output'],attempt['review_id']);review=collect_evidence(root,attempt['review_id'])
            if review['render']['status']=='ERROR':
                state['status']='ERROR_OR_RESULT_UNKNOWN';checkpoint(root,state,'LOCAL_CAPTURE_FAILED_NOT_A_COMPLETED_COMPARISON',hook);return state
            attempt['phase']='VISION';checkpoint(root,state,'CAPTURED',hook)
    if cancelled():state['status']='CANCELLED';checkpoint(root,state,'CANCELLED',hook);return state
    if attempt['phase']=='VISION':
        review=read_review(root,attempt['review_id'])
        if review['render']['status']!='PASS':attempt['phase']='COMPARE'
        elif not cfg['live_review']:attempt['phase']='COMPARE'
        elif review['visual_call']['status']=='NOT_RUN':
            if attempt.get('visual_reserved'):
                state['status']='WAIT_RESULT';checkpoint(root,state,'VISION_SEND_UNKNOWN_NO_RETRY',hook);return state
            if state['visual_calls_reserved']>=cfg['max_visual_calls']:state['status']='LIMIT_REACHED';checkpoint(root,state,'VISION_LIMIT',hook);return state
            state['visual_calls_reserved']+=1;attempt['visual_reserved']=True;checkpoint(root,state,'VISION_RESERVED',hook)
            returned=run_visual(root,attempt['review_id'])
            if returned['visual_call']['status'] in ('RUNNING','ERROR_OR_RESULT_UNKNOWN_NO_RETRY'):
                recovered=recover_visual_result(root,attempt['review_id'])
                if recovered is None:
                    state['status']='WAIT_RESULT';checkpoint(root,state,'VISION_INVALID_OR_UNKNOWN_NOT_A_COMPLETED_COMPARISON',hook);return state
            attempt['phase']='COMPARE';checkpoint(root,state,'VISION_RETURNED',hook)
        elif review['visual_call']['status'] in ('RUNNING','ERROR_OR_RESULT_UNKNOWN_NO_RETRY'):
            recovered=recover_visual_result(root,attempt['review_id'])
            if recovered is None:state['status']='WAIT_RESULT';checkpoint(root,state,'VISION_RESULT_UNKNOWN',hook);return state
            attempt['phase']='COMPARE'
        else:attempt['phase']='COMPARE'
    if cancelled():state['status']='CANCELLED';checkpoint(root,state,'CANCELLED',hook);return state
    if attempt['phase']=='COMPARE':
        context(root,state)
        review=read_review(root,attempt['review_id']);baseline=read_review(root,state['best_review']);definite=lambda r:{(d['code'],d.get('part','CHARACTER')) for section in ('hard','render') for d in r[section]['defects'] if d.get('result')=='FAIL'}
        before,after=definite(baseline),definite(review)
        unchanged=attempt['deterministic_only'] and all(digest(private_path(root,attempt['base_output']+'/raw/'+part+'.png'))==digest(private_path(root,attempt['output']+'/raw/'+part+'.png')) for part in required_parts(load_design(root,state['design_id'])['design']) if not part.startswith('ARM'))
        improved=attempt['deterministic_only'] and unchanged and bool(before-after) and not after-before and review['render']['status']=='PASS'
        accepted=review_is_approved(root,review)
        attempt['comparison']={'base_failures':len(before),'candidate_failures':len(after),'technical_improvement':improved,'quality_approved':accepted,'baseline_retained':not (improved or accepted)}
        target_failed=any(d.get('part') in (state['parts'] or attempt['requests']) for entry in review['visual_reviews'][-1:] for d in entry['data']['defects']) or bool(after)
        with lease(root,state['id'],'decision.lock',wait=True):
            if cancelled():state['status']='CANCELLED';checkpoint(root,state,'CANCELLED',hook);return state
            if improved or accepted:state.update(best_output=attempt['output'],best_review=attempt['review_id'],best_manifest_sha256=attempt['manifest_sha256'],quality_approved=accepted)
            attempt['status']='REJECTED' if review['status']=='FAIL' and target_failed else 'REQUIRES_REVIEW' if not accepted else 'ACCEPTED';attempt['phase']='DONE';state.update(phase='DONE',status='READY_FOR_REVIEWED_EXPORT' if accepted else 'REQUIRES_REVIEW')
            checkpoint(root,state,'COMPARED_BEST_PRESERVED_OR_PROMOTED',hook)
    return state


def advance(root,identity,hook=None):
    root=Path(root).resolve()
    with lease(root,identity):
        state=read(root,identity)
        try:
            context(root,state)
            if (directory(root,identity)/'cancel.requested').exists():state['status']='CANCELLED';return commit(root,state,'CANCELLED')
            if state['status']=='OUTPUT_BLOCKED':return state
            if state['attempts'] and state['attempts'][-1]['phase']=='DONE':
                attempt=state['attempts'][-1];review=read_review(root,attempt['review_id'])
                if review_is_approved(root,review):
                    with lease(root,identity,'decision.lock',wait=True):
                        if (directory(root,identity)/'cancel.requested').exists():state['status']='CANCELLED';return commit(root,state,'CANCELLED')
                        state.update(best_output=attempt['output'],best_review=attempt['review_id'],best_manifest_sha256=attempt['manifest_sha256'],quality_approved=True,status='READY_FOR_REVIEWED_EXPORT');attempt['status']='ACCEPTED'
                        return commit(root,state,'VERIFIED_REVIEW_ACCEPTED_NO_MODEL_CALL')
                # Only a definite quality rejection can spend another bounded cycle.
                if state['attempts'][-1]['status']!='REJECTED':return state
                state['plan']=route(review,state['parts']);state['working_output']=attempt['output']
                commit(root,state,'REPLAN_FROM_LATEST_REJECTED_REVIEW')
            if not state['attempts'] or state['attempts'][-1]['phase']=='DONE':state=begin_attempt(root,state)
            if state['status'] in ('LIVE_DISABLED','LIMIT_REACHED','REQUIRES_REVIEW') and (not state['attempts'] or state['attempts'][-1]['phase']=='DONE'):return state
            state['status']='RUNNING';state.pop('error_code',None);checkpoint(root,state,'WORKER_RESUMED',hook);return work_attempt(root,state,hook)
        except (ValueError,OSError,KeyError,TypeError) as error:
            code=getattr(error,'code',type(error).__name__);state['status']='STALE' if 'STALE' in code else 'OUTPUT_BLOCKED' if code in ('CODEX_OUTPUT_MODERATION_BLOCKED','CODEX_IMAGEGEN_UNAVAILABLE','CODEX_SUBSCRIPTION_LIMIT_REACHED') else 'ERROR_OR_RESULT_UNKNOWN'
            if code in NOT_SENT and state['attempts'] and state['attempts'][-1]['phase']=='GENERATE':
                a=state['attempts'][-1]
                if a['sent']:
                    part=a['sent'][-1];job=private_path(root,'runtime/work/M04/generation/jobs/'+a['jobs'][part])
                    if not job.exists():
                        a['sent'].remove(part);a['jobs'].pop(part);state['image_calls_reserved']-=1;state['part_calls'][part]-=1;state['status']='CONFIGURATION_BLOCKED'
            state['error_code']=code;state.setdefault('error_history',[]).append({'code':code,'phase':state['phase']});commit(root,state,'WORKER_ERROR_NO_AUTOMATIC_RESEND');return state
