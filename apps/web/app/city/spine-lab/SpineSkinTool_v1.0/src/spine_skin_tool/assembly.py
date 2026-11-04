"""实验 profile 的确定性装配；不适配未知几何、不改源文件。"""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import tomllib
import warnings
import zipfile

from PIL import Image
from .template import inspect_template, digest

SKIN='ai-city-original-template'
VERSIONS=tomllib.loads((Path(__file__).resolve().parents[2]/'runtime/versions.toml').read_text(encoding='utf-8'))
REVISION=VERSIONS['spine']['template_revision']
PARTS={'HAIR_FRONT':'hair-front','HAIR_BACK':'hair-back','BODY_FRONT':'body','BODY_BACK':'body-back','ARM_FRONT':'arm','ARM_BACK':'arm-back','LEG_FRONT':'leg','LEG_BACK':'leg-back','BLANK':'blank'}
FACE=['eye-l','eye-r','eyebrow-l','eyebrow-r','mouth','blush-l','blush-r','eye-sparkle-l','eye-sparkle-r','big-purple-fear','purple-fear-lines','small-purple-fear','big-tear','tear-l','tear-r','angry-mark','small-drop-line','small-drop-line-l','small-drop-line3']

class AssemblyError(ValueError):pass

def canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')

def png_info(path,blank=False,*,max_pixels=16777216):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(path) as image:
                if image.format!='PNG' or image.mode!='RGBA' or image.width*image.height>max_pixels:raise AssemblyError('INVALID_RGBA_PNG')
                image.load();alpha=image.getchannel('A');bbox=alpha.getbbox()
                if (not blank and bbox is None) or (blank and bbox is not None):raise AssemblyError('INVALID_ALPHA')
                if not blank and alpha.getextrema()[0]==255:raise AssemblyError('OPAQUE_BACKGROUND')
                return [image.width,image.height]
    except (OSError,ValueError,Image.DecompressionBombError,Image.DecompressionBombWarning) as error:
        raise AssemblyError('PART_PNG_INVALID') from error

def make_profile(source,atlas):
    report=inspect_template(source,atlas)
    if report['defects']:raise AssemblyError('TEMPLATE_INVALID')
    data=json.loads(source.read_text(encoding='utf-8'))
    if not any(s['name']==SKIN for s in data.get('skins',[])):raise AssemblyError('REFERENCE_SKIN_REQUIRED')
    parts={}
    for part,name in PARTS.items():
        path=f'{SKIN}/{name}';region=report['regions'].get(path)
        if region is None:raise AssemblyError('PART_MAPPING_MISSING:'+part)
        page=region['page'];size=report['pages'][page]['observed_dimensions'];properties=region['properties']
        if properties.get('rotate','false') not in ('false','0') or properties.get('bounds') is None:raise AssemblyError('UNSUPPORTED_ATLAS_GEOMETRY')
        if [int(v) for v in properties['bounds'].split(',')]!=[0,0,*size]:raise AssemblyError('PART_NOT_FULL_PAGE')
        if properties.get('offsets') and [int(v) for v in properties['offsets'].split(',')]!=[0,0,*size]:raise AssemblyError('TRIM_NOT_SUPPORTED')
        if report['pages'][page]['properties'].get('pma','false')!='false':raise AssemblyError('PMA_NOT_SUPPORTED')
        if sum(r['page']==page for r in report['regions'].values())!=1:raise AssemblyError('SHARED_PART_PAGE')
        parts[part]={'file':page,'region':path,'canvas':size,'source_sha256':report['pages'][page]['sha256'],'targets':[[m['slot'],m['attachment']] for m in report['mappings'] if m['skin']==SKIN and m['path']==path]}
    return {'schema_version':'1.0.0','profile':'reference_hair_8part_v2','status':'EXPERIMENTAL','production_approved':False,'template_revision':REVISION,'source_sha256':report['source_sha256'],'atlas_sha256':report['atlas_sha256'],'parts':parts,'geometry':'PRESERVED_UNCALIBRATED','policy':{'revision':REVISION,'skin':SKIN,'face_slots':FACE,'back_hide_slots':['hair-front'],'head_base_source':'spineboy/head-base','ear_source':'spineboy/ear','back_order':['body','head-base','back-hair'],'requires_runtime_guard':True}}

def decode_order(names,offsets):
    result=[None]*len(names);unchanged=[];index=0
    for entry in offsets:
        if entry['slot'] not in names:raise AssemblyError('DRAW_ORDER_SLOT_MISSING')
        target=names.index(entry['slot'])
        if target<index:raise AssemblyError('DRAW_ORDER_NOT_SORTED')
        unchanged.extend(names[index:target]);index=target
        destination=index+entry['offset']
        if not 0<=destination<len(names) or result[destination] is not None:raise AssemblyError('INVALID_DRAW_ORDER')
        result[destination]=names[index];index+=1
    unchanged.extend(names[index:]);iterator=iter(unchanged)
    return [next(iterator) if value is None else value for value in result]

def encode_order(names,order):
    if sorted(names)!=sorted(order):raise AssemblyError('INVALID_ORDER_PERMUTATION')
    return [{'slot':name,'offset':order.index(name)-index} for index,name in enumerate(names)]

def revise_template(data,policy):
    result=copy.deepcopy(data);names=[s['name'] for s in data['slots']];changes=[]
    for action in ('idle','trot'):
        name=f'movement/{action}-back';animation=result['animations'].get(name)
        if animation is None:raise AssemblyError('MOVEMENT_MISSING')
        key='drawOrder' if 'draworder' not in animation else 'draworder'
        frames=animation.get(key,[{'time':0}])
        for frame in frames:
            order=decode_order(names,frame.get('offsets',[]));before=order[:]
            body='body';head='head-base';hair='back-hair'
            if not all(slot in names for slot in (body,head,hair)):raise AssemblyError('BACK_ORDER_SLOT_MISSING')
            order.remove(body);order.insert(order.index(head),body)
            if order.index(hair)<order.index(head):order.remove(hair);order.insert(order.index(head)+1,hair)
            frame['offsets']=encode_order(names,order)
            changes.append({'animation':name,'time':frame.get('time',0),'before':before,'after':order})
        animation[key]=frames
    return result,changes

def verify_bundle(directory):
    manifest=json.loads((directory/'build-manifest.json').read_text(encoding='utf-8'))
    if not {'skeleton.json','skeleton.atlas','orientation-policy.json','orientation.js','assembly-report.json'}<=set(manifest['files']):raise AssemblyError('BUNDLE_INCOMPLETE')
    for name,sha in manifest['files'].items():
        path=(directory/name).resolve()
        if not path.is_relative_to(directory.resolve()) or not path.is_file() or digest(path)!=sha:raise AssemblyError('BUNDLE_HASH_MISMATCH')
    report=inspect_template(directory/'skeleton.json',directory/'skeleton.atlas')
    if report['defects']:raise AssemblyError('BUNDLE_REFERENCE_INVALID')
    if not set(report['pages'])<=set(manifest['files']):raise AssemblyError('PAGE_HASH_MISSING')
    # Only bounded review variants admit the larger genuine 4x texture. Normal
    # production/raw ingestion retains its original 16M-pixel decode limit.
    pixel_limit=33554432 if manifest.get('review_variant',{}).get('scale') in (1,2,4) else 16777216
    for name in report['pages']:png_info(directory/name,blank=name==manifest['blank_file'],max_pixels=pixel_limit)
    return manifest

def build(source,atlas,parts,profile,output):
    source,atlas,parts,output=map(lambda p:Path(p).resolve(),(source,atlas,parts,output))
    if output.exists() or output.is_relative_to(parts) or parts.is_relative_to(output) or source.is_relative_to(output) or atlas.is_relative_to(output):raise AssemblyError('UNSAFE_OR_EXISTING_DESTINATION')
    expected=make_profile(source,atlas)
    if canonical(profile)!=canonical(expected):raise AssemblyError('PROFILE_STALE_OR_CHANGED')
    data=json.loads(source.read_text(encoding='utf-8'));revised,changes=revise_template(data,profile['policy'])
    # Only the declared drawOrder fields are allowed to change.
    check=copy.deepcopy(revised)
    for action in ('idle','trot'):
        name=f'movement/{action}-back'
        for key in ('drawOrder','draworder'):
            check['animations'][name].pop(key,None)
            if key in data['animations'][name]:check['animations'][name][key]=copy.deepcopy(data['animations'][name][key])
    if check!=data:raise AssemblyError('TEMPLATE_MUTATION_FORBIDDEN')
    report=inspect_template(source,atlas);payload={}
    for name in report['pages']:
        path=(atlas.parent/name).resolve()
        if not path.is_relative_to(atlas.parent):raise AssemblyError('UNSAFE_PAGE')
        with Image.open(path) as image:image.load()
        payload[name]=path.read_bytes()
    for part,spec in profile['parts'].items():
        name=spec['file'];path=(parts/name).resolve()
        if not path.is_relative_to(parts):raise AssemblyError('PART_PATH_ESCAPE')
        if part=='BLANK':
            buffer=io.BytesIO();Image.new('RGBA',spec['canvas'],(0,0,0,0)).save(buffer,format='PNG');payload[name]=buffer.getvalue()
        else:
            if png_info(path)!=spec['canvas']:raise AssemblyError('PART_SIZE_MISMATCH:'+part)
            payload[name]=path.read_bytes()
    payload['skeleton.json']=canonical(revised)+b'\n';payload['skeleton.atlas']=atlas.read_bytes()
    runtime_policy=copy.deepcopy(profile['policy'])
    if profile['profile']=='reference_hair_8part_v2':runtime_policy.update(front_order=['body','arm-r','arm-l','head-base'],back_arm_order=['arm-r','arm-l','body'],ear_slots=['ear-l','ear-r'],orientation_revision=VERSIONS['workflow']['orientation_revision'],has_skirt=bool(next(s for s in data['skins'] if s['name']==SKIN)['attachments'].get('skirt')))
    payload['orientation-policy.json']=canonical(runtime_policy)+b'\n'
    helper=Path(__file__).resolve().parents[2]/'ui/orientation.js'
    payload['orientation.js']=helper.read_bytes()
    payload['assembly-report.json']=canonical({'status':'ASSEMBLED_RENDER_UNVERIFIED','template_revision':REVISION,'changes':changes,'bones_ik_mesh_expression_preserved':True,'production_approved':False})+b'\n'
    manifest={'runtime':{'package':VERSIONS['spine']['runtime_package'],'version':VERSIONS['spine']['runtime_package_version']},'tool_version':VERSIONS['product']['version'],'status':'ASSEMBLED_RENDER_UNVERIFIED','source_sha256':profile['source_sha256'],'source_atlas_sha256':profile['atlas_sha256'],'profile_sha256':hashlib.sha256(canonical(profile)).hexdigest(),'template_revision':REVISION,'skin':SKIN,'blank_file':profile['parts']['BLANK']['file'],'parts':{p:hashlib.sha256(payload[s['file']]).hexdigest() for p,s in profile['parts'].items()},'files':{name:hashlib.sha256(value).hexdigest() for name,value in sorted(payload.items())},'runtime_guard_required':True,'sizes':'EXPERIMENTAL_NOT_PRODUCTION_APPROVED','editor_project':'UNAVAILABLE'}
    payload['build-manifest.json']=canonical(manifest)+b'\n'
    output.parent.mkdir(parents=True,exist_ok=True)
    # No recursive cleanup of user paths. On failure, the staging directory is retained.
    stage=Path(tempfile.mkdtemp(prefix='.assembly-',dir=output.parent))
    for name,content in payload.items():
        path=stage/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(content)
    verify_bundle(stage)
    os.rename(stage,output)
    return manifest

def bundle_zip(directory):
    manifest=verify_bundle(directory);buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted([*manifest['files'],'build-manifest.json']):
            info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,(directory/name).read_bytes())
    return buffer.getvalue()
