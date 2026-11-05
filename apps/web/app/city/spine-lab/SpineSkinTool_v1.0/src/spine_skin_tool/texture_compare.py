"""Read-only visual comparison of rejected edits; never QA admission or refitting."""
import copy,json,shutil,hashlib,uuid
from PIL import Image
from .design import require,digest,private_path
from .assembly import canonical,verify_bundle
from . import texture_edit as edit

REVISION='texture-compare-fixed-raw-001'
PARTS={'HAIR_FRONT':('hair-front','ai-city-template-hair-front.png'),'HAIR_BACK':('back-hair','ai-city-template-hair-back.png')}


def raw_file(root,identity,part,number):
    s=edit.read(root,identity);c,base=edit.context(root,s);require(part in PARTS and part in c['parts'],'TEXTURE_COMPARE_PART')
    require(type(number) is int and 0<=number<=3,'TEXTURE_COMPARE_NUMBER')
    if number==0:return base/'raw'/(part+'.png')
    a=next((a for a in s['attempts'] if a['part']==part and a['number']==number),None)
    require(a is not None and 'result_sha256' in a,'TEXTURE_COMPARE_RESULT')
    path=edit.directory(root,identity)/(part+'-'+str(number))/'result.png';require(digest(path)==a['result_sha256'],'TEXTURE_COMPARE_CHANGED')
    return path


def configuration(root,identity):
    s=edit.read(root,identity);c,base=edit.context(root,s);items={}
    for part in c['parts']:
        require(part in PARTS,'TEXTURE_COMPARE_PART')
        with Image.open(raw_file(root,identity,part,0)) as im:canvas=list(im.size)
        rows=[{'number':0,'metrics':None,'url':f'/texture-compare/{identity}/image/{part}/0','canvas':canvas}]
        for a in s['attempts']:
            if a['part']==part and 'result_sha256' in a:
                path=raw_file(root,identity,part,a['number'])
                with Image.open(path) as im:result_canvas=list(im.size)
                rows.append({'number':a['number'],'metrics':a['metrics'],'old_check_status':a['status'],'canvas':result_canvas,'url':f"/texture-compare/{identity}/image/{part}/{a['number']}"})
        items[part]=rows
    return {'id':identity,'parts':items,'revision':REVISION,'comparison_only':True,'quality_approved':False,'model_calls':0,
        'base_view':f'/texture-view/{identity}/v0-0/','source_view':f'/texture-view/{identity}/source/'}


def bundle(root,identity,front,back):
    require(type(front) is int and type(back) is int and 0<=front<=3 and 0<=back<=3,'TEXTURE_COMPARE_NUMBER')
    with edit.lease(root,identity,wait=True):
        s=edit.read(root,identity);c,base=edit.context(root,s);source=base/'export/bundle';original=verify_bundle(source)
        files={part:raw_file(root,identity,part,n) for part,n in [('HAIR_FRONT',front),('HAIR_BACK',back)]}
        token=hashlib.sha256(canonical({'revision':REVISION,'source':digest(source/'build-manifest.json'),'images':{p:digest(f) for p,f in files.items()}})).hexdigest()
        destination=edit.directory(root,identity)/'comparisons'/token
        if destination.exists():verify_bundle(destination);return destination
        stage=destination.with_name('.building-'+token+'-'+uuid.uuid4().hex);stage.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(source,stage)
        data=json.loads((source/'skeleton.json').read_text(encoding='utf-8'));before=copy.deepcopy(data)
        skin=next(s for s in data['skins'] if s['name']==original['skin'])['attachments']
        fitted=json.loads((source/'hair-fit.json').read_text(encoding='utf-8'))
        from .hair_fit import validate
        from .design import load_design
        record=load_design(root,c['design_id']);layout=validate(root,record,fitted,{p:base/'raw'/(p+'.png') for p in PARTS})
        from .character import region
        dimensions={};mapping={}
        for part,(slot,name) in PARTS.items():
            with Image.open(base/'raw'/(part+'.png')) as image:
                width=layout['front_width' if part=='HAIR_FRONT' else 'back_width'];top=layout['top'] if part=='HAIR_FRONT' else layout.get('back_top',layout['top'])
                attachment,measurement=region(image,'ai-city-original-template/'+('hair-front' if part=='HAIR_FRONT' else 'hair-back'),width,top,face=part=='HAIR_FRONT')
                size=image.size
            # Use the BASE's transform for ALL edits. No per-edit bbox fitting,
            # crop, alpha restoration, resampling, or hidden registration.
            with Image.open(files[part]) as image:require(image.mode=='RGBA' and image.size==size,'TEXTURE_COMPARE_CANVAS')
            shutil.copyfile(files[part],stage/name);dimensions[name]=size;skin[slot]={slot:attachment}
            mapping[part]={'attachment':attachment,'base_measurement':measurement,'raw_sha256':digest(files[part]),'base_sha256':digest(base/'raw'/(part+'.png'))}
        require(all(canonical(before[k])==canonical(data[k]) for k in before if k!='skins'),'TEXTURE_COMPARE_RIG_CHANGED')
        # Full raw canvases become full-page atlas regions. Outside-base pixels
        # remain visible if the model drifted; nothing is clipped to base alpha.
        lines=(stage/'skeleton.atlas').read_text(encoding='utf-8').splitlines();page=None
        for i,line in enumerate(lines):
            if line in dimensions:page=line
            elif line and not line[0].isspace() and line.endswith('.png'):page=None
            if page in dimensions:
                w,h=dimensions[page];key=line.strip().split(':')[0]
                if key=='size':lines[i]=f'size: {w}, {h}'
                elif key=='bounds':lines[i]=f'bounds: 0, 0, {w}, {h}'
                elif key=='offsets':lines[i]=f'offsets: 0, 0, {w}, {h}'
        (stage/'skeleton.atlas').write_text('\n'.join(lines)+'\n',encoding='utf-8');(stage/'skeleton.json').write_bytes(canonical(data)+b'\n')
        proof={'revision':REVISION,'comparison_only':True,'quality_approved':False,'source_manifest_sha256':digest(source/'build-manifest.json'),'session':identity,'front':front,'back':back,'mapping':mapping,'fixed_camera_required':True,'model_calls':0}
        (stage/'comparison.json').write_bytes(canonical(proof)+b'\n')
        flow=json.loads((stage/'flow-manifest.json').read_text(encoding='utf-8'));flow['base_inputs']=flow['inputs'];flow['inputs']={**flow['inputs'],**{p:{'kind':'TEXTURE_COMPARISON_ONLY','sha256':m['raw_sha256'],'base_sha256':m['base_sha256'],'session_id':identity,'attempt':front if p=='HAIR_FRONT' else back} for p,m in mapping.items()}}
        flow.pop('geometry_fit',None);flow.update(status='COMPARISON_ONLY_NOT_APPROVED',comparison_geometry=mapping,quality_approved=False,production_approved=False)
        (stage/'flow-manifest.json').write_bytes(canonical(flow)+b'\n')
        (stage/'comparison-source-fit.json').write_bytes((stage/'hair-fit.json').read_bytes());(stage/'hair-fit.json').unlink()
        (stage/'assembly-report.json').write_bytes(canonical({'status':'COMPARISON_ONLY_NOT_ASSEMBLY_QA','source_report_sha256':digest(source/'assembly-report.json'),'comparison':proof})+b'\n')
        manifest=copy.deepcopy(original);manifest['files'].pop('hair-fit.json',None)
        manifest['files']={p.name:digest(p) for p in stage.iterdir() if p.is_file() and p.name!='build-manifest.json'}
        manifest.update(comparison_only=True,quality_approved=False,production_approved=False,status='VISUAL_COMPARISON_ONLY',comparison=proof)
        for part,(_,name) in PARTS.items():manifest['parts'][part]=digest(stage/name)
        (stage/'build-manifest.json').write_bytes(canonical(manifest)+b'\n');verify_bundle(stage);edit.context(root,s);stage.rename(destination);return destination


def source_bundle(root,identity):
    s=edit.read(root,identity);_,base=edit.context(root,s);verify_bundle(base/'export/bundle');return base/'export/bundle'


def watch_inputs(root,identity,folder):
    """Pin once after full validation; subsequent HTTP reads hash bytes only.

    Re-decoding every atlas page under a worker lease for each concurrent PNG
    request causes false lock timeouts. These byte snapshots still fail closed
    on source, result, manifest or session changes without acquiring a write lock.
    """
    s=edit.read(root,identity);c,base=edit.context(root,s);manifest=verify_bundle(folder)
    paths=[edit.directory(root,identity)/'context.json',edit.directory(root,identity)/'state.json',folder/'build-manifest.json']
    paths.extend(edit.directory(root,identity).glob('events/*.json'))
    paths.extend(base/p for p in c['files'])
    paths.extend(base/'export/bundle'/p for p in verify_bundle(base/'export/bundle')['files'])
    paths.extend(folder/p for p in manifest['files'])
    paths.extend(edit.directory(root,identity)/(a['part']+'-'+str(a['number']))/'result.png' for a in s['attempts'] if 'result_sha256' in a)
    return {p.relative_to(root).as_posix():digest(p) for p in paths}


def check_watched(root,watched):
    require(all(digest(private_path(root,p))==sha for p,sha in watched.items()),'TEXTURE_COMPARE_VIEW_CHANGED')
