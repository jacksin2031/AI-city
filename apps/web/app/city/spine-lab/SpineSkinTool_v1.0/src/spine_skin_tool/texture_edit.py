"""Bounded fixed-base chat revisions; old-outline metrics are diagnostic, never chained."""
import json,uuid,hashlib,shutil
import os
from pathlib import Path
from functools import partial
from PIL import Image,ImageChops
from .design import ROOT,VERSIONS,private_path,require,digest,load_design
from .assembly import verify_bundle,canonical
from . import repair_store
from .reference_assets import library_root

directory=partial(repair_store.directory,kind='texture')
read=partial(repair_store.read,kind='texture')
commit=partial(repair_store.commit,kind='texture')
lease=partial(repair_store.lease,kind='texture')


def create(root,source,parts):
    base=private_path(root,source);verify_bundle(base/'export/bundle')
    record=json.loads((base/'design.json').read_text(encoding='utf-8'));load_design(root,record['design_id'])
    require(isinstance(parts,list) and parts and len(parts)==len(set(parts)) and set(parts)<= {'HAIR_FRONT','HAIR_BACK','BODY_FRONT','BODY_BACK','LEG_FRONT','LEG_BACK','SKIRT_FRONT','SKIRT_BACK'},'TEXTURE_PARTS')
    from .character_flow import bindings_from_source
    bindings_from_source(root,record['design_id'],source)
    flow=json.loads((base/'export/bundle/flow-manifest.json').read_text(encoding='utf-8'))
    require(all(flow['inputs'].get(p,{}).get('kind')=='GENERATED_JOB' for p in parts),'TEXTURE_ORIGINAL_GENERATED_BASE_REQUIRED')
    identity='texture-'+uuid.uuid4().hex;folder=directory(root,identity);folder.mkdir(parents=True)
    files={name:digest(base/name) for name in ('design.json','export/bundle/build-manifest.json','export/bundle/flow-manifest.json','export/bundle/hair-fit.json')}
    for part in parts:files['raw/'+part+'.png']=digest(base/'raw'/(part+'.png'))
    context={'source':source,'files':files,'design_id':record['design_id'],'parts':parts,'limit':3,'policy_revision':VERSIONS['workflow']['texture_edit_revision'],'mode':'HEAD_FIT_FIXED_BASE_NOT_CHAINED',
        'normative_sha256':{p:digest(ROOT/p) for p in ('docs/QUALITY.md','docs/TEXTURE_CONSTRUCTION_BASELINE.md','docs/TEXTURE_ONLY_EDIT_POLICY.md')}}
    repair_store.atomic(folder/'context.json',context)
    return commit(root,{'id':identity,'sequence':0,'context_sha256':digest(folder/'context.json'),'attempts':[],'quality_approved':False},'TEXTURE_SCOPE_FROZEN')


def reserve_asset_budget(root,identity,part,base_sha):
    """Exclusive per-base slots; a new session never resets the three edits."""
    folder=private_path(root,'runtime/work/M07/texture-edit-budgets/'+base_sha+'-'+part);folder.mkdir(parents=True,exist_ok=True)
    # Preserve reservations made before the global index was introduced.
    prior=[];sessions=private_path(root,'runtime/work/M07/texture-edits')
    for session in sessions.glob('texture-*'):
        if not session.is_dir():continue
        for a in read(root,session.name)['attempts']:
            if a['part']==part and a['base_sha256']==base_sha:prior.append({'session_id':session.name,'number':a['number'],'legacy_reservation':True})
    for n,a in enumerate(prior,1):
        require(n<=3,'TEXTURE_BUDGET_CORRUPT')
        try:
            with (folder/f'{n}.reserved').open('xb') as f:f.write(canonical(a));f.flush();os.fsync(f.fileno())
        except FileExistsError:pass
    for n in range(1,4):
        try:
            with (folder/f'{n}.reserved').open('xb') as f:f.write(canonical({'session_id':identity,'part':part,'base_sha256':base_sha}));f.flush();os.fsync(f.fileno())
            return n
        except FileExistsError:continue
    require(False,'TEXTURE_THREE_ATTEMPTS_REACHED')


def context(root,s):
    folder=directory(root,s['id']);require(digest(folder/'context.json')==s['context_sha256'],'TEXTURE_CONTEXT_CHANGED')
    c=json.loads((folder/'context.json').read_text(encoding='utf-8'));base=private_path(root,c['source'])
    require(c.get('policy_revision','texture-pattern-edit-001')==VERSIONS['workflow']['texture_edit_revision'],'TEXTURE_POLICY_CHANGED')
    require(all(digest(base/p)==sha for p,sha in c['files'].items()),'TEXTURE_BASE_CHANGED')
    require(all(digest(ROOT/p)==sha for p,sha in c.get('normative_sha256',{}).items()),'TEXTURE_NORM_CHANGED')
    verify_bundle(base/'export/bundle')
    load_design(root,c['design_id']);return c,base


def reserve(root,identity,part,note):
    with lease(root,identity):
        s=read(root,identity);c,base=context(root,s);require(part in c['parts'],'TEXTURE_PARTS')
        attempts=[a for a in s['attempts'] if a['part']==part];require(len(attempts)<3,'TEXTURE_THREE_ATTEMPTS_REACHED')
        require(isinstance(note,str) and 0<len(note)<=2000,'TEXTURE_NOTE')
        # Every attempt names the same immutable base, never a prior result.
        n=len(attempts)+1;folder=directory(root,identity)/(part+'-'+str(n))
        target=base/'raw'/(part+'.png')
        with Image.open(target) as im:size=list(im.size)
        asset_attempt=reserve_asset_budget(root,identity,part,digest(target))
        folder.mkdir()
        prompt=f'''Use case: precise-object-edit. HAIR FIT / PATTERN revision, attempt {asset_attempt}/3.
Image 1 is the original person photo. Image 2 is the SAME fixed current-character base, never a chained prior edit. Images 3-5 are original Harri/Davide/Spineboy component STYLE ONLY references.
Keep original identity, photographed haircut cues and palette. Improve fixed-head coverage and natural rounded head/hair proportions. The old {size[0]} by {size[1]} canvas, alpha outline, face opening and bbox are NOT pixel locks: shapes MAY widen or change by 100-150px or more. No old-outline IoU/delta rejection. Never horizontally stretch, squash, mask or crop failed art; whole-asset UNIFORM scale is allowed. If width fit inflates height, redesign the whole hairstyle naturally instead.
Original rig ears are hidden in ALL states. Include SMALL partly concealed ears in front hair, skin/linework matching the fixed chibi head; no full head, face, eyes, mouth or neck. Rear hair covers the rear head and matches FRONT rendering; do not enforce a stricter zero-gradient/one-shadow rule. Match the broad illustrated chibi family and front/back hair style only; shadow, strand, gradient and brush differences are free. Strict orthographic FRONT/REAR, no three-quarter head or turned face opening; allow 1-3% generous join overlap while keeping only whole-asset uniform fitting.
Targeted change: {note}
Return one complete RGBA hair-and-ear asset on genuine transparency, no labels. Original bones, head model, expressions and motions remain separate and unchanged.'''
        refs=[private_path(root,'runtime/work/M04/'+load_design(root,c['design_id'])['design']['photo']['file']),target,*[library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images'/skin/'body.png' for skin in ('harri','davide','spineboy')]]
        (folder/'prompt.txt').write_bytes(prompt.encode('utf-8'))
        a={'part':part,'number':n,'asset_attempt_number':asset_attempt,'status':'RESERVED_RESULT_UNKNOWN','base_sha256':digest(target),'prompt_sha256':digest(folder/'prompt.txt'),'references':[{'path':str(p),'sha256':digest(p)} for p in refs],'canvas':size}
        s['attempts'].append(a);commit(root,s,'TEXTURE_EDIT_RESERVED_NO_REFUND');return {'attempt':a,'prompt':prompt,'reference_paths':[str(p) for p in refs]}


def receive(root,identity,part,number,output):
    with lease(root,identity):
        s=read(root,identity);c,base=context(root,s)
        a=next((a for a in s['attempts'] if a['part']==part and a['number']==number),None);require(a is not None and a['status']=='RESERVED_RESULT_UNKNOWN','TEXTURE_ATTEMPT')
        folder=directory(root,identity)/(part+'-'+str(number))
        require(digest(folder/'prompt.txt')==a['prompt_sha256'] and all(digest(Path(r['path']))==r['sha256'] for r in a['references']),'TEXTURE_REQUEST_CHANGED')
        source=Path(output);require(source.is_absolute() and not source.is_symlink() and source.is_file() and source.stat().st_size<=24*1024*1024,'TEXTURE_RESULT')
        target=folder/'result.png';require(not target.exists(),'TEXTURE_RESULT_EXISTS');shutil.copyfile(source,target)
        with Image.open(base/'raw'/(part+'.png')) as original,Image.open(target) as edited:
            if edited.format!='PNG' or edited.mode!='RGBA' or edited.width*edited.height>16777216:
                a.update(status='REJECTED_INVALID_RESULT',result_sha256=digest(target),metrics={'code':'TEXTURE_RGBA_REQUIRED'},quality_approved=False)
                return commit(root,s,'TEXTURE_RESULT_INVALID_NOT_APPROVED')
            if edited.getchannel('A').getextrema()[0]==255 or edited.getchannel('A').point(lambda x:255 if x>8 else 0).getbbox() is None:
                a.update(status='REJECTED_INVALID_RESULT',result_sha256=digest(target),metrics={'code':'TEXTURE_CONTENT_REQUIRED'},quality_approved=False)
                return commit(root,s,'TEXTURE_RESULT_INVALID_NOT_APPROVED')
            metrics={'canvas_unchanged':original.size==edited.size,'source_canvas':list(original.size),'result_canvas':list(edited.size)}
            if metrics['canvas_unchanged']:
                left=original.getchannel('A');right=edited.getchannel('A');l=left.point(lambda a:255 if a>32 else 0);r=right.point(lambda a:255 if a>32 else 0)
                area=lambda im:im.histogram()[255];union=area(ImageChops.lighter(l,r));iou=area(ImageChops.multiply(l,r))/max(1,union)
                lb,rb=l.getbbox(),r.getbbox();delta=max(abs(x-y) for x,y in zip(lb,rb)) if lb and rb else 999
                metrics.update(alpha_bytes_unchanged=left.tobytes()==right.tobytes(),alpha32_iou=iou,bbox_max_delta_pixels=delta)
            # No resizing, mask application, alpha restoration or pixel repair.
            metrics['old_outline_gate_enabled']=False
        a.update(status='GEOMETRY_CHANGED_VISUAL_REVIEW_REQUIRED',result_sha256=digest(target),metrics=metrics,quality_approved=False)
        return commit(root,s,'TEXTURE_RESULT_CHECKED_NOT_APPROVED')
