"""Measured fixed-head ear roots and deterministic painted-ear observations.

Only geometry/measurement: never paints, stretches or masks delivered PNGs.
"""
import math,statistics,json
from collections import Counter
from PIL import Image
from .design import require,digest


def target_roots(source,head,image):
    data=json.loads(source.read_text(encoding='utf-8'));bones=data['bones']
    skin=next(s for s in data['skins'] if s['name']=='ai-city-original-template')['attachments']
    hindex=next(i for i,b in enumerate(bones) if b['name']=='head-base');heights=[]
    for slot in ('ear-l','ear-r'):
        mesh=skin[slot]['ear'];vertices=mesh['vertices'];offset=0;points=[]
        for _ in range(len(mesh['uvs'])//2):
            count=int(vertices[offset]);offset+=1;xsum=ysum=weights=0
            for _ in range(count):
                index,x,y,weight=vertices[offset:offset+4];offset+=4;bone=bones[int(index)]
                if int(index)!=hindex:
                    require(bone.get('parent')=='head-base' and not bone.get('shearX',0) and not bone.get('shearY',0),'EAR_TARGET_BONE')
                    angle=math.radians(bone.get('rotation',0));xx=x*bone.get('scaleX',1);yy=y*bone.get('scaleY',1)
                    x=xx*math.cos(angle)-yy*math.sin(angle)+bone.get('x',0);y=xx*math.sin(angle)+yy*math.cos(angle)+bone.get('y',0)
                xsum+=x*weight;ysum+=y*weight;weights+=weight
            require(abs(weights-1)<.01,'EAR_TARGET_WEIGHTS');points.append((xsum,ysum))
        heights.append(sum(x for x,y in points)/len(points))
    level=sum(heights)/2;crown=head['x']+head['height']/2
    with Image.open(image) as raw:
        alpha=raw.convert('RGBA').getchannel('A');row=round((crown-level)/head['height']*raw.height)
        xs=[x for x in range(raw.width) if alpha.getpixel((x,max(0,min(raw.height-1,row))))>=128]
        require(bool(xs),'EAR_TARGET_HEAD_ROW');margin=head['width']*.01
        left=(min(xs)/raw.width-.5)*head['width']+margin;right=((max(xs)+1)/raw.width-.5)*head['width']-margin
    return {'points':[[round(left,6),round(level,6)],[round(right,6),round(level,6)]],
            'method':'ORIGINAL_WEIGHTED_EAR_LEVEL_PROJECTED_TO_FIXED_HEAD_ALPHA_BOUNDARY_WITH_1_PERCENT_ROOT_OVERLAP',
            'source_sha256':digest(source),'head_image_sha256':digest(image)}


def skin_color(head_image):
    with Image.open(head_image) as raw:
        counts=Counter(p[:3] for p in raw.convert('RGBA').getdata() if p[3]>240 and p[0]>180 and p[0]>p[1]>p[2])
    require(bool(counts),'EAR_SKIN_PALETTE');return counts.most_common(1)[0][0]


def observe(image,head_image):
    """Find bilateral skin islands; ambiguity stays UNKNOWN, never a fake anchor."""
    small=image.convert('RGBA').copy();small.thumbnail((640,640),Image.Resampling.NEAREST);w,h=small.size
    color=skin_color(head_image);pixels=small.load();mask=set()
    for y in range(h):
        for x in range(w):
            r,g,b,a=pixels[x,y]
            if a>=160 and r>180 and r-g>8 and g>=b and sum((v-c)**2 for v,c in zip((r,g,b),color))<=65**2:mask.add((x,y))
    pending=set(mask);components=[]
    while pending:
        p=pending.pop();stack=[p];points=[]
        while stack:
            x,y=stack.pop();points.append((x,y))
            for q in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if q in pending:pending.remove(q);stack.append(q)
        if len(points)<8:continue
        xs=[x for x,y in points];ys=[y for x,y in points];bw=max(xs)-min(xs)+1;bh=max(ys)-min(ys)+1
        if len(points)>w*h*.08 or not .15<=bw/bh<=4:continue
        components.append((points,min(xs),max(xs),min(ys),max(ys)))
    pairs=[]
    for i,a in enumerate(components):
        for b in components[i+1:]:
            left,right=sorted((a,b),key=lambda c:c[1]);lp,l0,l1,ly0,ly1=left;rp,r0,r1,ry0,ry1=right
            span=(r0+r1-l0-l1)/2;dy=abs((ly0+ly1-ry0-ry1)/2)
            if span<w*.16 or dy>span*.12 or max(len(lp),len(rp))>min(len(lp),len(rp))*4:continue
            if not h*.12<(ly0+ly1+ry0+ry1)/4<h*.94:continue
            # Roots are the INNER skin edge; large original ears are not targets.
            edge_l=[(x,y) for x,y in lp if x>=l1-max(1,(l1-l0)*.18)]
            edge_r=[(x,y) for x,y in rp if x<=r0+max(1,(r1-r0)*.18)]
            roots=[(statistics.mean(x for x,y in e),statistics.median(y for x,y in e)) for e in (edge_l,edge_r)]
            score=dy/max(1,span)+abs(math.log(len(lp)/len(rp)))*.05
            pairs.append((score,roots))
    if not pairs:return {'status':'UNLOCATABLE','points':[],'skin_rgb':list(color),'method':'BILATERAL_PAINTED_SKIN_ISLAND_INNER_EDGE'}
    pairs.sort();ambiguous=len(pairs)>1 and pairs[1][0]-pairs[0][0]<.04
    roots=[[round(x*image.width/w,6),round(y*image.height/h,6)] for x,y in pairs[0][1]]
    return {'status':'AMBIGUOUS' if ambiguous else 'OBSERVED','points':roots,'skin_rgb':list(color),'method':'BILATERAL_PAINTED_SKIN_ISLAND_INNER_EDGE'}


def fit_front(front,head,head_image,targets):
    observation=observe(front,head_image)
    if observation['status']!='OBSERVED':return None,{'observation':observation,'targets':targets,'status':'REQUIRES_REVIEW'}
    a,b=observation['points'];ta,tb=targets['points'];span=b[0]-a[0];scale=(tb[0]-ta[0])/span
    require(scale>0 and math.isfinite(scale),'EAR_FIT_SCALE')
    anchor=(a[0]+b[0])/2;cy=(a[1]+b[1])/2;level=(ta[1]+tb[1])/2;center=(ta[0]+tb[0])/2
    box=front.getchannel('A').point(lambda x:255 if x>32 else 0).getbbox();require(box is not None,'EAR_FIT_ALPHA')
    top=level+(cy-box[1])*scale
    layout={'front_width':round((box[2]-box[0])*scale,6),'top':round(top,6),'front_anchor_x':anchor,'front_center_x':center}
    transformed=[[center+(x-anchor)*scale,level+(cy-y)*scale] for x,y in (a,b)]
    error=max(math.dist(p,t) for p,t in zip(transformed,(ta,tb)))/head['width']
    return layout,{'observation':observation,'targets':targets,'transformed_roots':transformed,'root_error_head_fraction':round(error,6),
                   'status':'ALIGNED' if error<=.015 else 'MISALIGNED','uniform_scale':scale,'rotation':0,'nonuniform_scale':False}


def coverage(front,head,head_image,layout,side_end=.90):
    """Pointwise curved cheek boundary checks, excluding the intended chin edge."""
    from .character import region
    attachment,_=region(front,'measure',layout['front_width'],layout['top'],face=True,anchor_x=layout.get('front_anchor_x'),center_x=layout.get('front_center_x',0))
    scale=attachment['width']/front.width;anchor=layout.get('front_anchor_x',front.width/2);center=layout.get('front_center_x',0)
    alpha=front.getchannel('A');front_y0=alpha.point(lambda a:255 if a>32 else 0).getbbox()[1];crown=head['x']+head['height']/2
    with Image.open(head_image) as raw:
        target=raw.convert('RGBA').getchannel('A');tw,th=raw.size;misses=[];crown_total=crown_covered=0;face_count=face_covered=0
        for row in range(th):
            xs=[x for x in range(tw) if target.getpixel((x,row))>=128]
            if not xs:continue
            height=crown-row/th*head['height'];py=(layout['top']-height)/scale+front_y0
            def hit(x):
                world=(x/tw-.5)*head['width'];px=(world-center)/scale+anchor
                return 0<=px<front.width and 0<=py<front.height and alpha.getpixel((int(px),int(py)))>128
            if .08<=row/th<=side_end:
                # Three points across each curved boundary test a real overlap.
                bad=any(not hit(edge+offset) for edge,sign in ((min(xs),1),(max(xs),-1)) for offset in (-tw*.01,0,tw*.01))
                misses.append(bad)
            if row/th<.13:
                for x in xs[::max(1,tw//80)]:crown_total+=1;crown_covered+=hit(x)
            if .48<=row/th<=.82:
                for x in range(round(tw*.34),round(tw*.66),max(1,tw//40)):face_count+=1;face_covered+=hit(x)
    runs=maximum=0
    for missing in misses:runs=runs+1 if missing else 0;maximum=max(maximum,runs)
    return {'side_boundary_uncovered_fraction':round(sum(misses)/max(1,len(misses)),6),
            'side_boundary_max_uncovered_run_head_fraction':round(maximum/th,6),'crown_coverage':round(crown_covered/max(1,crown_total),6),
            'central_face_occlusion':round(face_covered/max(1,face_count),6),'measurement_only_no_png_edits':True}


def guide(source,head,image,destination):
    """Original-only anatomical reference. No generated part enters this image."""
    from PIL import ImageDraw,ImageOps
    targets=target_roots(source,head,image);sheet=Image.new('RGBA',(640,540),(235,235,235,255));draw=ImageDraw.Draw(sheet)
    with Image.open(image) as raw:
        thumb=ImageOps.contain(raw.convert('RGBA'),(360,330));x=(640-thumb.width)//2;y=80;sheet.alpha_composite(thumb,(x,y))
    draw.text((18,12),'ORIGINAL FIXED HEAD: EAR ROOTS ARE POSITION ANCHORS',fill='black')
    draw.text((18,35),'Cyan crosses = connection points, NOT large ear silhouettes',fill='black')
    crown=head['x']+head['height']/2
    for i,(horizontal,vertical) in enumerate(targets['points']):
        px=x+(horizontal/head['width']+.5)*thumb.width;py=y+(crown-vertical)/head['height']*thumb.height
        draw.line((px-9,py,px+9,py),fill='#008a9a',width=3);draw.line((px,py-9,px,py+9),fill='#008a9a',width=3)
        draw.text((px-20,py+14),'ROOT '+str(i+1),fill='#00616a')
    draw.text((18,440),'FRONT: small ears here; face stays transparent; cover side frame.',fill='black')
    draw.text((18,465),'REAR: entire head target covered by opaque HAIR. ZERO face holes.',fill='black')
    draw.text((18,490),'Guide only. Output NO crosses, text, head skin or reference pixels.',fill='black')
    sheet.save(destination);return targets


def review_overlay(front,head,head_image,fit,destination):
    from PIL import ImageDraw
    from .character import region
    scale=1.6;cx=500;origin=720;canvas=Image.new('RGBA',(1000,920),'#edf1f3');draw=ImageDraw.Draw(canvas);layout=fit['layout']
    with Image.open(head_image) as raw:
        raw=raw.convert('RGBA');resized=raw.resize((round(head['width']*scale),round(head['height']*scale)),Image.Resampling.LANCZOS)
        canvas.alpha_composite(resized,(round(cx-head['width']*scale/2),round(origin-(head['x']+head['height']/2)*scale)))
    a,_=region(front,'review',layout['front_width'],layout['top'],face=True,anchor_x=layout.get('front_anchor_x'),center_x=layout.get('front_center_x',0))
    resized=front.resize((max(1,round(a['width']*scale)),max(1,round(a['height']*scale))),Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized,(round(cx-a['y']*scale-a['width']*scale/2),round(origin-a['x']*scale-a['height']*scale/2)))
    ear=fit['metrics']['ear_alignment']
    for points,color in ((ear['targets']['points'],'#008a9a'),(ear.get('transformed_roots',[]),'#cc0077')):
        for x,y in points:
            px,py=cx+x*scale,origin-y*scale;draw.ellipse((px-6,py-6,px+6,py+6),outline=color,width=3)
    draw.text((18,15),'REVIEW ONLY: cyan = fixed-head target; magenta = detected painted ear root',fill='black')
    draw.text((18,36),'Check actual ears and cheek outline visually. Detection is a hypothesis, not proof.',fill='black')
    draw.text((18,57),'No PNG edits or reference silhouette mask. Do not feed this review image to generation.',fill='black')
    canvas.save(destination)
