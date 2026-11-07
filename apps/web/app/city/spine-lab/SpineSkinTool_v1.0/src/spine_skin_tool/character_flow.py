"""Frozen requests, verified bindings and atomic full-character exports."""
import copy
import hashlib
import json
import os
import errno
from pathlib import Path
import tempfile
import uuid,time

from .assembly import canonical,make_profile,verify_bundle,bundle_zip,VERSIONS
from .design import (ROOT,DesignError,require,private_path,load_design,required_parts,
                     part_request,arm_style,digest)
from .mother import prepare
from .reference_assets import library_root


def source_profile(root):
    source,atlas,_,_=prepare(root)
    return source,atlas,make_profile(source,atlas)


def prepare_requests(root,identity):
    from .generation import references
    root=Path(root).resolve();record=load_design(root,identity);source,atlas,profile=source_profile(root)
    plans=private_path(root,'runtime/work/M04/character-flow/plans');plans.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='.request-',dir=plans));parts={}
    for part in required_parts(record['design']):
        item=part_request(root,record,profile,part)
        if part.startswith('ARM'):
            path=library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images/harri/arm.png'
            item['references']=[{'role':'original_harri_arm','sha256':digest(path)}]
        else:
            folder=stage/part;folder.mkdir()
            paths=references(profile,atlas,part,folder,root,record['design']['photo']['file'])
            item['references']=[{'role':role,'file':p.relative_to(stage).as_posix(),'sha256':digest(p)} for role,p in zip(item['reference_roles'],paths)]
        parts[part]=item
    plan={'design_id':identity,'workflow_revision':VERSIONS['workflow']['revision'],
        'prompt_revision':VERSIONS['models']['image_prompt_revision'],'template_revision':VERSIONS['spine']['template_revision'],
        'source_sha256':digest(source),'atlas_sha256':digest(atlas),'parts':parts,'model_calls':0}
    plan['plan_id']=hashlib.sha256(canonical(plan)).hexdigest();destination=plans/('plan-'+plan['plan_id'])
    (stage/'requests.json').write_bytes(canonical(plan)+b'\n')
    try:os.rename(stage,destination)
    except OSError as error:
        # Linux raises ENOTEMPTY (errno 39), not FileExistsError, when a previously
        # prepared nonempty plan directory is reused during ASSEMBLE. Never suppress
        # unrelated filesystem errors or overwrite a previous plan.
        if error.errno not in (errno.EEXIST, errno.ENOTEMPTY) or not destination.is_dir():raise
        # Keep the duplicate staging directory; never delete user paths.
        require((destination/'requests.json').read_bytes()==canonical(plan)+b'\n','REQUEST_PLAN_CHANGED')
    for item in parts.values():
        for ref in item['references']:
            if 'file' in ref:
                path=private_path(root,(destination/ref['file']).relative_to(root).as_posix())
                require(path.is_file() and digest(path)==ref['sha256'],'REQUEST_REFERENCE_CHANGED')
    return plan,destination


def bindings_from_directory(root,identity,directory):
    record=load_design(root,identity);directory=private_path(root,directory)
    return {part:{'file':(directory/(part+'.png')).relative_to(root).as_posix()}
            for part in required_parts(record['design']) if not part.startswith('ARM')}


def bindings_from_source(root,identity,output):
    """Rebuild an existing package from its verified original bindings, not new imports."""
    folder=private_path(root,output);record=load_design(root,identity);bundle=folder/'export/bundle';verify_bundle(bundle)
    require(json.loads((folder/'design.json').read_text(encoding='utf-8'))==record,'SOURCE_DESIGN_CHANGED')
    flow=json.loads((bundle/'flow-manifest.json').read_text(encoding='utf-8'));require(flow['design_id']==identity,'SOURCE_DESIGN_CHANGED')
    expected={p for p in required_parts(record['design']) if not p.startswith('ARM')};require(set(flow['inputs'])==expected,'SOURCE_PARTS_CHANGED');result={}
    for part in sorted(expected):
        origin=flow['inputs'][part];raw=private_path(root,output+'/raw/'+part+'.png');require(digest(raw)==origin['sha256'],'SOURCE_RAW_CHANGED')
        if origin['kind']=='GENERATED_JOB':result[part]={'job_id':origin['job_id']}
        else:
            require(origin['kind']=='IMPORTED_IMAGE_ORIGIN_UNVERIFIED','SOURCE_ORIGIN_UNSUPPORTED');result[part]={'file':raw.relative_to(root).as_posix()}
    source,atlas,profile=source_profile(root);resolved=resolve_bindings(root,record,result,profile)
    for part in expected:require({'sha256':resolved[part]['sha256'],**resolved[part]['origin']}==flow['inputs'][part],'SOURCE_ORIGIN_CHANGED')
    return result,flow.get('geometry_fit')


def resolve_bindings(root,record,bindings,profile,plan=None,head_only=False):
    from .generation import image_bytes,GenerationError
    require(type(head_only) is bool,'HEAD_ONLY_OPTION')
    expected={'HAIR_FRONT','HAIR_BACK'} if head_only else {p for p in required_parts(record['design']) if not p.startswith('ARM')}
    require(isinstance(bindings,dict) and set(bindings)==expected,'CHARACTER_PARTS_INCOMPLETE')
    result={}
    for part,binding in bindings.items():
        require(isinstance(binding,dict) and set(binding) in ({'file'},{'job_id'}),'PART_BINDING_KEYS')
        if 'file' in binding:
            path=private_path(root,binding['file']);origin={'kind':'IMPORTED_IMAGE_ORIGIN_UNVERIFIED'}
        else:
            import re
            job=binding['job_id'];require(isinstance(job,str) and re.fullmatch(r'job-[a-f0-9]{32}',job),'JOB_ID')
            folder=private_path(root,'runtime/work/M04/generation/jobs/'+job)
            r=json.loads(private_path(root,(folder/'report.json').relative_to(root).as_posix()).read_text(encoding='utf-8'))
            expected_request=part_request(root,record,profile,part)
            if r.get('regeneration_variant'):
                require(record['workflow_revision']=='photo-to-skin-shared-014' and not part.startswith('ARM') and type(r['regeneration_variant']) is int and 1<=r['regeneration_variant']<=3,'JOB_VARIANT')
                from .component_prompts import regeneration_prompt
                expected_request={**expected_request,'prompt_sha256':hashlib.sha256(regeneration_prompt(part,expected_request['description'],expected_request['prompt'],r['regeneration_variant']).encode()).hexdigest()}
            if r.get('repair_request_id'):
                from .repair_requests import load_request
                modified=load_request(root,r['repair_request_id'],profile)
                require(modified['design_id']==record['design_id'] and modified['part']==part,'REPAIR_BINDING')
                expected_request={**expected_request,'prompt_sha256':modified['prompt_sha256']}
            expected_plan=plan or prepare_requests(root,record['design_id'])[0]
            expected_refs=expected_plan['parts'][part]['references']
            if r.get('tip_artifact'):
                from .hair_tip import load as load_tip
                require(r.get('repair_request_id') and modified.get('tip_artifact')==r['tip_artifact'],'TIP_JOB_REQUEST_BINDING')
                expected_refs=[*expected_refs,*load_tip(root,r['tip_artifact'])['references']]
            require([(x['role'],x['sha256']) for x in r.get('references',[])]==[(x['role'],x['sha256']) for x in expected_refs],'JOB_REFERENCE_MISMATCH')
            for ref in r['references']:
                require(isinstance(ref.get('file'),str) and Path(ref['file']).name==ref['file'],'JOB_REFERENCE_PATH')
                saved_ref=private_path(root,(folder/'references'/ref['file']).relative_to(root).as_posix())
                require(saved_ref.is_file() and digest(saved_ref)==ref['sha256'],'JOB_REFERENCE_FILE_CHANGED')
            require(r.get('status')=='GENERATED_AWAITING_MANUAL_REVIEW' and r.get('part')==part and r.get('design_id')==record['design_id'] and r.get('prompt_sha256')==expected_request['prompt_sha256'],'JOB_DESIGN_MISMATCH')
            path=private_path(root,(folder/'image.png').relative_to(root).as_posix())
            require(path.is_file() and r.get('image_sha256')==digest(path),'JOB_IMAGE_CHANGED')
            origin={'kind':'GENERATED_JOB','job_id':job,'prompt_sha256':r['prompt_sha256'],'repair_request_id':r.get('repair_request_id')}
            if r.get('tip_artifact'):origin['tip_artifact']=r['tip_artifact']
            if r.get('flow_id'):origin['flow_id']=r['flow_id']
            if r.get('character_session_flow'):origin['character_session_flow']=r['character_session_flow']
        require(path.is_file() and path.stat().st_size<=24*1024*1024,'PART_FILE_REQUIRED')
        content=path.read_bytes()
        try:image=image_bytes(content)
        except GenerationError:raise DesignError('PART_IMAGE_INVALID') from None
        require(image.getchannel('A').getextrema()[0]<255 and image.getchannel('A').point(lambda a:a if a>8 else 0).getbbox() is not None,'PART_ALPHA_REQUIRED')
        result[part]={'content':content,'sha256':hashlib.sha256(content).hexdigest(),'origin':origin}
    return result


def assemble_character(root,identity,bindings,output,auto_fit=False,fit_revision=None,ear_artifact=None):
    """All entry points use this function; no cloud calls or hidden best-effort imports."""
    from PIL import Image
    from .texture import standard_arm
    from .character import assemble_raw
    root=Path(root).resolve();record=load_design(root,identity);destination=private_path(root,output)
    require(not destination.exists(),'OUTPUT_ALREADY_EXISTS')
    source,atlas,profile=source_profile(root)
    expected={p for p in required_parts(record['design']) if not p.startswith('ARM')}
    require(isinstance(bindings,dict) and set(bindings)==expected,'CHARACTER_PARTS_INCOMPLETE')
    require(not destination.is_relative_to(source.parent) and not source.parent.is_relative_to(destination),'OUTPUT_TEMPLATE_OVERLAP')
    plan,_=prepare_requests(root,identity)
    resolved=resolve_bindings(root,record,bindings,profile,plan)  # Validate every part before creating output.
    destination.parent.mkdir(parents=True,exist_ok=True)
    stage=destination.parent/('.character-'+uuid.uuid4().hex);stage.mkdir()
    raw=stage/'raw';raw.mkdir()
    for part,item in resolved.items():(raw/(part+'.png')).write_bytes(item['content'])
    original=library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images/harri/arm.png'
    arm_started=time.time();arm_active=time.monotonic()
    with Image.open(original) as image:arm=standard_arm(image,arm_style(record['design']))
    for part in ('ARM_FRONT','ARM_BACK'):arm.save(raw/(part+'.png'))
    arm_timing={'started_at':arm_started,'finished_at':time.time(),'elapsed_seconds':time.monotonic()-arm_active,'shared_between':['ARM_FRONT','ARM_BACK'],'ai_calls':0,'not_additive':True}
    require(type(auto_fit) is bool,'FIT_OPTION')
    fitted=None
    if auto_fit:
        from .hair_fit import make
        tips={p:x['origin']['tip_artifact'] for p,x in resolved.items() if x['origin'].get('tip_artifact')}
        fitted=make(root,record,resolved,revision=fit_revision,tip_artifacts=tips or None)
    hair_overrides=None;ear_timing=None
    if ear_artifact:
        from .ear_pass import compute
        ear_started=time.time();ear_active=time.monotonic()
        hair_overrides,_,fitted=compute(root,ear_artifact)
        require(fitted['raw_sha256']=={p:resolved[p]['sha256'] for p in ('HAIR_FRONT','HAIR_BACK')},'EAR_ASSEMBLY_BASE_BINDING')
        if fitted['ear_pass'].get('source_kind')=='STANDARD_REFERENCE_EARS':ear_timing={'started_at':ear_started,'finished_at':time.time(),'elapsed_seconds':time.monotonic()-ear_active,'ai_calls':0,'shared_between':['EARS_FRONT','EARS_BACK'],'not_additive':True}
    export=stage/'export'
    assemble_raw(root,raw,export,fitted['layout'] if fitted else record['design']['layout'],record['design']['appearance']['lower']['kind']=='skirt','standard',record['design']['character_id'],integrated_ears=record['workflow_revision'] in ('photo-to-skin-shared-010','photo-to-skin-shared-011','photo-to-skin-shared-012','photo-to-skin-shared-013','photo-to-skin-shared-014'),hair_overrides=hair_overrides)
    # Refuse changed photo/template state; imported parts use immutable byte snapshots.
    load_design(root,identity)
    require(digest(source)==plan['source_sha256'] and digest(atlas)==plan['atlas_sha256'],'TEMPLATE_CHANGED_DURING_BUILD')
    bundle=export/'bundle';manifest=verify_bundle(bundle)
    flow={'design_id':identity,'plan_id':plan['plan_id'],'workflow_revision':VERSIONS['workflow']['revision'],
        'orientation_revision':VERSIONS['workflow']['orientation_revision'],'status':'AWAITING_VISUAL_REVIEW',
        'inputs':{p:{'sha256':x['sha256'],**x['origin']} for p,x in resolved.items()},
        'arms':{'ai_generated':False,'source_sha256':digest(original),'style':arm_style(record['design']),'revision':VERSIONS['workflow']['arm_revision']},
        'production_approved':False}
    if VERSIONS['workflow']['revision']=='photo-to-skin-shared-014':
        from .character_session import for_design
        owners={x['origin'].get('character_session_flow') or x['origin'].get('flow_id') for x in resolved.values()};owners.discard(None);require(len(owners)<=1,'CHARACTER_SESSION_MIXED_OWNERS')
        session=for_design(root,identity,next(iter(owners)) if owners else None)
        if session:
            from .pipeline_store import read
            owner=read(root,session['flow_id']);flow['ear_mode']=owner.get('ear_mode','PARTIAL_BOTH');flow['owner_flow_id']=session['flow_id']
            if owner.get('ear_decision_id'):
                from .ear_policy import load as load_ear_decision
                choice=load_ear_decision(root,owner['ear_decision_id']);flow.update(ear_decision=choice,ear_policy_revision=choice['revision'])
    if fitted and fitted['revision'] in ('head-alpha-fit-006','head-alpha-fit-007'):flow['ear_stage']=fitted['metrics']['ear_stage']
    if flow.get('ear_mode')=='HIDDEN':flow['ear_stage']='HIDDEN'
    if ear_timing:
        from .ear_policy import load as load_ear_decision
        decision=load_ear_decision(root,fitted['ear_pass']['decision_id']);flow.update(ear_mode=decision['mode'],ear_stage='BOTH_EARS',ear_decision=decision,ear_policy_revision=decision['revision'],standard_ears={'artifact':ear_artifact,'revision':fitted['ear_pass']['revision'],'model_calls':0,'source_kind':'STANDARD_REFERENCE_EARS'},reuse_existing_character=True)
        assembly_file=export/'assembly.json';metadata=json.loads(assembly_file.read_text(encoding='utf-8'));metadata.update(old_candidate_art_reused=True,ear_only_fixed_base=True);assembly_file.write_bytes(canonical(metadata)+b'\n')
    if fitted:
        (bundle/'hair-fit.json').write_bytes(canonical(fitted)+b'\n');manifest['files']['hair-fit.json']=digest(bundle/'hair-fit.json')
        flow['geometry_fit']={'fit_id':fitted['fit_id'],'revision':fitted['revision'],'status':fitted['metrics']['status']}
    (bundle/'flow-manifest.json').write_bytes(canonical(flow)+b'\n')
    manifest['files']['flow-manifest.json']=digest(bundle/'flow-manifest.json')
    manifest.update(design_id=identity,plan_id=plan['plan_id'])
    (bundle/'build-manifest.json').write_bytes(canonical(manifest)+b'\n');verify_bundle(bundle)
    (export/'runtime.zip').write_bytes(bundle_zip(bundle));(stage/'design.json').write_bytes(canonical(record)+b'\n')
    (stage/'processing-timing.json').write_bytes(canonical({'standard_arms':arm_timing,**({'standard_ears':ear_timing} if ear_timing else {})})+b'\n')
    os.rename(stage,destination)  # Existing candidates are never overwritten/activated on failure.
    return {'status':'ASSEMBLED_NOT_VISUALLY_APPROVED','design_id':identity,'plan_id':plan['plan_id'],
        'character_id':record['design']['character_id'],'output':output,'bundle':output+'/export/bundle',
        'files':manifest['files'],'zip_sha256':digest(destination/'export/runtime.zip'),'model_calls':0}
