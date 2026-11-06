"""Experimental alpha-only geometry fitting; never edits/cuts a source silhouette."""
import copy,hashlib,io,json
from PIL import Image,ImageChops,ImageDraw
from .design import ROOT,VERSIONS,require,digest
from .assembly import canonical
from .texture import prepare_texture
from .reference_assets import library_root


def target_head(root):
    from .character_flow import source_profile
    source,_,_=source_profile(root);data=json.loads(source.read_text(encoding='utf-8'))
    skin=next(s for s in data['skins'] if s['name']=='ai-city-original-template')['attachments']
    head=skin['head-base']['head-base'];require(head.get('rotation')==-90 and head.get('y',0)==0,'FIT_HEAD_GEOMETRY')
    image=library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images'/((head.get('path') or head['name'])+'.png')
    require(image.resolve().is_relative_to((library_root(ROOT)).resolve()) and image.is_file(),'FIT_HEAD_SOURCE')
    return head,image


def solve_legacy(front,back,head,head_image,side_depth=.48,coverage_margin=0):
    """Search scale/top against original head crown/temples, clear face and rear mask.

    Coordinates use the same region() and normalized PNGs as the sole assembler.
    These proxy zones cannot certify fringe style, ears or motion quality.
    """
    from .character import region
    res=.45;size=(360,300);origin=560;center=size[0]/2;w,h=head['width'],head['height'];crown=head['x']+h/2
    mask=Image.new('L',size)
    with Image.open(head_image) as im:alpha=im.convert('RGBA').getchannel('A').point(lambda a:255 if a>32 else 0)
    target_w=w*(1+coverage_margin);target_h=h*(1+coverage_margin)
    alpha=alpha.resize((round(target_w*res),round(target_h*res)),Image.Resampling.NEAREST)
    x=round(center-target_w*res/2);y=round((origin-head['x']-target_h/2)*res);mask.paste(alpha,(x,y))
    zone_w,zone_h=target_w,target_h
    crown_zone=Image.new('L',size);d=ImageDraw.Draw(crown_zone);d.rectangle((x,y,x+round(zone_w*res),y+round(zone_h*.13*res)),fill=255)
    for left,right in [(0,.13),(.87,1)]:d.rectangle((x+round(zone_w*left*res),y,x+round(zone_w*right*res),y+round(zone_h*side_depth*res)),fill=255)
    crown_zone=ImageChops.multiply(mask,crown_zone)
    fx=round(center-w*res/2);fy=round((origin-crown)*res)
    face=Image.new('L',size);ImageDraw.Draw(face).rectangle((fx+round(w*.28*res),fy+round(h*.5*res),fx+round(w*.72*res),fy+round(h*.87*res)),fill=255);face=ImageChops.multiply(mask,face)
    def area(im):return im.histogram()[255]
    def footprint(image,width,top,is_front):
        a,_=region(image,'fit',width,top,face=is_front);alpha=image.getchannel('A').point(lambda a:255 if a>32 else 0)
        alpha=alpha.resize((max(1,round(a['width']*res)),max(1,round(a['height']*res))),Image.Resampling.NEAREST)
        out=Image.new('L',size);out.paste(alpha,(round(center-a['y']*res-a['width']*res/2),round((origin-a['x']-a['height']/2)*res)));return out
    best=None
    for top in [round(crown+h*f,3) for f in (.08,.12,.16,.20,.24,.28,.32,.36,.40,.44,.48,.52,.56,.60)]:
        fronts=[]
        for ratio in [1+i*.04 for i in range(23)]:
            width=round(w*ratio,3);mask_f=footprint(front,width,top,True)
            cover=area(ImageChops.multiply(crown_zone,mask_f))/max(1,area(crown_zone));occlude=area(ImageChops.multiply(face,mask_f))/max(1,area(face))
            cost=(1-cover)*8+occlude*5+(ratio-1.2)**2*.10
            fronts.append((cost,width,cover,occlude))
        f=min(fronts)
        for ratio in [1+i*.04 for i in range(23)]:
            width=round(w*ratio,3);mask_b=footprint(back,width,top,False)
            cover=area(ImageChops.multiply(mask,mask_b))/max(1,area(mask))
            volume_delta=abs(width-f[1])/max(width,f[1]);cost=f[0]+(1-cover)*10+volume_delta*.8+(ratio-1.2)**2*.05
            value=(cost,top,f[1],width,f[2],f[3],cover,volume_delta)
            if best is None or value<best:best=value
    _,top,fw,bw,cov,occlude,backcov,delta=best
    return {'front_width':fw,'back_width':bw,'top':top},{'front_crown_temple_coverage':round(cov,6),'front_face_overlap':round(occlude,6),
        'rear_head_coverage':round(backcov,6),'front_back_width_delta':round(delta,6),
        'status':'ESTIMATED_NOT_VISUALLY_APPROVED' if cov>=.95 and occlude<=.10 and backcov>=.98 else 'REQUIRES_REVIEW',
        'method':'ALPHA_PROXY_GRID_SAME_REGION_NO_MASK_NO_PIXEL_EDITS','physical_size_approved':False}


def solve(front,back,head,head_image,front_cheeks=False,coverage_margin=0):
    """Fit the rear cap to the head independently of front accessory width/top."""
    from .character import region
    layout,metrics=solve_legacy(front,back,head,head_image,side_depth=.82 if front_cheeks else .48,coverage_margin=coverage_margin)
    res=.45;size=(360,300);origin=560;center=size[0]/2;w,h=head['width'],head['height'];crown=head['x']+h/2
    mask=Image.new('L',size)
    with Image.open(head_image) as im:alpha=im.convert('RGBA').getchannel('A').point(lambda a:255 if a>32 else 0)
    tw,th=w*(1+coverage_margin),h*(1+coverage_margin)
    mask.paste(alpha.resize((round(tw*res),round(th*res)),Image.Resampling.NEAREST),(round(center-tw*res/2),round((origin-head['x']-th/2)*res)))
    area=lambda im:im.histogram()[255]
    best=None
    for offset in (-.04,0,.04,.08,.12,.16,.20,.24,.28,.32):
        top=round(crown+h*offset,3)
        for i in range(31):
            ratio=1+i*.02;width=round(w*ratio,3);a,_=region(back,'fit',width,top)
            alpha=back.getchannel('A').point(lambda a:255 if a>32 else 0).resize((max(1,round(a['width']*res)),max(1,round(a['height']*res))),Image.Resampling.NEAREST)
            footprint=Image.new('L',size);footprint.paste(alpha,(round(center-a['y']*res-a['width']*res/2),round((origin-a['x']-a['height']/2)*res)))
            coverage=area(ImageChops.multiply(mask,footprint))/max(1,area(mask))
            # Penalize oversized rear cap, not difference from a front silhouette
            # that may include a side bun/ribbon. All PNG pixels remain intact.
            cost=(1-coverage)*30+(ratio-1.1)**2*.6+(offset-.04)**2*.2
            value=(cost,width,top,coverage)
            if best is None or value<best:best=value
    _,width,top,coverage=best;layout.update(back_width=width,back_top=top)
    metrics.update(rear_head_coverage=round(coverage,6),front_back_width_delta=round(abs(width-layout['front_width'])/max(width,layout['front_width']),6),
        rear_head_width_ratio=round(width/w,6),method='INDEPENDENT_REAR_HEAD_ALPHA_GRID_NO_FRONT_ACCESSORY_WIDTH_NO_PIXEL_EDITS')
    metrics['status']='ESTIMATED_NOT_VISUALLY_APPROVED' if metrics['front_crown_temple_coverage']>=.95 and metrics['front_face_overlap']<=.10 and coverage>=.98 else 'REQUIRES_REVIEW'
    if front_cheeks:metrics.update(method='HEAD_CROWN_SIDE_CHEEK_FIT_UNIFORM_ONLY_NO_OLD_OUTLINE_GATE',front_side_depth_fraction=.82,proportion_requires_visual_review=True)
    if coverage_margin:metrics.update(coverage_target_margin=coverage_margin,method='HEAD_OVERLAP_TARGET_3_PERCENT_UNIFORM_ONLY',margin_is_measurement_guide_not_output_mask=True)
    return layout,metrics


def make(root,record,resolved,revision=None,tip_artifacts=None):
    revision=revision or VERSIONS['workflow']['hair_fit_revision'];require(revision in ('head-alpha-fit-001','head-alpha-fit-002','head-alpha-fit-003','head-alpha-fit-004','head-alpha-fit-005','head-alpha-fit-006','head-alpha-fit-007','head-alpha-fit-008'),'FIT_REVISION')
    images=[]
    for part in ('HAIR_FRONT','HAIR_BACK'):
        with Image.open(io.BytesIO(resolved[part]['content'])) as im:normalized,_=prepare_texture(im,im.size,'hair')
        images.append(normalized)
    head,image=target_head(root)
    if revision in ('head-alpha-fit-006','head-alpha-fit-007','head-alpha-fit-008'):layout={'front_width':head['width']*1.2,'back_width':head['width']*1.2,'top':head['x']+head['height']/2};metrics={'physical_size_approved':False}
    else:layout,metrics=solve_legacy(*images,head,image) if revision=='head-alpha-fit-001' else solve(*images,head,image,front_cheeks=revision in ('head-alpha-fit-003','head-alpha-fit-004','head-alpha-fit-005'),coverage_margin=.03 if revision in ('head-alpha-fit-004','head-alpha-fit-005') else 0)
    if revision in ('head-alpha-fit-006','head-alpha-fit-007','head-alpha-fit-008'):
        from .hair_stages import fit_pair
        layout,metrics=fit_pair(*images,head,image,layout,metrics,current=revision=='head-alpha-fit-007',non_uniform=revision=='head-alpha-fit-008')
        from .ear_geometry import target_roots
        from .character_flow import source_profile
        metrics['shared_ear_targets']=target_roots(source_profile(root)[0],head,image)
    if revision=='head-alpha-fit-005':
        from .ear_geometry import target_roots,fit_front,coverage
        from .character_flow import source_profile
        targets=target_roots(source_profile(root)[0],head,image);ear_layout,ear=fit_front(images[0],head,image,targets)
        if ear_layout:layout.update(ear_layout)
        measured=coverage(images[0],head,image,layout) if ear_layout else None
        if measured:metrics.update(front_crown_temple_coverage=measured['crown_coverage'],front_face_overlap=measured['central_face_occlusion'],front_back_width_delta=round(abs(layout['front_width']-layout['back_width'])/max(layout['front_width'],layout['back_width']),6))
        metrics.update(method='EAR_ROOT_PAIR_UNIFORM_SCALE_TRANSLATION_THEN_CURVED_CHEEK_CROWN_REVIEW',ear_alignment=ear,post_anchor_coverage=measured,
                       status='ESTIMATED_NOT_VISUALLY_APPROVED' if ear['status']=='ALIGNED' and measured and measured['side_boundary_max_uncovered_run_head_fraction']<=.03 and measured['crown_coverage']>=.95 and measured['central_face_occlusion']<=.10 else 'REQUIRES_REVIEW',proportion_requires_visual_review=True)
    result={'revision':revision,'design_id':record['design_id'],'head_geometry':copy.deepcopy(head),'head_image_sha256':digest(image),
        'raw_sha256':{p:resolved[p]['sha256'] for p in ('HAIR_FRONT','HAIR_BACK')},'layout':layout,'metrics':metrics}
    if tip_artifacts:
        require(revision=='head-alpha-fit-007','TIP_FIT_REVISION')
        from .hair_tip import apply
        apply(root,result,{p:resolved[p] for p in ('HAIR_FRONT','HAIR_BACK')},tip_artifacts,head,image)
    result['fit_id']=hashlib.sha256(canonical(result)).hexdigest();return result


def validate(root,record,value,raw):
    require(isinstance(value,dict),'FIT_RECORD');check=copy.deepcopy(value);identity=check.pop('fit_id',None)
    require(identity==hashlib.sha256(canonical(check)).hexdigest(),'FIT_RECORD_CHANGED')
    resolved={p:{'content':raw[p].read_bytes(),'sha256':digest(raw[p])} for p in ('HAIR_FRONT','HAIR_BACK')}
    if value.get('ear_pass'):
        from .ear_pass import compute
        expected=compute(root,value['ear_pass']['artifact'])[2]
        require(expected==value and value['raw_sha256']=={p:r['sha256'] for p,r in resolved.items()},'FIT_EAR_PASS_CHANGED')
    else:require(make(root,record,resolved,revision=value['revision'],tip_artifacts=value.get('tip_artifacts'))==value,'FIT_INPUT_OR_ALGORITHM_CHANGED')
    return value['layout']
