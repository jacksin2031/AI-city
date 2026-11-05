"""Fixed-base ear-only pass. No hair repaint, old-ear pixels, masks or new rig slots."""
import copy,hashlib,json,re
from pathlib import Path
from PIL import Image,ImageDraw
from .assembly import canonical,verify_bundle
from .design import private_path,require,digest,load_design,photo_path
from .texture import prepare_texture
from .character import region
from .hair_fit import target_head


def request_file(root,identity):
    require(re.fullmatch('[a-f0-9]{64}',identity or ''),'EAR_REQUEST_ID');return private_path(root,'runtime/work/M08/ear-requests/'+identity+'.json')


def render_guide(root,output,destination,tip_only=False):
    source=private_path(root,output);fit=json.loads((source/'export/bundle/hair-fit.json').read_text(encoding='utf-8'));head,head_image=target_head(root)
    canvas=Image.new('RGBA',(1000,660),'#e5e8e9');draw=ImageDraw.Draw(canvas);q=1.2;origin=490
    for part,cx in [('HAIR_FRONT',260),('HAIR_BACK',740)]:
        with Image.open(head_image) as im:head_im=im.convert('RGBA').resize((round(head['width']*q),round(head['height']*q)))
        canvas.alpha_composite(head_im,(round(cx-head['width']*q/2),round(origin-(head['x']+head['height']/2)*q)))
        file=source/'export/bundle'/('ai-city-template-hair-front.png' if part.endswith('FRONT') else 'ai-city-template-hair-back.png')
        with Image.open(file) as im:hair=im.convert('RGBA')
        skeleton=json.loads((source/'export/bundle/skeleton.json').read_text(encoding='utf-8'));skin=next(s for s in skeleton['skins'] if s['name']=='ai-city-original-template')['attachments'];slot='hair-front' if part.endswith('FRONT') else 'back-hair';a=skin[slot][slot]
        hair=hair.resize((max(1,round(a['width']*q)),max(1,round(a['height']*q))),Image.Resampling.LANCZOS)
        canvas.alpha_composite(hair,(round(cx-a['y']*q-a['width']*q/2),round(origin-a['x']*q-a['height']*q/2)))
        level=fit['metrics']['shared_ear_targets']['points'][0][1]
        if not tip_only:draw.line((cx-210,origin-level*q,cx+210,origin-level*q),fill='#008a9a',width=2)
        draw.text((cx-180,555),part+' — SAME HEAD COORDINATES',fill='black')
    draw.text((20,15),'FIXED HAIR CANDIDATE + ORIGINAL HEAD. REFERENCE ONLY.',fill='black');draw.text((20,38),'Shorten named hair TIPS only; preserve crown, fringe and face opening.' if tip_only else 'Cyan line = shared ear-root height. Output only two small EAR sprites, NO hair/head/marks.',fill='black');canvas.save(destination)


def create_request(root,state,part):
    require(part in ('HAIR_FRONT','HAIR_BACK'),'EAR_PART');base=state['ear_base_output'];source=private_path(root,base);verify_bundle(source/'export/bundle')
    record=load_design(root,state['design_id']);fit=json.loads((source/'export/bundle/hair-fit.json').read_text(encoding='utf-8'));require(fit['revision'] in ('head-alpha-fit-006','head-alpha-fit-007'),'EAR_BASE_FIT')
    work=private_path(root,'runtime/work/M08/ear-requests');work.mkdir(parents=True,exist_ok=True)
    guide=work/(state['id']+'-'+part+'-guide.png')
    if not guide.exists():render_guide(root,base,guide)
    inputs=[photo_path(root,state['photo']),guide]
    approval=state.get('front_ear_approval') if part=='HAIR_BACK' else None
    if part=='HAIR_BACK':
        require(approval is not None,'EAR_FRONT_APPROVAL_REQUIRED')
        from .review import review_dir
        require(digest(review_dir(root,approval['review_id'])/'report.json')==approval['report_sha256'],'EAR_APPROVAL_CHANGED')
        front_guide=work/(state['id']+'-approved-front-guide.png')
        if not front_guide.exists():render_guide(root,approval['output'],front_guide)
        inputs.append(front_guide)
    _,hi=target_head(root);fixed=work/('original-head-'+digest(hi)+'.png')
    if not fixed.exists():fixed.write_bytes(hi.read_bytes())
    require(digest(fixed)==digest(hi),'EAR_FIXED_HEAD_CHANGED');inputs.append(fixed)
    prompt=f'''Use case: game asset. Output ONLY TWO SMALL {'FRONT-view' if part=='HAIR_FRONT' else 'REAR-view'} chibi EAR sprites, left and right, isolated from each other on true transparent RGBA. NO head, face, hair, neck, skin patch, reference silhouette, labels or guide lines.
Image 1 is the same original person photo, Image 2 is the fixed confirmed hair+head composite with common ear-height guide. {'Image 3 is the APPROVED FRONT EAR/HAIR style reference; preserve its small ear scale and material treatment while drawing simple outer rear folds, not front inner-ear canals.' if approval else ''} Last image is the original fixed chibi head for warm skin fill and deeper warm outline. Match its skin and the confirmed illustrated-chibi hair style. Keep ears small, rounded and partly-exposed-looking, never giant original ears or realistic anatomy.
Draw only the pair of ear pieces, arranged left and right without touching, approximately equal size. LEFT image ear has its attachment edge on its RIGHT (inner) side; RIGHT image ear has its attachment edge on its LEFT (inner) side. Keep both upright. Do NOT redraw the confirmed hair. They will be uniformly scaled and composed at the shared head-local ear ROOT coordinates, BEHIND the existing hair, with the original fixed head and animation unchanged. Their placement will NOT refit or move the hair. Front and rear use the same anatomical height. The source composites are fixed references for this ear-only exception, never successive edit targets. Do not include any of their pixels in the output. One pair only, alpha transparent everywhere else.'''
    if fit['revision']=='head-alpha-fit-007':
        prompt=prompt.replace('skin patch, ','').replace('warm skin fill and deeper warm outline. Match its skin','warm material fill and deeper outline. Match its palette')
        prompt+='\nBOTH ears are broad rounded little shapes, not narrow slivers; width about 75% of height. Each must remain recognizable with about 40-60% visible behind the fixed hair. Same original photo and SAME fixed base. Do not redraw hair. Trial '+str(1+sum(x['part']==('EARS_'+part.split('_')[1]) for x in state.get('failed_jobs',[])))+'.'
    data={'flow_id':state['id'],'part':part,'design_id':state['design_id'],'base_output':base,'base_manifest_sha256':digest(source/'export/bundle/build-manifest.json'),'base_fit_sha256':digest(source/'export/bundle/hair-fit.json'),'inputs':[{'file':p.relative_to(root).as_posix(),'sha256':digest(p)} for p in inputs],'front_approval':approval,'prompt':prompt}
    identity=hashlib.sha256(canonical(data)).hexdigest();path=request_file(root,identity)
    if not path.exists():path.write_bytes(canonical(data)+b'\n')
    else:require(json.loads(path.read_text(encoding='utf-8'))==data,'EAR_REQUEST_CHANGED')
    return identity


def load_request(root,identity):
    d=json.loads(request_file(root,identity).read_text(encoding='utf-8'));require(hashlib.sha256(canonical(d)).hexdigest()==identity,'EAR_REQUEST_CHANGED');source=private_path(root,d['base_output'])
    require(digest(source/'export/bundle/build-manifest.json')==d['base_manifest_sha256'] and digest(source/'export/bundle/hair-fit.json')==d['base_fit_sha256'],'EAR_BASE_CHANGED')
    for i in d['inputs']:require(digest(private_path(root,i['file']))==i['sha256'],'EAR_REFERENCE_CHANGED')
    return d


def references(root,request_id,job):
    request=load_request(root,request_id);folder=job/'references';folder.mkdir();paths=[]
    for i,item in enumerate(request['inputs']):
        dest=folder/f'ear-reference-{i}.png';dest.write_bytes(private_path(root,item['file']).read_bytes());paths.append(dest)
    return paths


def pieces(image):
    """Isolate new ear sprites only; never crop or mask a hair or original atlas."""
    im=image.convert('RGBA');require(im.getchannel('A').getextrema()[0]<255,'EAR_ALPHA_REQUIRED');small=im.copy();small.thumbnail((512,512));alpha=small.getchannel('A');pending={(x,y) for y in range(small.height) for x in range(small.width) if alpha.getpixel((x,y))>96};groups=[]
    while pending:
        stack=[pending.pop()];points=[]
        while stack:
            p=stack.pop();points.append(p);x,y=p
            for n in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if n in pending:pending.remove(n);stack.append(n)
        if len(points)>=40:groups.append(points)
    groups.sort(key=len,reverse=True);require(len(groups)>=2,'EAR_PAIR_REQUIRED');require(len(groups)==2 or len(groups[2])<len(groups[1])*.04,'EAR_EXTRA_PARTS')
    result=[]
    for g in groups[:2]:
        xs=[x for x,y in g];ys=[y for x,y in g];box=(int(min(xs)*im.width/small.width),int(min(ys)*im.height/small.height),math_ceil((max(xs)+1)*im.width/small.width),math_ceil((max(ys)+1)*im.height/small.height))
        require(.2<=(box[2]-box[0])/(box[3]-box[1])<=2,'EAR_SHAPE');require(len(g)<small.width*small.height*.30,'EAR_HEAD_OR_MATTE');result.append((box,im.crop(box)))
    result.sort(key=lambda x:x[0][0]);require(result[0][0][2]<result[1][0][0],'EAR_PAIR_SEPARATION');return [p[1] for p in result]


def math_ceil(value):return __import__('math').ceil(value)


def artifact(root,state):
    from .generation import runtime_path
    data={'base_output':state['ear_base_output'],'base_manifest_sha256':state['ear_base_manifest_sha256'],'jobs':{}}
    for part,job in state['ear_jobs'].items():
        folder=runtime_path(root,'runtime/work/M04/generation/jobs/'+job);r=json.loads((folder/'report.json').read_text(encoding='utf-8'));require(r['status']=='GENERATED_AWAITING_MANUAL_REVIEW' and r.get('ear_request_id')==state['ear_requests'][part],'EAR_JOB_BINDING')
        data['jobs'][part]={'id':job,'request':r['ear_request_id'],'report_sha256':digest(folder/'report.json'),'image_sha256':digest(folder/'image.png')}
    identity=hashlib.sha256(canonical(data)).hexdigest();path=private_path(root,'runtime/work/M08/ear-artifacts/'+identity+'.json');path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():path.write_bytes(canonical(data)+b'\n')
    return identity


def compute(root,identity,inspection=None):
    require(re.fullmatch('[a-f0-9]{64}',identity or ''),'EAR_ARTIFACT_ID');path=private_path(root,'runtime/work/M08/ear-artifacts/'+identity+'.json');data=json.loads(path.read_text(encoding='utf-8'));require(hashlib.sha256(canonical(data)).hexdigest()==identity,'EAR_ARTIFACT_CHANGED');source=private_path(root,data['base_output']);require(digest(source/'export/bundle/build-manifest.json')==data['base_manifest_sha256'],'EAR_BASE_CHANGED');verify_bundle(source/'export/bundle')
    if data.get('source_kind')=='STANDARD_REFERENCE_EARS':
        from .standard_ears import compute as standard_compute
        return standard_compute(root,identity,data,inspection)
    base_fit=json.loads((source/'export/bundle/hair-fit.json').read_text(encoding='utf-8'));head,hi=target_head(root);layout=copy.deepcopy(base_fit['layout']);images={};measure={};q=2.0;span=600;plate_size=1200;plate_top=430;plate_left=-300
    for part in ('HAIR_FRONT','HAIR_BACK'):
        with Image.open(source/'raw'/f'{part}.png') as im:base,_=prepare_texture(im,im.size,'hair')
        require(digest(source/'raw'/f'{part}.png')==base_fit['raw_sha256'][part],'EAR_BASE_RAW_CHANGED');front=part.endswith('FRONT')
        a,_=region(base,'base',layout['front_width' if front else 'back_width'],layout['top'] if front else layout['back_top'],face=front,anchor_x=layout.get('front_anchor_x' if front else 'back_anchor_x'),center_x=layout.get('front_center_x' if front else 'back_center_x',0))
        # Expand if long strands require it; no clipping or target-head mask.
        left=min(plate_left,-a['y']-a['width']/2-15);top=max(plate_top,a['x']+a['height']/2+15);right=max(300,-a['y']+a['width']/2+15);bottom=min(-170,a['x']-a['height']/2-15)
        q=min(2.,1100/max(right-left,top-bottom));canvas=Image.new('RGBA',(math_ceil((right-left)*q),math_ceil((top-bottom)*q)));ear_canvas=Image.new('RGBA',canvas.size);roots=[];ear_masks=[]
        if part in data['jobs']:
            job=data['jobs'][part];folder=private_path(root,'runtime/work/M04/generation/jobs/'+job['id']);require(digest(folder/'report.json')==job['report_sha256'] and digest(folder/'image.png')==job['image_sha256'],'EAR_JOB_CHANGED');req=load_request(root,job['request']);require(req['base_output']==data['base_output'] and req['part']==part,'EAR_JOB_BASE_BINDING')
            with Image.open(folder/'image.png') as raw:ears=pieces(raw)
            k=head['height']*.12/max(e.height for e in ears)
            for i,(ear,(wx,wy)) in enumerate(zip(ears,base_fit['metrics']['shared_ear_targets']['points'])):
                image=ear.resize((max(1,round(ear.width*k*q)),max(1,round(ear.height*k*q))),Image.Resampling.LANCZOS)
                x=round((wx-left)*q)-(image.width if i==0 else 0);y=round((top-wy)*q-image.height/2);ear_canvas.alpha_composite(image,(x,y));roots.append([wx,wy]);one=Image.new('RGBA',canvas.size);one.alpha_composite(image,(x,y));ear_masks.append(one.getchannel('A'))
        scaled=base.resize((max(1,round(a['width']*q)),max(1,round(a['height']*q))),Image.Resampling.LANCZOS);canvas.alpha_composite(ear_canvas);canvas.alpha_composite(scaled,(round((-a['y']-a['width']/2-left)*q),round((top-a['x']-a['height']/2)*q)))
        norm,meta=prepare_texture(canvas,canvas.size,'hair');cut=meta['main_alpha_bbox'];box=norm.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox();require(norm.width<=1404 and norm.height<=1404,'EAR_PLATE_SIZE')
        width=(box[2]-box[0])/q;worldtop=top-(cut[1]+box[1]-2)/q;anchor=-left*q-cut[0]+2
        layout.update({('front_width' if front else 'back_width'):width,('top' if front else 'back_top'):worldtop,('front_anchor_x' if front else 'back_anchor_x'):anchor,('front_center_x' if front else 'back_center_x'):0})
        images[part]=norm;visible=Image.new('L',canvas.size)
        from PIL import ImageChops
        mask=Image.new('RGBA',canvas.size);mask.alpha_composite(scaled,(round((-a['y']-a['width']/2-left)*q),round((top-a['x']-a['height']/2)*q)));visible=ImageChops.multiply(ear_canvas.getchannel('A'),ImageChops.invert(mask.getchannel('A')))
        if inspection is not None:
            qa=Image.new('RGBA',canvas.size,'#edf1f3')
            with Image.open(hi) as original:head_sprite=original.convert('RGBA').resize((round(head['width']*q),round(head['height']*q)),Image.Resampling.LANCZOS)
            qa.alpha_composite(head_sprite,(round((-head['width']/2-left)*q),round((top-head['x']-head['height']/2)*q)));qa.alpha_composite(ear_canvas)
            faded=mask.copy();faded.putalpha(faded.getchannel('A').point(lambda a:round(a*.18)));qa.alpha_composite(faded)
            inspection[part]=qa
        measure[part]={'roots_head_local':roots,'visible_ear_pixels':sum(v>96 for v in visible.getdata()),'hair_base_sha256':base_fit['raw_sha256'][part],'head_units_per_pixel':1/q,'hair_geometry_frozen':True,'both_ears_generated':bool(roots)}
        if base_fit['revision']=='head-alpha-fit-007':
            per=[]
            for i,ear_mask in enumerate(ear_masks):
                total=sum(v>96 for v in ear_mask.getdata());seen=sum(v>96 for v in ImageChops.multiply(ear_mask,ImageChops.invert(mask.getchannel('A'))).getdata())
                per.append({'side':'left' if i==0 else 'right','total_pixels':total,'visible_pixels':seen,'visible_fraction':round(seen/max(1,total),6)})
            measure[part]['per_ear']=per
    from .hair_stages import bounds
    final_bounds={p:bounds(images[p],layout,p,head) for p in images}
    fit=copy.deepcopy(base_fit);fit['layout']=layout;fit['metrics']['height_alignment'].update(front=final_bounds['HAIR_FRONT'],back=final_bounds['HAIR_BACK'],height_difference_fraction=round(abs(final_bounds['HAIR_FRONT']['head_hair_height']-final_bounds['HAIR_BACK']['head_hair_height'])/final_bounds['HAIR_FRONT']['head_hair_height'],6));fit['ear_pass']={'artifact':identity,'measurements':measure,'stage':'BOTH_EARS' if len(data['jobs'])==2 else 'FRONT_EARS','base_fit_id':base_fit['fit_id']};fit['metrics']['ear_stage']=fit['ear_pass']['stage'];fit.pop('fit_id',None);fit['fit_id']=hashlib.sha256(canonical(fit)).hexdigest();return images,layout,fit


def render_ear_layers(root,identity,destination):
    from PIL import ImageOps
    views={};_,_,fit=compute(root,identity,inspection=views);sheet=Image.new('RGBA',(1040,690),'#edf1f3');draw=ImageDraw.Draw(sheet)
    draw.text((15,12),'EAR LAYER INSPECTION ONLY: hair is faded here, never in the exported sprite.',fill='black')
    draw.text((15,34),'Check BOTH small ear roots against the head; final visibility must be judged on opaque Runtime images.',fill='black')
    for i,part in enumerate(('HAIR_FRONT','HAIR_BACK')):
        thumb=ImageOps.contain(views[part],(500,580));sheet.alpha_composite(thumb,(i*520+(520-thumb.width)//2,70));draw.text((i*520+20,660),part+' / '+fit['ear_pass']['stage'],fill='black')
    sheet.save(destination)
