"""Read-only variants and genuine Spine browser evidence for a review job."""
import copy,json,os,subprocess
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageOps,ImageFilter
from .assembly import canonical,verify_bundle,VERSIONS
from .design import ROOT,private_path,require,digest,DesignError
from .review import (policy,review_dir,read_review,save_report,aggregate,finding,image_metrics,LOCK)
from .reference_assets import library_root


def renderer_python_executable(tool_root=ROOT,platform=None):
    """The preview subprocess must use the VM's own pinned Python interpreter."""
    name=os.name if platform is None else platform
    require(name in ('nt','posix'),'REVIEW_OS_UNSUPPORTED')
    return tool_root/('runtime/python/.venv/Scripts/python.exe' if name=='nt' else 'runtime/python/.venv/bin/python')


def scale_bundle(source,destination,scale):
    require(scale in (1,2,4),'REVIEW_SCALE');manifest=copy.deepcopy(verify_bundle(source))
    require(not destination.exists(),'OUTPUT_ALREADY_EXISTS');destination.mkdir(parents=True)
    dimensions={}
    for name in manifest['files']:
        path=destination/name;path.parent.mkdir(parents=True,exist_ok=True)
        if name.startswith('ai-city-template-') and name.endswith('.png'):
            with Image.open(source/name) as raw:
                image=raw.convert('RGBA');size=(image.width*scale,image.height*scale)
                # Hair preparation admits 1400px + 4px margin. Its genuine 4x
                # review is up to 31,539,456 pixels; keep the full sample rather
                # than silently reducing resolution or rejecting a valid export.
                require(size[0]*size[1]<=33554432,'REVIEW_SCALE_PIXEL_LIMIT')
                image.resize(size,Image.Resampling.LANCZOS).save(path);dimensions[name]=size
        else:path.write_bytes((source/name).read_bytes())
    lines=(destination/'skeleton.atlas').read_text(encoding='utf-8').splitlines();page=None
    for i,line in enumerate(lines):
        if line in dimensions:page=line
        elif line and not line[0].isspace() and line.endswith('.png'):page=None
        if page in dimensions:
            w,h=dimensions[page];key=line.strip().split(':')[0]
            if key=='size':lines[i]=f'size: {w}, {h}'
            elif key=='bounds':lines[i]=f'bounds: 0, 0, {w}, {h}'
            elif key=='offsets':lines[i]=f'offsets: 0, 0, {w}, {h}'
    (destination/'skeleton.atlas').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    manifest['review_variant']={'scale':scale,'parent_manifest_sha256':digest(source/'build-manifest.json')}
    for name in manifest['files']:manifest['files'][name]=digest(destination/name)
    for part in manifest['parts']:
        name='ai-city-template-'+{'HAIR_BACK':'hair-back','BODY_BACK':'body-back','ARM_BACK':'arm-back','LEG_BACK':'leg-back'}.get(part,part.lower().replace('_front','').replace('_','-'))+'.png'
        if name in manifest['files']:manifest['parts'][part]=manifest['files'][name]
    (destination/'build-manifest.json').write_bytes(canonical(manifest)+b'\n');verify_bundle(destination)
    require((source/'skeleton.json').read_bytes()==(destination/'skeleton.json').read_bytes(),'SCALE_CHANGED_GEOMETRY')


def frame_issues(frame,has_skirt,integrated_ears=False):
    issues=[];order=frame['drawOrder'];slots={s['name']:s['attachment'] for s in frame['slots']};back=frame['direction']=='back'
    def add(code,message):issues.append(finding(code,frame_id=frame['frame_id'],direction=frame['direction'],message=message))
    def at(name):return order.index(name) if name in order else -1
    if any(n not in order for n in ('leg-l','leg-r','body','arm-l','arm-r','head-base','hair-front','back-hair','ear-l','ear-r')):add('RUNTIME_SLOT_MISSING','必須のスロットがありません。')
    if frame['visible_pixels']<100:add('RUNTIME_EMPTY_FRAME','キャラクターが描画されていません。')
    import math
    if any(not math.isfinite(v) for row in frame['bones'] for v in row):add('RUNTIME_NONFINITE_GEOMETRY','骨格に無効な値があります。')
    for arm in ('arm-l','arm-r'):
        if any(at(n)<0 for n in (arm,'body','head-base','ear-l','ear-r')):add('RUNTIME_SLOT_MISSING','必須のスロットがありません。');continue
        if not (at(arm)<at('body') if back else at('body')<at(arm)):add('ARM_BODY_ORDER','腕と胴体の前後関係が方向ルールと異なります。')
        if has_skirt and not (at(arm)<at('skirt') if back else at('skirt')<at(arm)):add('ARM_SKIRT_ORDER','背面ではスカートを腕より前に置いてください。')
        if any(at(arm)>=at(n) for n in ('head-base','ear-l','ear-r','hair-front')):add('ARM_IN_FRONT_OF_HEAD','腕が頭部より前に出ています。')
        if any(at(leg)>=min(at(arm),at('body')) for leg in ('leg-l','leg-r')):add('LEG_BODY_ORDER','脚が胴体より前に出ています。')
    if not slots.get('back-hair' if back else 'hair-front'):add('HAIR_ATTACHMENT_MISSING','方向に対応する髪の部品が表示されていません。')
    for ear in ('ear-l','ear-r'):
        if (slots.get(ear) if integrated_ears else (back and slots.get(ear)) or (not back and not slots.get(ear))):add('EAR_ATTACHMENT_VISIBILITY','耳の表示が方向ルールと異なります。')
        if at(ear)>=at('back-hair' if back else 'hair-front'):add('EAR_IN_FRONT_OF_HAIR','耳が髪より前に出ています。')
    if back:
        if slots.get('hair-front') or slots.get('eye-l') or at('back-hair')<at('head-base'):add('REAR_HEAD_RULE','背面に顔・正面の髪が残っているか、後髪が頭部を覆っていません。')
    return issues


def assess_assembled_alpha(image,frame):
    """Judge stray alpha on the ACTUAL composed Spine character, not input parts."""
    measured=image_metrics(image)
    issues=[]
    identity=frame['frame_id'];direction=frame['direction']
    if not measured['main_alpha_bbox']:
        issues.append(finding('ASSEMBLED_EMPTY_ALPHA',message='合成キャラクターに不透明な本体がありません。',
            frame_id=identity,direction=direction))
    elif measured['opaque_background']:
        issues.append(finding('ASSEMBLED_OPAQUE_BACKGROUND',message='キャラクターの背景が透明ではありません。',
            frame_id=identity,direction=direction))
    elif measured['outlier_bbox_ratio']>policy()['raw_alpha_outlier_ratio']:
        issues.append(finding('ASSEMBLED_ALPHA_OUTLIERS',result='UNKNOWN',severity='MINOR',
            message='合成後のキャラクター画面に弱い透過画素が外側に残っています。',
            frame_id=identity,direction=direction))
    return measured,issues


def assembled_alpha_evidence(folder,frames):
    """Read composited transparent PNGs at 1x across ALL captured animations/directions."""
    baseline=[f for f in frames if f.get('scale')==1]
    require(len(baseline)>=20,'ASSEMBLED_ALPHA_EVIDENCE_MISSING')
    readings=[];issues=[]
    for frame in baseline:
        path=(folder/frame['screenshot']).resolve()
        require(path.is_relative_to(folder.resolve()) and path.is_file(),'ASSEMBLED_ALPHA_EVIDENCE_INVALID')
        with Image.open(path) as image:
            require(image.format=='PNG' and image.mode=='RGBA' and image.size==(512,512),'ASSEMBLED_ALPHA_EVIDENCE_INVALID')
            metrics,found=assess_assembled_alpha(image,frame)
        readings.append({'frame_id':frame['frame_id'],'direction':frame['direction'],
            'outlier_bbox_ratio':metrics['outlier_bbox_ratio'],
            'main_alpha_bbox':metrics['main_alpha_bbox'],
            'has_outliers':bool(found)})
        issues.extend(found)
    return issues,readings


def preview_rear_mask_calibration(fit,environment=None):
    """The 2px raster-edge correction requires opted-in exhibition + audited fit008."""
    env=os.environ if environment is None else environment
    metrics=fit.get('metrics',{}) if isinstance(fit,dict) else {}
    flag={'preview-staging-20261107':'AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH',
          'preview-visitors-20261019':'AI_CITY_SPINE_PRODUCTION_AUTO_PUBLISH'}.get(env.get('AI_CITY_VISITOR_NAMESPACE'))
    return (bool(flag) and env.get(flag)=='1'
            and fit.get('revision')=='head-alpha-fit-008'
            and metrics.get('status')=='ESTIMATED_NOT_VISUALLY_APPROVED'
            and isinstance(metrics.get('rear_head_coverage'),(int,float))
            and metrics['rear_head_coverage']>=policy()['rear_head_coverage_warning'])


def mask_metrics(folder,frame,preview_back_interior=False):
    masks=frame.get('masks',{})
    if not masks:return None
    def alpha(name):
        with Image.open(folder/masks[name]) as im:return im.getchannel('A').point(lambda v:255 if v>32 else 0)
    head,hair,legs,cover=map(alpha,('head','hair','legs','cover'));box=head.getbbox()
    def area(im):return im.histogram()[255]
    coverage=None
    if box:
        zone=head.copy()
        if frame['direction']=='back' and preview_back_interior:
            # The projected head/hair slot masks disagree by ~2 raster pixels
            # at the outer rim. Measure the interior, never waive real gaps.
            interior=head.filter(ImageFilter.MinFilter(5))
            if area(interior)>0:zone=interior
        if frame['direction']!='back':
            x0,y0,x1,y1=box;zone=Image.new('L',head.size);zone.paste(head.crop((x0,y0,x1,y0+max(1,round((y1-y0)*.1)))),(x0,y0))
        coverage=area(ImageChops.multiply(zone,hair))/max(1,area(zone))
    ears={}
    with Image.open(folder/frame['screenshot']) as im:full=im.convert('RGBA')
    for ear in ('ear-l','ear-r'):
        with Image.open(folder/masks['without-'+ear]) as im:delta=ImageChops.difference(full.convert('RGB'),im.convert('RGB')).convert('L')
        ears[ear]={'visible_difference_pixels':sum(delta.point(lambda v:255 if v>8 else 0).histogram()[255:]),'isolated_pixels':area(alpha(ear))}
    overlap=ImageChops.multiply(legs,cover);legbox=legs.getbbox();root_ratio=None
    if legbox:
        x0,y0,x1,y1=legbox;root=Image.new('L',legs.size);root.paste(legs.crop((x0,y0,x1,min(y1,y0+max(3,round((y1-y0)*.08))))),(x0,y0))
        near=cover.filter(ImageFilter.MaxFilter(2*policy()['leg_root_gap_warning_pixels']+1));root_ratio=area(ImageChops.multiply(root,near))/max(1,area(root))
    return {'head_coverage':coverage,'ear_visibility':ears,'leg_root_connection_ratio':root_ratio,'leg_cover_overlap_pixels':area(overlap),'leg_pixels':area(legs)}


def make_reference_sheet(folder,design,root=ROOT):
    """Rendering comparison only; never a generator input or identity template."""
    from .design import photo_path
    photo=photo_path(root,design['photo']['file']);style_root=library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images'
    components=[('harri','body'),('harri','arm'),('harri','leg'),('davide','body'),('spineboy','body'),
        ('harri','hair-front'),('harri','back-hair'),('davide','hair-front'),('spineboy','hair-front'),('erikari','skirt')]
    paths=[photo,*[style_root/skin/(part+'.png') for skin,part in components]]
    refs=Image.new('RGB',(800,300*((len(paths)+2)//3)),'#ecedea');draw=ImageDraw.Draw(refs);sources=[]
    for i,path in enumerate(paths):
        with Image.open(path) as raw:thumb=ImageOps.contain(raw.convert('RGBA'),(240,250))
        x=(i%3)*266+(266-thumb.width)//2;y=(i//3)*300+35
        refs.paste(thumb,(x,y),thumb);label='ORIGINAL PHOTO' if i==0 else 'STYLE ONLY '+path.parent.name+'/'+path.stem
        draw.text(((i%3)*266+6,(i//3)*300+8),label,fill='black')
        sources.append({'role':'original_photo' if i==0 else 'original_style_review_only','source':design['photo']['file'] if i==0 else path.relative_to(style_root).as_posix(),'sha256':digest(path)})
    refs.save(folder/'original-references.png')
    (folder/'reference-sources.json').write_bytes(canonical({'revision':'original-style-sheet-002','generator_input':False,'sources':sources})+b'\n')


def make_sheets(folder,context,root=ROOT):
    from .design import required_parts
    from .assembly import PARTS
    output=Path(root)/context['character_output'];parts=required_parts(context['design']['design'])
    sheet=Image.new('RGB',(960,200*((len(parts)+3)//4)),'#566676');draw=ImageDraw.Draw(sheet)
    for i,part in enumerate(parts):
        key=PARTS.get(part,'skirt' if part=='SKIRT_FRONT' else 'skirt-back')
        with Image.open(output/'export/bundle'/('ai-city-template-'+key+'.png')) as raw:thumb=ImageOps.contain(raw.convert('RGBA'),(220,170))
        x=(i%4)*240+(240-thumb.width)//2;y=(i//4)*200+25
        sheet.paste(thumb,(x,y),thumb);draw.text(((i%4)*240+8,(i//4)*200+5),part,fill='white')
    sheet.save(folder/'parts-sheet.png')
    make_reference_sheet(folder,context['design']['design'],root)
    frames=json.loads((folder/'frames.json').read_text(encoding='utf-8'))
    base=[f for f in frames if f['scale']==1]
    selected=[f for f in base if (f['kind']=='movement' and ((f['animation'].startswith('movement/idle-') and f['time']==.5) or (f['direction'] in ('front','back') and f['animation'].startswith('movement/trot-') and f['time'] in (.25,.75)))) or (f['kind']=='emote' and f['overlay']=='emotes/wave' and f['direction']=='front' and f['time']==.5)]
    overview=Image.new('RGB',(1536,540*((len(selected)+2)//3)),'#33434f');draw=ImageDraw.Draw(overview)
    for i,f in enumerate(selected):
        with Image.open(folder/f['screenshot']) as im:overview.paste(im,(i%3*512,i//3*540+24),im)
        draw.text((i%3*512+8,i//3*540+4),f['frame_id']+' '+f['animation']+' '+str(f['time']),fill='white')
    overview.save(folder/'overview.png')
    sheets={'overview':[f['frame_id'] for f in selected]}
    for label,mask,subset in [('near-head','head',[f for f in selected if f['animation'].startswith('movement/idle-')]),('near-body','cover',selected)]:
        chosen=subset[:6];sheet=Image.new('RGB',(1500,620*((len(chosen)+2)//3)),'#33434f');draw=ImageDraw.Draw(sheet);ids=[]
        for i,f in enumerate(chosen):
            high=next(x for x in frames if x['frame_id']=='s4-'+f['frame_id'].split('-')[1]);ids.append(high['frame_id'])
            with Image.open(folder/f['masks'][mask]) as im:box=im.getchannel('A').getbbox()
            if mask=='head':
                with Image.open(folder/f['masks']['hair']) as hair:hairbox=hair.getchannel('A').getbbox()
                if hairbox and box:box=(min(box[0],hairbox[0]),min(box[1],hairbox[1]),max(box[2],hairbox[2]),max(box[3],hairbox[3]))
            if not box:box=(0,0,512,512)
            x0,y0,x1,y1=box
            if mask=='cover':x0-=55;x1+=55;y0-=20;y1+=95
            box=(max(0,(x0-5)*4),max(0,(y0-5)*4),min(2048,(x1+5)*4),min(2048,(y1+5)*4))
            with Image.open(folder/high['screenshot']) as image:thumb=ImageOps.contain(image.crop(box),(480,570))
            x=i%3*500+(500-thumb.width)//2;y=i//3*620+35;sheet.paste(thumb,(x,y),thumb);draw.text((i%3*500+8,i//3*620+8),high['frame_id']+' '+f['direction'],fill='white')
        sheet.save(folder/(label+'.png'));sheets[label]=ids
    (folder/'sheets.json').write_bytes(canonical(sheets)+b'\n')


def collect_evidence(root,identity):
    root=Path(root).resolve();folder=review_dir(root,identity)
    with LOCK:
        report=read_review(root,identity);require(report['hard']['status']!='FAIL','HARD_CHECKS_FAILED')
        marker=folder/'render.started'
        try:marker.open('x').close()
        except FileExistsError:raise DesignError('RENDER_ALREADY_STARTED') from None
        report['render']={'status':'RUNNING','defects':[]};save_report(root,report)
    try:
        context=json.loads((folder/'context.json').read_text(encoding='utf-8'));bundle=private_path(root,context['character_output']+'/export/bundle')
        evidence=folder/'evidence';evidence.mkdir();variants={}
        for scale in policy()['render_scales']:
            variant=folder/'variants'/str(scale);scale_bundle(bundle,variant,scale);variants[str(scale)]=str(variant)
        config={'review_id':identity,'variants':variants,'output':str(evidence),'python':str(renderer_python_executable())}
        (folder/'capture-config.json').write_bytes(canonical(config)+b'\n')
        with (folder/'render-stdout.log').open('wb') as stdout,(folder/'render-stderr.log').open('wb') as stderr:
            subprocess.run(['node',str(ROOT/'scripts/capture_review.cjs'),str(folder/'capture-config.json')],cwd=ROOT,stdout=stdout,stderr=stderr,timeout=600,check=True)
        frames=json.loads((evidence/'frames.json').read_text(encoding='utf-8'));issues=[];metrics=[]
        has_skirt=context['design']['design']['appearance']['lower']['kind']=='skirt'
        integrated_ears=json.loads((bundle/'orientation-policy.json').read_text(encoding='utf-8')).get('ear_mode')=='INTEGRATED_SMALL_EARS_IN_HAIR'
        fit_file=bundle/'hair-fit.json'
        fit_info=json.loads(fit_file.read_text(encoding='utf-8')) if fit_file.is_file() else {}
        preview_back_interior=preview_rear_mask_calibration(fit_info)
        for frame in frames:
            issues.extend(frame_issues(frame,has_skirt,integrated_ears));m=mask_metrics(evidence,frame,preview_back_interior)
            if m:metrics.append({'frame_id':frame['frame_id'],'direction':frame['direction'],**m})
        # This is the first stage where the character is genuinely composited.
        # The raw inputs are kept for SHA/provenance only; do not reject them
        # based on faint alpha that the real renderer never shows.
        alpha_issues,alpha_readings=assembled_alpha_evidence(evidence,frames)
        issues.extend(alpha_issues)
        (evidence/'assembled-alpha-metrics.json').write_bytes(canonical({
            'revision':'assembled-composite-alpha-001',
            'source':'transparent-Spine-runtime-RGBA-frames',
            'scale':1,
            'frames':alpha_readings,
        })+b'\n')
        make_sheets(evidence,context,root)
        fit_file=bundle/'hair-fit.json'
        if fit_file.is_file():
            fit=json.loads(fit_file.read_text(encoding='utf-8'))
            if fit['revision'] in ('head-alpha-fit-006','head-alpha-fit-007','head-alpha-fit-008'):
                from .ear_pass import render_guide
                render_guide(root,context['character_output'],evidence/'head-height-guide.png')
                if fit.get('ear_pass'):
                    from .ear_pass import render_ear_layers
                    render_ear_layers(root,fit['ear_pass']['artifact'],evidence/'ear-layer-guide.png')
            if fit['revision']=='head-alpha-fit-005':
                from .hair_fit import target_head
                from .ear_geometry import review_overlay
                head,head_image=target_head(root)
                with Image.open(private_path(root,context['character_output']+'/raw/HAIR_FRONT.png')) as raw:
                    from .texture import prepare_texture
                    front,_=prepare_texture(raw,raw.size,'hair')
                review_overlay(front,head,head_image,fit,evidence/'ear-fit-overlay.png')
        # Explicitly record measured visibility/coverage; provisional thresholds never hard-pass art.
        for m in metrics:
            if m['leg_root_connection_ratio'] is not None and m['leg_root_connection_ratio']==0:
                issues.append(finding('LEG_ROOT_GAP_REQUIRES_REVIEW','CHARACTER','UNKNOWN','脚の付け根と衣装の接合部を確認してください。',m['frame_id'],m['direction'],severity='MINOR'))
            threshold=policy()['rear_head_coverage_warning'] if m['direction']=='back' else policy()['front_crown_coverage_warning']
            if m['head_coverage'] is None or m['head_coverage']<threshold:
                issues.append(finding('HAIR_COVERAGE_REQUIRES_REVIEW','HAIR_BACK' if m['direction']=='back' else 'HAIR_FRONT','UNKNOWN','頭部に対する髪の覆い方を画像で確認してください。',m['frame_id'],m['direction'],severity='MINOR'))
            if not integrated_ears and m['direction']!='back' and any(e['visible_difference_pixels']==0 for e in m['ear_visibility'].values()):
                issues.append(finding('EAR_OCCLUSION_REQUIRES_REVIEW','CHARACTER','UNKNOWN','耳の部品は存在しても、髪に隠れて見えない可能性があります。',m['frame_id'],m['direction'],severity='MINOR'))
        (evidence/'metrics.json').write_bytes(canonical(metrics)+b'\n')
        manifest={'renderer_sha256':{name:digest(ROOT/name) for name in ('ui/viewer.js','scripts/capture_review.cjs')},'review_id':identity,'source_manifest_sha256':context['source_files']['export/bundle/build-manifest.json'],
            'frames':[{k:f[k] for k in ('frame_id','scale','direction','animation','time','overlay','screenshot')} for f in frames],
            'files':{p.relative_to(evidence).as_posix():digest(p) for p in sorted(evidence.rglob('*')) if p.is_file()},
            'model_calls':0,'physical_size_approved':False,'render_scales':policy()['render_scales']}
        if preview_back_interior:
            manifest['rear_head_coverage_revision']='preview-back-head-interior-5px-001'
        manifest['evidence_hash']=__import__('hashlib').sha256(canonical(manifest)).hexdigest()
        (evidence/'manifest.json').write_bytes(canonical(manifest)+b'\n')
        with LOCK:
            report=read_review(root,identity);report['render']={'status':'FAIL' if any(x['result']=='FAIL' for x in issues) else 'PASS',
                'defects':issues,'frame_count':len(frames),'evidence_hash':manifest['evidence_hash'],'metrics_count':len(metrics),'scales':policy()['render_scales'],
                'assembled_alpha_revision':'assembled-composite-alpha-001','assembled_alpha_frames':len(alpha_readings),
                'assembled_alpha_outlier_frames':sum(v['has_outliers'] for v in alpha_readings),
                'rear_head_coverage_revision':manifest.get('rear_head_coverage_revision','full-head-mask-001')}
            report['status']=aggregate(report);save_report(root,report)
    except Exception as error:
        with LOCK:
            report=read_review(root,identity,fresh=False);report['render']={'status':'ERROR','defects':[finding('RENDER_FAILED',result='UNKNOWN',message='動作証拠を収集できませんでした。以前の候補は変更されていません。')],'error_code':getattr(error,'code',type(error).__name__)}
            report['status']=aggregate(report);save_report(root,report)
    return report
