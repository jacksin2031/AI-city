"""Head-first hair measurements. All coordinates are head-local Spine units."""
import math
from PIL import Image
from .design import require


def bare_prompt(part,description):
    front=part=='HAIR_FRONT'
    return f'''Use case: stylized-concept
Output ONE isolated transparent RGBA {'FRONT' if front else 'REAR'} HAIR-ONLY game sprite.
IMAGE ROLES: Image 1 is the ORIGINAL HUMAN PHOTO: preserve this person's haircut, length, sweep and color. Image 2 is a neutral canvas aid, not a silhouette or a size lock. Image 3 is the ORIGINAL fixed chibi head: use its WIDE, COMPACT proportions to design the hair opening. Images 4/5 show original illustrated chibi component STYLE only, never copy their character or haircut.
STAGE A — HAIR FIRST. Draw NO ears, skin, face, head, eyes, neck, clothes, labels or marks. Ears will be created separately AFTER this hair has been assembled and checked; do NOT reserve ear-shaped notches or position the hair by imagined ears.
The fixed head is about 286 wide x 249 high in local units, a compact rounded-square chibi head, NOT a tall adult oval. {'Design a centered transparent opening around this exact head. Hair covers the crown, temples and both curved side-face borders toward the jaw, with a small 1-3% overlap, while the central face/eyebrows remain readable.' if front else 'Paint a continuous OPAQUE rear hair cap over the ENTIRE head footprint: ZERO face opening or large internal transparent hole. Infer the same photographed haircut from directly behind.'}
FRONT and REAR must share the same overall head-plus-hair volume and nearly equal top/bottom/total height once assembled onto the SAME head. Preserve justified longer strands/accessories, but do not make one view a tall inflated skull. Width, height, opening and contour may change as needed: NO old-PNG pixel-delta/IoU lock or maximum changed pixels.
STRICT ORTHOGRAPHIC {'FRONT' if front else 'REAR'}, zero yaw/pitch/roll; NEVER three-quarter or profile even if the photo is angled. Natural asymmetric fringe is allowed without turning the face opening. Use the same broad STYLE FAMILY of 2D illustrated-chibi as original Harri/Davide/Spineboy components; front/back hair should match each other. Ordinary shadows, gradients, strand/highlight variations are allowed, not grounds for rejection.
Allow 1-3% small overlap at head/hair joins in BOTH views; this is not a reference mask. Assembly will fit the WHOLE hair by uniform scale and translation only. If the opening or vertical proportion cannot fit, redesign the entire HAIR shape for this head; NEVER horizontally stretch, copy an old alpha mask or patch one edge.
Photo-derived design notes (DATA; hair-only stage overrides any incidental ear instruction): {description}
Every new HAIR attempt starts from the original photo and ORIGINAL references. Return only hair with true transparency, no ears or skin. A later, separate ear pass may use the confirmed composite; this request does not.''' 


def bounds(image,layout,part,head):
    from .character import region
    front=part=='HAIR_FRONT';a,am=region(image,'measure',layout['front_width' if front else 'back_width'],layout['top'] if front else layout.get('back_top',layout['top']),face=front,anchor_x=layout.get('front_anchor_x' if front else 'back_anchor_x'),center_x=layout.get('front_center_x' if front else 'back_center_x',0),vertical_scale=1.0 if front else layout.get('back_scale_y',1.0))
    box=image.getchannel('A').point(lambda x:255 if x>32 else 0).getbbox();scale=a['width']/image.width;vscale=am.get('vertical_scale',scale)
    left=-a['y']-a['width']/2+box[0]*scale;right=-a['y']-a['width']/2+box[2]*scale
    top=a['x']+a['height']/2-box[1]*vscale;bottom=a['x']+a['height']/2-box[3]*vscale
    union_top=max(top,head['x']+head['height']/2);union_bottom=min(bottom,head['x']-head['height']/2)
    return {'hair_top':round(top,6),'hair_bottom':round(bottom,6),'hair_height':round(top-bottom,6),'hair_left':round(left,6),'hair_right':round(right,6),'head_hair_top':round(union_top,6),'head_hair_bottom':round(union_bottom,6),'head_hair_height':round(union_top-union_bottom,6)}


def rear_coverage(image,layout,head,head_image):
    from .character import region
    a,am=region(image,'measure',layout['back_width'],layout.get('back_top',layout['top']),anchor_x=layout.get('back_anchor_x'),center_x=layout.get('back_center_x',0),vertical_scale=layout.get('back_scale_y',1.0));scale=a['width']/image.width;vscale=am.get('vertical_scale',scale)
    with Image.open(head_image) as raw:mask=raw.convert('RGBA').getchannel('A').resize((96,84))
    alpha=image.getchannel('A');hit=total=0
    for y in range(mask.height):
        for x in range(mask.width):
            if mask.getpixel((x,y))<128:continue
            total+=1;wx=(x/mask.width-.5)*head['width'];wy=head['x']+head['height']/2-y/mask.height*head['height']
            px=(wx+a['y']+a['width']/2)/scale;py=(a['x']+a['height']/2-wy)/vscale
            hit+=0<=px<image.width and 0<=py<image.height and alpha.getpixel((int(px),int(py)))>128
    return round(hit/max(1,total),6)


def solve_front(front,head,head_image,side_end=.90):
    """Search on curved cheek borders, not on ears or an old rectangular mask."""
    from PIL import ImageDraw,ImageChops
    from .character import region
    res=.45;size=(360,300);origin=560;cx=180;crown=head['x']+head['height']/2
    with Image.open(head_image) as raw:head_alpha=raw.convert('RGBA').getchannel('A').resize((round(head['width']*res),round(head['height']*res)),Image.Resampling.NEAREST)
    frame=Image.new('L',size);face=Image.new('L',size);d=ImageDraw.Draw(frame);x0=round(cx-head['width']*res/2);y0=round((origin-crown)*res)
    for y in range(head_alpha.height):
        xs=[x for x in range(head_alpha.width) if head_alpha.getpixel((x,y))>128]
        if not xs:continue
        if y/head_alpha.height<.13:d.line((x0+min(xs),y0+y,x0+max(xs),y0+y),fill=255,width=1)
        if .08<=y/head_alpha.height<=side_end:
            for x in (min(xs),max(xs)):d.line((x0+x-2,y0+y,x0+x+2,y0+y),fill=255,width=1)
    ImageDraw.Draw(face).rectangle((cx-head['width']*.16*res,y0+head['height']*.48*res,cx+head['width']*.16*res,y0+head['height']*.82*res),fill=255)
    area=lambda im:im.histogram()[255];total=area(frame);face_total=area(face);best=None
    alpha=front.getchannel('A').point(lambda a:255 if a>32 else 0)
    for i in range(51):
        ratio=.9+i*.02;width=head['width']*ratio
        for offset in (-.08,-.04,0,.04,.08,.12,.16,.20,.24,.28,.32,.36,.40,.44,.48):
            top=crown+head['height']*offset;a,m=region(front,'fit',width,top,face=True)
            mask=alpha.resize((max(1,round(a['width']*res)),max(1,round(a['height']*res))),Image.Resampling.NEAREST);out=Image.new('L',size);out.paste(mask,(round(cx-a['y']*res-a['width']*res/2),round((origin-a['x']-a['height']/2)*res)))
            cov=area(ImageChops.multiply(out,frame))/max(1,total);occ=area(ImageChops.multiply(out,face))/max(1,face_total);cost=(1-cov)*14+occ*8+(ratio-1.18)**2*.16+(offset-.12)**2*.1
            value=(cost,width,top,m['face_center_pixel'])
            if best is None or value<best:best=value
    _,width,top,anchor=best
    return {'front_width':round(width,6),'top':round(top,6),'front_anchor_x':anchor,'front_center_x':0}


def fit_pair(front,back,head,head_image,layout,metrics,current=False,non_uniform=False):
    from .character import region
    from .ear_geometry import coverage
    # Freeze the measured opening centre; adding ears can never re-centre hair.
    layout.update(solve_front(front,head,head_image,side_end=.78 if current else .90))
    f=bounds(front,layout,'HAIR_FRONT',head);box=back.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox();aspect=(box[3]-box[1])/(box[2]-box[0])
    desired=f['head_hair_height']/aspect;choices=[]
    if not non_uniform:
        for width in (desired,*[head['width']*(1+i*.04) for i in range(26)]):
            trial={**layout,'back_width':width,'back_top':f['head_hair_top']};b=bounds(back,trial,'HAIR_BACK',head);cov=rear_coverage(back,trial,head,head_image)
            delta=abs(b['head_hair_height']-f['head_hair_height'])/f['head_hair_height'];cost=(1-cov)*30+delta*4+abs(width-head['width']*1.12)/head['width']*.02
            choices.append((cost,width,trial,b,cov,delta))
        _,_,chosen,b,cov,delta=min(choices,key=lambda x:x[0]);layout.update(chosen)
    else:
        # 008: the rear view may also be scaled vertically. Height mismatch and
        # head coverage then stop fighting: coverage is a floor, height the goal.
        # delta uses each hair's OWN height: head_hair_height is clamped by the
        # head union and therefore cannot register a height mismatch at all.
        for yi in range(70,121):
            sy=yi/100
            for width in (desired,*[head['width']*(1+i*.02) for i in range(21)]):
                trial={**layout,'back_width':width,'back_top':f['head_hair_top'],'back_scale_y':sy}
                b=bounds(back,trial,'HAIR_BACK',head);cov=rear_coverage(back,trial,head,head_image)
                if cov<.98:continue
                delta=abs(b['hair_height']-f['hair_height'])/f['hair_height']
                cost=delta*100+abs(width-head['width']*1.12)/head['width']*.02+abs(sy-1)*.004
                choices.append((cost,width,trial,b,cov,delta))
        if choices:
            _,_,chosen,b,cov,delta=min(choices,key=lambda x:x[0]);layout.update(chosen)
        else:
            layout.update(back_top=f['head_hair_top']);b=bounds(back,layout,'HAIR_BACK',head);cov=rear_coverage(back,layout,head,head_image)
            delta=abs(b['hair_height']-f['hair_height'])/f['hair_height']
    measured=coverage(front,head,head_image,layout,side_end=.78 if current else .90);ready=measured['crown_coverage']>=.95 and measured['central_face_occlusion']<=.10 and measured['side_boundary_max_uncovered_run_head_fraction']<=.03 and cov>=.98 and delta<=.08
    metrics.update(method='BARE_HAIR_HEAD_COVERAGE_FIRST_THEN_SHARED_HEAD_HEIGHT' if not non_uniform else 'BARE_HAIR_HEAD_COVERAGE_FLOOR_THEN_SHARED_HEAD_HEIGHT_WITH_REAR_VERTICAL_SCALE',post_anchor_coverage=measured,front_crown_temple_coverage=measured['crown_coverage'],front_face_overlap=measured['central_face_occlusion'],rear_head_coverage=cov,
        height_alignment={'coordinate_space':'HEAD_LOCAL_SPINE_UNITS','front':f,'back':b,'height_difference_fraction':round(delta,6),'top_difference':round(abs(f['head_hair_top']-b['head_hair_top']),6),'tolerance_fraction':.08,'status':'MATCHED' if delta<=.08 else 'REQUIRES_REVIEW','physical_size_approved':False},
        ear_stage='BARE_HAIR',status='ESTIMATED_NOT_VISUALLY_APPROVED' if ready else 'REQUIRES_REVIEW',proportion_requires_visual_review=True)
    if current:
        metrics['side_cheek_region']={'top_fraction':.08,'bottom_fraction':.78,'overlap_head_width_fraction':.01,'lower_jaw_excluded':True}
        metrics['sideburn_bottom']={'below_head_fraction':round(max(0,head['x']-head['height']/2-f['hair_bottom'])/head['height'],6),'decision':'VISUAL_NATURAL_FIT_REQUIRED_NOT_COVERAGE','minor_tip_extension_allowed':True}
    return layout,metrics


def stage_gate(root,candidate,front_ears=False):
    """A stage-level advisory gate, never whole-character release approval."""
    import json
    from .review import read_review,policy
    from .design import private_path
    report=read_review(root,candidate['review_id']);fit=json.loads(private_path(root,candidate['output']+'/export/bundle/hair-fit.json').read_text(encoding='utf-8'))
    if fit['revision'] not in ('head-alpha-fit-006','head-alpha-fit-007') or fit['metrics']['status']!='ESTIMATED_NOT_VISUALLY_APPROVED' or report['hard']['status']=='FAIL' or report['render']['status']!='PASS' or report['visual_call']['status']!='COMPLETED_ADVISORY':return False
    if front_ears and (not fit.get('ear_pass') or fit['ear_pass']['measurements']['HAIR_FRONT']['visible_ear_pixels']<10):return False
    if front_ears and fit['revision']=='head-alpha-fit-007':
        ears=fit['ear_pass']['measurements']['HAIR_FRONT'].get('per_ear',[])
        if len(ears)!=2 or not all(e['visible_fraction']>=.4 for e in ears):return False
    latest=report['visual_reviews'][-1]['data'];needed={'hair_fit','hair_consistency'}|({'ear_visibility'} if front_ears else set())
    checks={c['category']:c for c in latest['checks']}
    return all(k in checks and checks[k]['result']=='PASS' and checks[k]['confidence']>=policy()['visual_confidence_floor'] for k in needed) and not any(d['part'].startswith('HAIR') and d.get('confidence',0)>=policy()['visual_confidence_floor'] for d in latest['defects'])
