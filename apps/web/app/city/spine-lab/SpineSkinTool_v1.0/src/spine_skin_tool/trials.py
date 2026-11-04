"""可追溯的本地规格试验；不调用模型，不批准生产规格。"""
import copy
import json
import math
from pathlib import Path
import re
import shutil
from PIL import Image, ImageChops, ImageDraw
from .assembly import AssemblyError, PARTS, build, canonical, make_profile, png_info
from .template import digest
from .generation import build_part_prompt, REFERENCE_ROLES, VERSIONS

STYLE = 'reference-hair-pants-8part-v3'

def default_trial(profile):
    return {'schema_version':'1.0.0','status':'EXPERIMENTAL','production_approved':False,
            'style_revision':STYLE,'export_scale':1,'notes':'',
            'parts':{key:{'source_anchor':[0.5,0.5],'target_anchor':[0.5,0.5],
                          'scale':1,'mask':'none','exclude':[],'seams':[]}
                     for key in profile['parts'] if key!='BLANK'}}

def validate_trial(config,profile):
    expected=default_trial(profile)
    if not isinstance(config,dict) or set(config)!=set(expected):raise AssemblyError('TRIAL_KEYS_INVALID')
    for key in ('schema_version','status','production_approved','style_revision'):
        if type(config[key]) is not type(expected[key]) or config[key]!=expected[key]:raise AssemblyError('TRIAL_NOT_EXPERIMENTAL')
    if type(config['export_scale']) is not int or config['export_scale'] not in (1,2,4):raise AssemblyError('EXPORT_SCALE_INVALID')
    if not isinstance(config['notes'],str) or len(config['notes'])>2000:raise AssemblyError('NOTES_INVALID')
    if not isinstance(config['parts'],dict) or set(config['parts'])!=set(expected['parts']):raise AssemblyError('PART_SET_INVALID')
    def number(value,low,high):
        return type(value) in (int,float) and math.isfinite(value) and low<=value<=high
    for spec in config['parts'].values():
        if not isinstance(spec,dict) or set(spec)!=set(next(iter(expected['parts'].values()))):raise AssemblyError('PART_SETTINGS_INVALID')
        if spec['mask'] not in ('reference','none') or not number(spec['scale'],0.25,4):raise AssemblyError('FIT_INVALID')
        for key in ('source_anchor','target_anchor'):
            v=spec[key]
            if not isinstance(v,list) or len(v)!=2 or not all(number(n,0,1) for n in v):raise AssemblyError('ANCHOR_INVALID')
        for key in ('exclude','seams'):
            rects=spec[key]
            if not isinstance(rects,list) or len(rects)>32:raise AssemblyError('REGIONS_INVALID')
            for rect in rects:
                if not isinstance(rect,list) or len(rect)!=4 or not all(number(n,0,1) for n in rect) or rect[0]>=rect[2] or rect[1]>=rect[3]:raise AssemblyError('RECT_INVALID')
    return copy.deepcopy(config)

def fit_part(input_path,reference_path,size,settings):
    png_info(input_path)
    with Image.open(input_path) as raw:source=raw.copy()
    with Image.open(reference_path) as raw:reference=raw.copy()
    w,h=size;sw,sh=source.size
    factor=min(w/sw,h/sh)*settings['scale']
    sx,sy=settings['source_anchor'];tx,ty=settings['target_anchor']
    dx=tx*w-sx*sw*factor;dy=ty*h-sy*sh*factor
    fitted=source.transform((w,h),Image.Transform.AFFINE,(1/factor,0,-dx/factor,0,1/factor,-dy/factor),Image.Resampling.BICUBIC)
    mask=Image.new('L',(w,h),255)
    if settings['mask']=='reference':
        mask=reference.getchannel('A').resize((w,h),Image.Resampling.LANCZOS).point(lambda a:255 if a else 0)
    draw=ImageDraw.Draw(mask)
    for a,b,c,d in settings['exclude']:draw.rectangle((int(a*w),int(b*h),math.ceil(c*w)-1,math.ceil(d*h)-1),fill=0)
    before=sum(fitted.getchannel('A').histogram()[i]*i for i in range(256))
    fitted.putalpha(ImageChops.multiply(fitted.getchannel('A'),mask))
    after=sum(fitted.getchannel('A').histogram()[i]*i for i in range(256))
    warnings=[]
    if dx<0 or dy<0 or dx+sw*factor>w+0.01 or dy+sh*factor>h+0.01:warnings.append('CANVAS_CROP_POSSIBLE')
    if before and after<before:warnings.append('MASK_REMOVED_ALPHA')
    if settings['mask']=='reference':warnings.append('TEMPLATE_ALPHA_SILHOUETTE_CLIPPING')
    if settings['mask']=='none':warnings.append('SILHOUETTE_UNLOCKED')
    return fitted,mask,{'generation_input_canvas':[sw,sh],'export_canvas':[w,h],
                       'uniform_scale':factor,'translation':[dx,dy],
                       'mask_removed_alpha_fraction':1-after/before if before else 0,
                       'seam_regions':settings['seams'],'warnings':warnings}

def trial_request(config,profile):
    return {'status':'REQUEST_ONLY_NO_MODEL_CALL','style_revision':STYLE,
            'prompt_revision':VERSIONS['models']['image_prompt_revision'],'workflow_revision':VERSIONS['workflow']['revision'],
            'context':'Every attempt starts from the original photo, never generated artwork. Image 2 is neutral canvas/anchor context; Image 3 is fixed head/ear reuse; Image 4 is original Harri component construction and style; Image 5 is original Davide/Spineboy style sheet. Hair inputs contain no reference hairstyle.',
            'character_reference_required':True,'character_reference_path':'SELECT_ONE_ORIGINAL_character-reference*.png',
            'input_image_roles':list(REFERENCE_ROLES),
            'construction':'Single convex-dome front/back torso panels; neckline is an interior stroke; no shoulder peaks. all shoulder pixels and sleeves in ARM. Broad tube arms with semicircular hands and no fingers; tube legs matching the connected curved trouser-color band at BODY hem. Rear hair is one coherent simple mass fully covering rear head; compare front/back silhouette at equal head scale during review, never feed generated front hair into rear generation. Optional skirt remains separate with real trot occlusion checks.',
            'constraints':'Front/side order: LEGS < TORSO/SKIRT < ARMS < HEAD_GROUP; rear order: LEGS < ARMS < TORSO/SKIRT < HEAD_GROUP. Hide original ears in ALL states. Front hair includes small partly concealed ears matching the fixed head skin and linework. Use sleeve-tone and warm skin-tone outlines, never flatten original arm outlines. This export specifies future assembly; current preview is not modified. Fixed head, features and expressions remain original; original ear slots stay hidden. Preserve rig unless an explicit geometry trial is approved; never use old alpha as silhouette clipping. Dimensions are experimental observations. No automatic semantic approval.',
            'parts':{key:{'reference_file':spec['file'],'reference_sha256':spec['source_sha256'],
                          'export_canvas':[n*config['export_scale'] for n in spec['canvas']],
                          'alignment':config['parts'][key], 'generator_resolution':'SELECT_WITH_PROVIDER',
                          'prompt':build_part_prompt(key,config.get('notes',''),[n*config['export_scale'] for n in spec['canvas']])}
                     for key,spec in profile['parts'].items() if key!='BLANK'}}

def create_trial(source,atlas,inputs,profile,config,destination):
    source,atlas,inputs,destination=map(lambda p:Path(p).resolve(),(source,atlas,inputs,destination))
    if canonical(make_profile(source,atlas))!=canonical(profile):raise AssemblyError('PROFILE_STALE_OR_CHANGED')
    config=validate_trial(config,profile)
    pixels=[spec['canvas'][0]*spec['canvas'][1]*config['export_scale']**2 for key,spec in profile['parts'].items() if key!='BLANK']
    if max(pixels)>16777216 or sum(pixels)>67108864:raise AssemblyError('EXPORT_PIXEL_BUDGET_EXCEEDED')
    if destination.exists() or destination.is_relative_to(inputs) or inputs.is_relative_to(destination) or source.is_relative_to(destination) or atlas.is_relative_to(destination):raise AssemblyError('UNSAFE_TRIAL_DESTINATION')
    # Failed candidates are retained as evidence and never activated.
    destination.mkdir(parents=True)
    snapshot=destination/'source';snapshot.mkdir();parts=destination/'parts';parts.mkdir()
    raw=destination/'inputs';raw.mkdir();masks=destination/'masks';masks.mkdir()
    from .template import inspect_template
    report=inspect_template(source,atlas)
    for name in report['pages']:shutil.copyfile(atlas.parent/name,snapshot/name)
    shutil.copyfile(source,snapshot/'source.json')
    sizes={};measurements={}
    for key,spec in profile['parts'].items():
        if key=='BLANK':continue
        filename=spec['file'];path=(inputs/filename).resolve()
        if not path.is_relative_to(inputs):raise AssemblyError('INPUT_PATH_ESCAPE')
        png_info(path);shutil.copyfile(path,raw/filename)
        size=[n*config['export_scale'] for n in spec['canvas']]
        fitted,mask,info=fit_part(raw/filename,atlas.parent/filename,size,config['parts'][key])
        fitted.save(parts/filename);png_info(parts/filename)
        fitted.save(snapshot/filename);mask.save(masks/filename)
        sizes[filename]=size
        info.update(input_sha256=digest(raw/filename),reference_sha256=spec['source_sha256'])
        info['provenance']='REFERENCE_REPLAY' if info['input_sha256']==spec['source_sha256'] else 'IMPORTED_IMAGE_ORIGIN_UNVERIFIED'
        measurements[key]=info
    lines=atlas.read_text(encoding='utf-8').splitlines();page=None
    for i,line in enumerate(lines):
        if line in report['pages']:page=line
        if page in sizes:
            w,h=sizes[page]
            if line.strip().startswith('size:'):lines[i]=f'size: {w}, {h}'
            elif line.strip().startswith('bounds:'):lines[i]=f'bounds: 0, 0, {w}, {h}'
            elif line.strip().startswith('offsets:'):lines[i]=f'offsets: 0, 0, {w}, {h}'
    derived=snapshot/'source.atlas';derived.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    derived_profile=make_profile(snapshot/'source.json',derived)
    build(snapshot/'source.json',derived,parts,derived_profile,destination/'bundle')
    result={'status':'AWAITING_MANUAL_REVIEW','production_approved':False,'style_revision':STYLE,
            'source_sha256':digest(source),'atlas_sha256':digest(atlas),'config_sha256':__import__('hashlib').sha256(canonical(config)).hexdigest(),
            'geometry':'PRESERVED_NOT_CALIBRATED','model_calls':0,'parts':measurements}
    for name,value in [('trial.json',config),('profile.json',derived_profile),('report.json',result),('generation-request.json',trial_request(config,profile))]:
        (destination/name).write_bytes(canonical(value)+b'\n')
    return result

def candidates(root):
    if not root.exists():return []
    return [{'id':p.name,'report':json.loads((p/'report.json').read_text(encoding='utf-8'))}
            for p in sorted(root.iterdir()) if re.fullmatch(r'candidate-\d{4}',p.name) and not p.is_symlink() and (p/'report.json').is_file()]
