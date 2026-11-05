"""Actual persisted job/event clocks. Missing historical times remain unknown.

Adoption means incorporated into the selected assembly, NOT visual approval.
"""
import json,math,re
from pathlib import Path
from .design import private_path,require,digest,required_parts,load_design
from .pipeline_store import read,directory
from .repair_store import read as repair_read,directory as repair_directory


def number(value):return type(value) in (int,float) and math.isfinite(value)


def difference(end,start):return round(end-start,6) if number(end) and number(start) and end>=start else None


def part_statistics(attempts,adopted_at):
    starts=[a['started_at'] for a in attempts if number(a.get('started_at'))]
    active=[a.get('elapsed_seconds') for a in attempts];known=[x for x in active if number(x) and x>=0]
    total=difference(adopted_at,min(starts)) if starts else None
    return {'attempt_count':len(attempts),'attempts':attempts,'first_generation_at':min(starts) if starts else None,
            'incorporated_at':adopted_at,'start_to_incorporation_seconds':total,
            'mean_start_to_incorporation_seconds':round(total/len(attempts),6) if total is not None and attempts else None,
            'mean_generation_seconds':round(sum(known)/len(active),6) if active and len(known)==len(active) else None,
            'known_generation_durations':len(known),'quality_approved':False}


def events(root,path):
    return [json.loads(private_path(root,p.relative_to(root).as_posix()).read_text(encoding='utf-8')) for p in sorted((path/'events').glob('*.json'))]


def summary(root,identity,token=None):
    root=Path(root);s=read(root,identity);flow_events=events(root,directory(root,identity));submitted=flow_events[0].get('recorded_at')
    assemblies=[];jobs={part:{job} for part,job in s['jobs'].items()}
    for part,job in s.get('ear_jobs',{}).items():jobs['EARS_'+part.split('_')[1]]={job}
    for item in s.get('failed_jobs',[]):jobs.setdefault(item['part'],set()).add(item['job_id'])
    for e in flow_events:
        if e['event'] in ('INITIAL_ASSEMBLED','EAR_ASSEMBLED'):assemblies.append({'output':e['state']['output'],'at':e.get('recorded_at'),'ear_jobs':e['state'].get('ear_jobs',{})})
        if e['event']=='STANDARD_EARS_ASSEMBLED':assemblies.append({'output':e['state']['output'],'at':e['state']['standard_ear_patch']['assembled_at'],'ear_jobs':{}})
    if s.get('repair_id'):
        r=repair_read(root,s['repair_id'])
        for a in r['attempts']:
            for part,job in a['jobs'].items():jobs.setdefault(part,set()).add(job)
        for e in events(root,repair_directory(root,s['repair_id'])):
            if e['event']=='ASSEMBLED' and e['state']['attempts']:assemblies.append({'output':e['state']['attempts'][-1]['output'],'at':e.get('recorded_at')})
    candidates=s['candidates'];selected=next((c for c in candidates if c['manifest_sha256']==token),None) if token else (candidates[-1] if candidates else None)
    require(not token or selected is not None,'TIMING_CANDIDATE_BINDING')
    target=private_path(root,selected['output']) if selected else None;finished=next((a['at'] for a in assemblies if selected and a['output']==selected['output']),None)
    standard_ears=None
    if target:
        flow=json.loads((target/'export/bundle/flow-manifest.json').read_text(encoding='utf-8'));standard_ears=flow.get('standard_ears')
    rows=[]
    design=load_design(root,s['design_id'])['design'] if s.get('design_id') else s.get('draft')
    names=[*required_parts(design),*[p for p in jobs if p.startswith('EARS_')]] if design else sorted(jobs)
    if standard_ears:names.extend(p for p in ('EARS_FRONT','EARS_BACK') if p not in names)
    for part in names:
        if standard_ears and part.startswith('EARS_'):
            require(digest(target/'processing-timing.json')==selected['processing_timing_sha256'],'TIMING_LOCAL_PROCESSING_CHANGED');local=json.loads((target/'processing-timing.json').read_text(encoding='utf-8'))['standard_ears'];rows.append({'part':part,'source':'STANDARD_EAR_LOCAL','attempt_count':0,'local_shared_timing':local,'not_additive':True,'quality_approved':False});continue
        if part.startswith('ARM'):
            local=None
            if target and selected.get('processing_timing_sha256'):
                require(digest(target/'processing-timing.json')==selected['processing_timing_sha256'],'TIMING_LOCAL_PROCESSING_CHANGED')
                local=json.loads((target/'processing-timing.json').read_text(encoding='utf-8'))['standard_arms']
            rows.append({'part':part,'source':'STANDARD_SHARED_LOCAL','attempt_count':0,'local_shared_timing':local,'not_additive':True,'quality_approved':False});continue
        attempts=[]
        for job in jobs.get(part,set()):
            require(re.fullmatch(r'job-[a-f0-9]{32}',job or ''),'TIMING_JOB_ID');file=private_path(root,'runtime/work/M04/generation/jobs/'+job+'/report.json')
            if not file.is_file():continue
            r=json.loads(file.read_text(encoding='utf-8'));require(r['id']==job and r['part']==('HAIR_'+part.split('_')[1] if part.startswith('EARS_') else part),'TIMING_JOB_BINDING')
            if number(finished) and number(r.get('started_at')) and r['started_at']>finished:continue
            attempts.append({k:r.get(k) for k in ('id','status','started_at','finished_at','elapsed_seconds','image_sha256','error_code','execution_timing')})
        attempts.sort(key=lambda a:a['started_at'] if number(a.get('started_at')) else float('inf'))
        adopted=None
        if target and part.startswith('EARS_'):
            original='HAIR_'+part.split('_')[1];moments=[a['at'] for a in assemblies if number(a['at']) and (not number(finished) or a['at']<=finished) and a.get('ear_jobs',{}).get(original)==s.get('ear_jobs',{}).get(original)]
            adopted=min(moments) if moments else None
        if target and (target/'raw'/f'{part}.png').is_file():
            raw_sha=digest(target/'raw'/f'{part}.png')
            # Earliest actual incorporation of the SAME final-selected asset.
            moments=[a['at'] for a in assemblies if number(a['at']) and (not number(finished) or a['at']<=finished) and (private_path(root,a['output'])/'raw'/f'{part}.png').is_file() and digest(private_path(root,a['output'])/'raw'/f'{part}.png')==raw_sha]
            adopted=min(moments) if moments else None
        rows.append({'part':part,'source':'IMAGE_MODEL',**part_statistics(attempts,adopted)})
    first=min((a['at'] for a in assemblies if number(a['at'])),default=None)
    from .character_session import public_summary
    session=public_summary(root,identity) if s.get('versions',{}).get('workflow')=='photo-to-skin-shared-014' else None
    return {'flow_id':identity,'execution_session':session,'candidate_manifest_sha256':selected['manifest_sha256'] if selected else None,'submitted_at':submitted,
            'first_assembled_at':first,'selected_assembled_at':finished,'first_assembly_seconds':difference(first,submitted),
            'selected_assembly_seconds':difference(finished,submitted),'flow_observed_seconds':difference(flow_events[-1].get('recorded_at'),submitted),
            'parts':rows,'clock':'PERSISTED_UNIX_UTC_AND_MONOTONIC_PER_JOB','includes_wait_and_repair':True,
            'adoption_meaning':'INCORPORATED_IN_SELECTED_ASSEMBLY_NOT_VISUAL_APPROVAL','historical_unknown_not_backfilled':True,'quality_approved':False}
