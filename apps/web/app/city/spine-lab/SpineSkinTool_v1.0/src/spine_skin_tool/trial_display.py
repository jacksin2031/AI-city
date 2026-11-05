"""Read-only, candidate-bound display projections; no model or assembly calls."""
import json,re,hashlib
from .design import private_path,require,digest,VERSIONS
from .assembly import verify_bundle,canonical
from .pipeline_store import read

PARTS=('HAIR_FRONT','HAIR_BACK')


def batch(root,name):
    require(isinstance(name,str) and re.fullmatch(r'[a-z0-9-]{1,40}',name),'DISPLAY_BATCH')
    value=json.loads(private_path(root,'runtime/work/M07/'+name+'/index.json').read_text(encoding='utf-8'))
    require(value['batch']==name and isinstance(value['cases'],list) and len(value['cases'])<=20,'DISPLAY_BATCH')
    rows=[]
    for c in value['cases']:
        s=read(root,c['task_id']);number=photo_number(s['photo']);require(number==c['photo_number'],'DISPLAY_PHOTO_BINDING')
        rows.append({'id':s['id'],'photo_number':number,'status':s['status'],'mode':s['mode']})
    require(len({x['id'] for x in rows})==len(rows),'DISPLAY_BATCH_DUPLICATE')
    return {'batch':name,'cases':rows}


def photo_number(name):
    match=re.fullmatch(r'character-reference-?([1-9][0-9]*)?\.png',name)
    require(match is not None,'DISPLAY_PHOTO_NAME');return int(match.group(1)) if match.group(1) else 0


def _folder(root,identity,token):
    from .pipeline_service import preview
    folder=preview(root,identity,token);m=verify_bundle(folder)
    require(digest(folder/'build-manifest.json')==token,'DISPLAY_MANIFEST_CHANGED')
    return folder,m


def texture(root,identity,token,part):
    require(part in PARTS,'DISPLAY_PART');folder,m=_folder(root,identity,token)
    flow=json.loads((folder/'flow-manifest.json').read_text(encoding='utf-8'));path=private_path(root,(folder.parent.parent/'raw'/(part+'.png')).relative_to(root).as_posix())
    require(flow['inputs'][part]['sha256']==digest(path),'DISPLAY_RAW_CHANGED');return path


def job_texture(root,identity,job,part):
    require(part in PARTS and re.fullmatch(r'job-[a-f0-9]{32}',job),'DISPLAY_JOB')
    s=read(root,identity);jobs={**s['jobs']}
    if s.get('repair_id'):
        from .repair_store import read as read_repair
        for a in read_repair(root,s['repair_id'])['attempts']:
            if a['jobs'].get(part)==job:jobs[part]=job
    require(jobs.get(part)==job,'DISPLAY_JOB_BINDING')
    folder=private_path(root,'runtime/work/M04/generation/jobs/'+job);r=json.loads((folder/'report.json').read_text(encoding='utf-8'))
    require(r['design_id']==s['design_id'] and r['part']==part and r['status']=='GENERATED_AWAITING_MANUAL_REVIEW','DISPLAY_JOB_BINDING')
    path=folder/'image.png';require(digest(path)==r['image_sha256'],'DISPLAY_JOB_CHANGED');return path


def snapshot(root,identity):
    from .pipeline_service import report
    from .review import review_dir,read_review
    data=report(root,identity);require('hair_trials' in data,'DISPLAY_HAIR_FLOW')
    rows=[];origins={};numbers={p:0 for p in PARTS}
    for a in data['hair_trials']:
        for image in a['images']:
            part=image['part'];job=image['job_id']
            if job not in origins:
                if a['cycle']:numbers[part]+=1
                origins[job]={'cycle':a['cycle'],'part_revision':numbers[part]}
        row={k:a.get(k) for k in ('cycle','verdict','checks','reasons','user_opinion','hard_status','render_status','frame_count','superseded_reviews')}
        row.update(key=str(a['cycle']),parts=[],generated_parts=[x['part'] for x in a['images']],preview_url=None,manifest_sha256=None,quality_approved=False)
        candidate=a['candidate']
        if not candidate:
            row['unassembled']=True
            for im in a['images']:
                item={**im,'changed':True,'part_revision':origins.get(im['job_id'],{}).get('part_revision',0)}
                if im['url']:
                    try:job_texture(root,identity,im['job_id'],im['part']);item['url']=f"/hair-display/{identity}/job/{im['job_id']}/{im['part']}"
                    except (ValueError,OSError,KeyError,TypeError):item['url']=None;item['reason_ja']='画像の出所を検証できません。'
                row['parts'].append(item)
            rows.append(row);continue
        try:
            token=candidate['manifest_sha256'];folder,m=_folder(root,identity,token)
            read_review(root,candidate['review_id'])
            flow=json.loads((folder/'flow-manifest.json').read_text(encoding='utf-8'))
            context=json.loads((review_dir(root,candidate['review_id'])/'context.json').read_text(encoding='utf-8'))
            require(context['source_files']['export/bundle/build-manifest.json']==token and context['character_output']==candidate['output'],'DISPLAY_REVIEW_BINDING')
            row.update(manifest_sha256=token,preview_url=candidate['url'],review_id=candidate['review_id'],skeleton_sha256=m['files']['skeleton.json'],atlas_sha256=m['files']['skeleton.atlas'])
            for part in PARTS:
                path=texture(root,identity,token,part);origin=flow['inputs'][part];job=origin.get('job_id');revision=origins.get(job,{})
                prompt_revision=None
                if job:
                    jr=json.loads(private_path(root,'runtime/work/M04/generation/jobs/'+job+'/report.json').read_text(encoding='utf-8'))
                    require(jr['part']==part and jr['image_sha256']==digest(path),'DISPLAY_JOB_BINDING')
                    prompt_revision=jr['prompt_revision']
                row['parts'].append({'part':part,'url':f'/hair-display/{identity}/texture/{token}/{part}','sha256':digest(path),'job_id':job,'part_revision':revision.get('part_revision',0),'changed':(a['cycle']>0 or data['mode']!='REPLAY') and job in {x['job_id'] for x in a['images']},'prompt_revision':prompt_revision})
            submitted=review_dir(root,candidate['review_id'])/'visual-submitted-request.json'
            review_revision=json.loads(submitted.read_text(encoding='utf-8')).get('prompt_revision') if submitted.exists() else None
            row['versions']={'images':[x['prompt_revision'] for x in row['parts']],'fit':flow.get('geometry_fit',{}).get('revision'),'review':review_revision}
            row['current_rules']=all(x==VERSIONS['models']['image_prompt_revision'] for x in row['versions']['images']) and row['versions']['fit']==VERSIONS['workflow']['hair_fit_revision'] and review_revision==VERSIONS['models']['review_prompt_revision'] and data['status']!='STALE'
            row['image_rules_current']=all(x==VERSIONS['models']['image_prompt_revision'] for x in row['versions']['images'])
            row['fit_rules_current']=row['versions']['fit']==VERSIONS['workflow']['hair_fit_revision']
            row['asset_set']=hashlib.sha256(canonical([x['sha256'] for x in row['parts']])).hexdigest()[:12]
        except (ValueError,OSError,KeyError,TypeError) as error:
            row.update(preview_url=None,parts=[],checks=[],user_opinion=None,verdict='UNKNOWN',display_error=getattr(error,'code','DISPLAY_SOURCE_UNAVAILABLE'),reasons=[{'code':getattr(error,'code','DISPLAY_SOURCE_UNAVAILABLE'),'message_ja':'素材とレビューの対応を検証できないため表示を停止しました。'}])
        rows.append(row)
    return {'id':identity,'photo_number':photo_number(data['photo']),'status':data['status'],'phase':data['phase'],'worker_active':data['worker_active'],'mode':data['mode'],'error_code':data.get('error_code'),'image_calls':data['image_calls_reserved'],'visual_calls':data['visual_calls_reserved'],'quality_approved':data['quality_approved'],'expected_versions':{'image':VERSIONS['models']['image_prompt_revision'],'fit':VERSIONS['workflow']['hair_fit_revision'],'review':VERSIONS['models']['review_prompt_revision']},'rows':rows}
