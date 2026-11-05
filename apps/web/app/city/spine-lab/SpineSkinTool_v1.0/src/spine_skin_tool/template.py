"""只读解析资源引用；不修改骨架或推测几何校准值。"""
import hashlib
import json
from pathlib import Path, PureWindowsPath
import struct


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect_template(source: Path, atlas: Path) -> dict:
    source, atlas = source.resolve(), atlas.resolve()
    data = json.loads(source.read_text(encoding='utf-8'))
    defects, pages, regions = [], {}, {}
    def fail(code, reference):
        defects.append({'code':code, 'reference':reference})
    version = data.get('skeleton', {}).get('spine', '')
    if version.split('.')[:2] != ['4','3']:
        fail('RUNTIME_VERSION_MISMATCH', version)
    page = region = None
    boundary = True
    for raw in atlas.read_text(encoding='utf-8-sig').splitlines():
        line = raw.strip()
        if not line:
            boundary = True
            continue
        if ':' not in line:
            if boundary or page is None:
                page, region = line, None
                if page in pages: fail('DUPLICATE_PAGE', page)
                pages[page] = {'properties':{}}
            else:
                region = line
                if region in regions: fail('DUPLICATE_REGION', region)
                regions[region] = {'page':page, 'properties':{}}
            boundary = False
        else:
            key, value = line.split(':',1)
            if page is None: fail('INVALID_ATLAS', key)
            else: (regions[region] if region else pages[page])['properties'][key] = value.strip()
    if not pages: fail('EMPTY_ATLAS','atlas')
    for name, item in pages.items():
        path = atlas.parent / name
        if Path(name).is_absolute() or PureWindowsPath(name).drive or '..' in Path(name).parts or '\\' in name or not path.resolve().is_relative_to(atlas.parent):
            fail('UNSAFE_PAGE_PATH', name)
            continue
        if not path.is_file():
            fail('MISSING_ATLAS_PAGE', name)
            continue
        content = path.read_bytes()
        if len(content)<24 or content[:8] != b'\x89PNG\r\n\x1a\n':
            fail('INVALID_PNG',name)
            continue
        item.update(sha256=digest(path), observed_dimensions=list(struct.unpack('>II',content[16:24])))
        expected = item['properties'].get('size')
        if expected and [int(v) for v in expected.split(',')] != item['observed_dimensions']:
            fail('PAGE_SIZE_MISMATCH',name)
    bones = {b['name']:b for b in data.get('bones',[])}
    slots = {s['name']:s for s in data.get('slots',[])}
    for name,bone in bones.items():
        if bone.get('parent') and bone['parent'] not in bones: fail('MISSING_BONE_PARENT',name)
    for name,slot in slots.items():
        if slot['bone'] not in bones: fail('MISSING_SLOT_BONE',name)
    attachments = {}
    for skin in data.get('skins',[]):
        for slot, values in skin.get('attachments',{}).items():
            if slot not in slots: fail('MISSING_SLOT',slot)
            for name, attachment in values.items():
                attachments[(skin['name'],slot,name)] = attachment
    mappings=[]
    def resolve(key, seen):
        if key in seen:
            fail('LINKEDMESH_CYCLE','/'.join(key)); return None
        attachment=attachments.get(key)
        if attachment is None:
            fail('MISSING_LINKEDMESH','/'.join(key)); return None
        if attachment.get('type')=='linkedmesh':
            target=(attachment.get('skin','default'),key[1],attachment.get('source',attachment.get('parent','')))
            return resolve(target,seen|{key})
        return key
    for key, attachment in attachments.items():
        kind=attachment.get('type','region')
        resolved=resolve(key,set())
        path=attachment.get('path',attachment.get('name',key[2]))
        texture=regions.get(path)
        if kind in ('region','mesh','linkedmesh') and texture is None: fail('MISSING_REGION','/'.join(key)+':'+path)
        mappings.append({'skin':key[0],'slot':key[1],'attachment':key[2],'bone':slots.get(key[1],{}).get('bone'),'type':kind,'path':path,'page':texture['page'] if texture else None,'mesh_source':list(resolved) if resolved else None,'geometry_sha256':hashlib.sha256(json.dumps({k:attachment.get(k) for k in ('uvs','vertices','triangles','parent','skin','bones')},sort_keys=True).encode()).hexdigest()})
    def duration(value):
        if isinstance(value,dict): return max([float(value.get('time',0))]+[duration(v) for k,v in value.items() if k!='time'],default=0)
        if isinstance(value,list): return max(map(duration,value),default=0)
        return 0
    animations={name:{'duration':duration(value),'timeline_keys':list(value),'drawOrder':value.get('drawOrder',value.get('draworder',[])),'slot_timelines':value.get('slots',{})} for name,value in data.get('animations',{}).items()}
    return {'status':'INVALID' if defects else 'STRUCTURE_VALID_RENDER_UNVERIFIED','source_sha256':digest(source),'atlas_sha256':digest(atlas),'spine_version':version,'counts':{'bones':len(bones),'slots':len(slots),'skins':len(data.get('skins',[])),'animations':len(animations)},'bones':data.get('bones',[]),'slots':data.get('slots',[]),'constraints':{key:data.get(key,[]) for key in ('ik','transform','path','physics')},'pages':pages,'regions':regions,'mappings':mappings,'animations':animations,'defects':defects,'licensing':'LOCAL_INSPECTION_ONLY_REDISTRIBUTION_UNVERIFIED','sizes':'OBSERVATIONS_NOT_PRODUCTION_SETTINGS'}
