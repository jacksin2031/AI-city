"""Register genuinely new local photos, then use the EXISTING full pipeline."""
import hashlib,json,re,time,uuid
from pathlib import Path
from .assembly import canonical,VERSIONS
from .design import private_path,photo_path,require,digest
from .photo_import import normalized
from .pipeline_store import atomic
from .maintenance import fingerprint

TAGS={'short_hair','long_hair','tied_hair','pants','skirt','full_photo','partial_photo','light_clothes','dark_clothes'}


def pixels(path):
    im=normalized(path.read_bytes());return hashlib.sha256(str(im.size).encode()+im.tobytes()).hexdigest()


def seen_photos(root):
    seen=set();hashes=set()
    for p in (Path(root)/'runtime/work/M04/generation/jobs').glob('job-*/references/character.png'):
        safe=private_path(root,p.relative_to(root).as_posix());sha=digest(safe)
        if sha not in hashes:seen.add(pixels(safe));hashes.add(sha)
    for p in (Path(root)/'runtime/work/M07/tasks').glob('flow-*/analysis/request.json'):
        request=json.loads(private_path(root,p.relative_to(root).as_posix()).read_text(encoding='utf-8'))
        for name in request.get('image_files',[]):
            image=private_path(root,name)
            if image.is_file() and image.parent==Path(root)/'runtime/work/M04':seen.add(pixels(image))
    return seen


def folder(root,identity):
    require(re.fullmatch(r'blind-[a-f0-9]{32}',identity or ''),'BLIND_ID')
    return private_path(root,'runtime/work/M08/blind/'+identity)


def register(root,cases):
    require(isinstance(cases,list) and 1<=len(cases)<=8,'BLIND_CASES');seen=seen_photos(root);identities=set();rows=[]
    for i,c in enumerate(cases,1):
        require(isinstance(c,dict) and set(c)=={'photo','tags'} and isinstance(c['tags'],list) and set(c['tags'])<=TAGS,'BLIND_CASE')
        image=photo_path(root,c['photo']);key=pixels(image)
        require(key not in seen and key not in identities,'BLIND_PHOTO_ALREADY_SEEN');identities.add(key)
        rows.append({'number':i,'photo':c['photo'],'photo_sha256':digest(image),'pixel_sha256':key,'tags':c['tags']})
    identity='blind-'+uuid.uuid4().hex;path=folder(root,identity);path.mkdir(parents=True)
    pool=private_path(root,'runtime/work/M08/holdout-index');pool.mkdir(parents=True,exist_ok=True)
    for row in rows:
        with (pool/(row['pixel_sha256']+'.reserved')).open('x',encoding='utf-8') as f:f.write(identity)
    from .pipeline_service import dispatch
    from .pipeline import DEFAULTS
    for row in rows:
        task=dispatch('create',{'mode':'GENERATE','photo':row['photo'],'character_id':'m08-'+str(row['number']),
            'limits':{**DEFAULTS,'live_design':True,'live_generation':True,'live_review':True,'max_image_calls':18,'max_visual_calls':7,'max_repair_cycles':3}},root)
        row['task_id']=task['id']
    value={'id':identity,'source_fingerprint':fingerprint(root),'created_at':time.time(),'cases':rows,'scope':'FULL_GENERATION_NOT_HAIR_REFRESH','production_approved':False}
    with (path/'batch.json').open('xb') as f:f.write(canonical(value))
    return value


def register_retest(root,cases,parent_identity,reuse_all=False,one_version=False):
    """Explicit user retest. Never reclassifies the reused photos as unseen."""
    parent=load(root,parent_identity,verify_source=False)
    require(isinstance(cases,list) and len(cases)==len(parent['cases'])==4,'RETEST_CASES')
    require(type(reuse_all) is bool and type(one_version) is bool,'RETEST_OPTIONS')
    seen=seen_photos(root);rows=[];unique=set();identity='blind-'+uuid.uuid4().hex
    for number,(case,prior) in enumerate(zip(cases,parent['cases']),1):
        require(isinstance(case,dict) and set(case)=={'photo','tags'} and isinstance(case['tags'],list) and set(case['tags'])<=TAGS,'BLIND_CASE')
        image=photo_path(root,case['photo']);pixel=pixels(image);require(pixel not in unique,'BLIND_PHOTO_ALREADY_SEEN');unique.add(pixel)
        if number==3 and not reuse_all:require(pixel!=prior['pixel_sha256'] and pixel not in seen,'RETEST_REPLACEMENT_MUST_BE_NEW')
        else:require(case['photo']==prior['photo'] and digest(image)==prior['photo_sha256'],'RETEST_ORIGINAL_PHOTO_CHANGED')
        owner=identity if number==3 and not reuse_all else prior.get('enrollment_owner',parent_identity)
        rows.append({'number':number,'photo':case['photo'],'photo_sha256':digest(image),'pixel_sha256':pixel,'tags':case['tags'],'enrollment_owner':owner})
    path=folder(root,identity);path.mkdir(parents=True);pool=private_path(root,'runtime/work/M08/holdout-index');pool.mkdir(parents=True,exist_ok=True)
    new=rows[2]
    if not reuse_all:
        with (pool/(new['pixel_sha256']+'.reserved')).open('x',encoding='utf-8') as stream:stream.write(identity)
    from .pipeline_service import dispatch
    from .pipeline import DEFAULTS
    for row in rows:
        task=dispatch('create',{'mode':'GENERATE','photo':row['photo'],'character_id':'character014-'+identity[-8:]+'-'+str(row['number']),
            'limits':{**DEFAULTS,'live_design':True,'live_generation':True,'live_review':True,'max_image_calls':40 if VERSIONS['workflow']['revision']=='photo-to-skin-shared-014' else 18,'max_visual_calls':20 if VERSIONS['workflow']['revision']=='photo-to-skin-shared-014' else 7,'max_repair_cycles':0 if one_version and VERSIONS['workflow']['revision']!='photo-to-skin-shared-014' else 3}},root);row['task_id']=task['id']
    value={'id':identity,'source_fingerprint':fingerprint(root),'created_at':time.time(),'cases':rows,'scope':'EXPLICIT_USER_RETEST_NOT_BLIND','parent_batch':parent_identity,'reused_all_photos':reuse_all,'one_version':one_version,'production_approved':False}
    with (path/'batch.json').open('xb') as stream:stream.write(canonical(value))
    return value


def load(root,identity,verify_source=True):
    value=json.loads((folder(root,identity)/'batch.json').read_text(encoding='utf-8'))
    require(value['id']==identity,'BLIND_ID')
    if verify_source:require(value['source_fingerprint']==fingerprint(root),'BLIND_SOURCE_CHANGED')
    for row in value['cases']:
        require(digest(photo_path(root,row['photo']))==row['photo_sha256'],'BLIND_PHOTO_CHANGED')
        owner=row.get('enrollment_owner',identity)
        if owner!=identity:
            parent=json.loads((folder(root,value['parent_batch'])/'batch.json').read_text(encoding='utf-8'));prior=parent['cases'][row['number']-1]
            require(value['scope']=='EXPLICIT_USER_RETEST_NOT_BLIND' and prior['photo_sha256']==row['photo_sha256'] and prior['pixel_sha256']==row['pixel_sha256'] and owner==prior.get('enrollment_owner',parent['id']),'RETEST_PARENT_BINDING')
        require((private_path(root,'runtime/work/M08/holdout-index')/(row['pixel_sha256']+'.reserved')).read_text(encoding='utf-8')==owner,'BLIND_ENROLLMENT_CHANGED')
    return value


def advance_case(root,identity,number):
    from .pipeline_service import dispatch
    value=load(root,identity);require(type(number) is int and 1<=number<=len(value['cases']),'BLIND_CASE_NUMBER');case=value['cases'][number-1]
    path=folder(root,identity)/('run-'+uuid.uuid4().hex+'.json');record={'case':number,'task_id':case['task_id'],'started_at':time.time(),'finished':False,'seconds':None};atomic(path,record)
    start=time.monotonic()
    try:return dispatch('advance',{'id':case['task_id']},root)
    finally:record.update(finished=True,seconds=time.monotonic()-start);atomic(path,record)


def metrics(root,identity,allow_archived=False):
    from .pipeline_service import report
    from .repair_store import read as repair_read
    v=load(root,identity,verify_source=not allow_archived);rows=[]
    for c in v['cases']:
        s=report(root,c['task_id']);jobs={*s['jobs'].values(),*(x['job_id'] for x in s.get('failed_jobs',[]))}
        jobs.update(s.get('ear_jobs',{}).values())
        if s.get('repair_id'):
            for a in repair_read(root,s['repair_id'])['attempts']:jobs.update(a['jobs'].values())
        counts={};returned=0;usage=[]
        for job in jobs:
            p=private_path(root,'runtime/work/M04/generation/jobs/'+job+'/report.json')
            if not p.is_file():continue
            r=json.loads(p.read_text(encoding='utf-8'));part=('EARS_'+r['part'].split('_')[1]) if r.get('artifact_role')=='EAR_ONLY_PASS' else r['part'];counts[part]=counts.get(part,0)+1;returned+=r['status']=='GENERATED_AWAITING_MANUAL_REVIEW'
            if r.get('usage'):usage.append(r['usage'])
        runs=[json.loads(p.read_text(encoding='utf-8')) for p in folder(root,identity).glob('run-*.json')];runs=[r for r in runs if r['case']==c['number']]
        judgments=judgment_metrics(root,identity,c['number'],v['source_fingerprint'])
        rows.append({'case':c['number'],'tags':c['tags'],'status':s['status'],'finished':s['phase']=='DONE','per_part_requests':counts,'returned_images':returned,
            'design_requests':s['design_calls_reserved'],'image_requests':s['image_calls_reserved'],'visual_requests':s['visual_calls_reserved'],
            'measured_run_seconds':sum(r['seconds'] for r in runs if r['seconds'] is not None),'interrupted_timing_unknown':any(not r['finished'] for r in runs),
            'reported_usage':usage or None,'quality_approved':s['quality_approved'],**judgments})
    return {'id':identity,'cases':rows,'scope':v['scope'],'source_fingerprint':v['source_fingerprint'],'source_current':v['source_fingerprint']==fingerprint(root),'production_approved':False,'ground_truth':'HUMAN_LABELS_REQUIRED_FOR_ERROR_RATES','note_ja':'誤り率は正解ラベル付きの補助チェック単位です。本番自動放行率・利用枠残量・課金額ではありません。旧コードの記録は閲覧専用で、新しい実行の検証として扱いません。'}


def adjudicate(root,identity,number,labels,human_confirmed=False):
    """Explicit local operator labels; never imports AI guesses as ground truth."""
    from .pipeline_service import report
    from .review import read_review,review_dir,policy
    require(human_confirmed is True,'BLIND_HUMAN_CONFIRMATION_REQUIRED');value=load(root,identity)
    require(type(number) is int and 1<=number<=len(value['cases']) and isinstance(labels,list) and 1<=len(labels)<=64,'BLIND_JUDGMENTS')
    task_id=value['cases'][number-1]['task_id'];s=report(root,task_id);out=folder(root,identity)/'judgments';out.mkdir(exist_ok=True);prepared={}
    for label in labels:
        require(isinstance(label,dict) and set(label)=={'manifest_sha256','category','expected'} and label['category'] in policy()['required_visual_checks'] and label['expected'] in ('PASS','FAIL','NOT_APPLICABLE'),'BLIND_JUDGMENT')
        candidate=next((c for c in s['previews'] if c['manifest_sha256']==label['manifest_sha256']),None);require(candidate is not None,'BLIND_CANDIDATE_BINDING')
        p=review_dir(root,candidate['review_id'])/'report.json';before=digest(p);r=read_review(root,candidate['review_id'])
        model=next((v for v in reversed(r['visual_reviews']) if v['source']=='CODEX_SUBSCRIPTION'),None)
        check=next((c for c in model['data']['checks'] if c['category']==label['category']),None) if model else None
        verdict=check['result'] if check and check['confidence']>=policy()['visual_confidence_floor'] else 'UNKNOWN'
        require(digest(p)==before,'BLIND_REVIEW_CHANGED')
        record={**label,'case':number,'review_id':candidate['review_id'],'report_sha256':before,'model_result':verdict,'source':'EXPLICIT_LOCAL_HUMAN_OPERATOR','source_fingerprint':value['source_fingerprint']}
        name=f"{number}-{candidate['manifest_sha256'][:16]}-{label['category']}-{before[:16]}.json"
        require(name not in prepared,'BLIND_DUPLICATE_JUDGMENT');prepared[name]=(record,p,before)
    from .pipeline_store import lease
    added=0;already=0
    with lease(root,task_id,'decision.lock',wait=True):
        for record,p,before in prepared.values():require(digest(p)==before,'BLIND_REVIEW_CHANGED')
        for name,(record,_,_) in prepared.items():
            p=private_path(root,(out/name).relative_to(root).as_posix())
            if p.exists():require(p.read_bytes()==canonical(record)+b'\n','BLIND_JUDGMENT_CONFLICT');already+=1
            else:atomic(p,record);added+=1
    return {'recorded':added,'already_recorded':already,'quality_approved':False,'production_approved':False}


def judgment_metrics(root,identity,number,pin=None):
    from .review import review_dir
    rows=[];stale=0;pin=pin or fingerprint(root)
    for p in (folder(root,identity)/'judgments').glob(str(number)+'-*.json'):
        try:
            row=json.loads(private_path(root,p.relative_to(root).as_posix()).read_text(encoding='utf-8'))
            require(row['case']==number and row['source']=='EXPLICIT_LOCAL_HUMAN_OPERATOR' and row['source_fingerprint']==pin,'BLIND_JUDGMENT_BINDING')
            require(digest(review_dir(root,row['review_id'])/'report.json')==row['report_sha256'],'BLIND_REVIEW_CHANGED');rows.append(row)
        except (ValueError,OSError,KeyError,TypeError):stale+=1
    definite=[r for r in rows if r['expected'] in ('PASS','FAIL') and r['model_result'] in ('PASS','FAIL')]
    wrong=sum(r['model_result']=='PASS' and r['expected']=='FAIL' for r in definite);allowed=sum(r['model_result']=='PASS' for r in definite);bad=sum(r['expected']=='FAIL' for r in definite)
    denied=sum(r['model_result']=='FAIL' for r in definite);wrong_reject=sum(r['model_result']=='FAIL' and r['expected']=='PASS' for r in definite)
    return {'labeled_checks':len(rows),'definite_labeled_checks':len(definite),'stale_labels':stale,'unknown_labeled_checks':sum(r['model_result']=='UNKNOWN' for r in rows),
        'false_accept_rate':wrong/allowed if allowed else None,'missed_defect_rate':wrong/bad if bad else None,'false_reject_rate':wrong_reject/denied if denied else None,
        'error_rate_scope':'AUXILIARY_CHECKS_WITH_EXPLICIT_HUMAN_REFERENCE_NOT_PRODUCTION_APPROVAL'}


def catalogue(root):
    rows=[];base=private_path(root,'runtime/work/M08/blind')
    if not base.exists():return rows
    for p in sorted(base.glob('blind-*/batch.json')):
        try:
            m=metrics(root,p.parent.name,allow_archived=True);rows.append({'id':m['id'],'scope':m['scope'],'status':'RECORDED' if m['source_current'] else 'STALE','cases':m['cases'],'completed_cases':sum(c['finished'] for c in m['cases'])})
        except (ValueError,OSError,KeyError,TypeError):rows.append({'id':p.parent.name,'status':'STALE','cases':[],'completed_cases':0})
    return rows
