"""Derived head-only inspection for incomplete characters. Never model or approval."""
import json,hashlib
from PIL import Image,ImageDraw
from .design import require,private_path,load_design,digest
from .pipeline_store import read
from .character_flow import source_profile,resolve_bindings
from .hair_fit import make,target_head
from .character import region
from .texture import prepare_texture
from .assembly import canonical


def diagnostic(root,identity):
    s=read(root,identity)
    if s.get('versions',{}).get('workflow') not in ('photo-to-skin-shared-013','photo-to-skin-shared-014') or not s.get('design_id') or not all(p in s['completed_parts'] for p in ('HAIR_FRONT','HAIR_BACK')):return None
    record=load_design(root,s['design_id'])
    if s['versions']['workflow']=='photo-to-skin-shared-013':
        # An archived diagnostic is not a new admission. Verify its SAVED request,
        # references and returned PNG instead of regenerating today's prompt.
        resolved={}
        for part in ('HAIR_FRONT','HAIR_BACK'):
            job=private_path(root,'runtime/work/M04/generation/jobs/'+s['jobs'][part]);r=json.loads((job/'report.json').read_text(encoding='utf-8'));image=job/'image.png'
            require(r.get('flow_id')==identity and r.get('part')==part and r.get('design_id')==s['design_id'] and r.get('status')=='GENERATED_AWAITING_MANUAL_REVIEW','HEAD_ARCHIVE_JOB_BINDING')
            require(digest(image)==r['image_sha256'] and digest(job/'prompt.txt')==r['prompt_sha256'],'HEAD_ARCHIVE_BYTES_CHANGED')
            for ref in r['references']:
                require(__import__('pathlib').Path(ref['file']).name==ref['file'] and digest(job/'references'/ref['file'])==ref['sha256'],'HEAD_ARCHIVE_REFERENCE_CHANGED')
            resolved[part]={'sha256':r['image_sha256'],'content':image.read_bytes()}
    else:
        source,atlas,profile=source_profile(root);resolved=resolve_bindings(root,record,{p:{'job_id':s['jobs'][p]} for p in ('HAIR_FRONT','HAIR_BACK')},profile,head_only=True)
    key=hashlib.sha256(canonical({'flow':identity,'photo':record['design']['photo']['sha256'],'raw':{p:r['sha256'] for p,r in resolved.items()},'fit_revision':s['versions']['fit']})).hexdigest();folder=private_path(root,'runtime/work/M08/head-diagnostics/'+key);folder.mkdir(parents=True,exist_ok=True);meta=folder/'manifest.json';sheet=folder/'head.png'
    if meta.is_file():
        value=json.loads(meta.read_text(encoding='utf-8'));require(value['source_key']==key and digest(sheet)==value['sha256'],'HEAD_DIAGNOSTIC_CHANGED');return value,sheet
    fit=make(root,record,resolved,revision=s['versions']['fit']);head,hi=target_head(root);images={}
    for part,r in resolved.items():
        import io
        with Image.open(io.BytesIO(r['content'])) as im:images[part]=prepare_texture(im,im.size,'hair')[0]
    height=fit['metrics']['height_alignment'];top=max(height[p]['head_hair_top'] for p in ('front','back'))+45;bottom=min(height[p]['head_hair_bottom'] for p in ('front','back'))-35;q=min(1.2,510/(top-bottom));canvas=Image.new('RGBA',(1040,700),'#edf1f3');draw=ImageDraw.Draw(canvas);origin=95+top*q
    draw.text((15,15),'HEAD-ONLY DIAGNOSTIC. FULL CHARACTER IS NOT ASSEMBLED OR APPROVED.',fill='black');draw.text((15,37),'Same fixed head and coordinate scale in both views; cyan line is the shared EAR ROOT TARGET.',fill='black')
    for i,part in enumerate(('HAIR_FRONT','HAIR_BACK')):
        cx=260+i*520;front=part=='HAIR_FRONT';layout=fit['layout'];im=images[part];a,_=region(im,'qa',layout['front_width' if front else 'back_width'],layout['top'] if front else layout['back_top'],face=front,anchor_x=layout.get('front_anchor_x' if front else 'back_anchor_x'),center_x=0)
        with Image.open(hi) as original:fixed=original.convert('RGBA').resize((round(head['width']*q),round(head['height']*q)),Image.Resampling.LANCZOS)
        canvas.alpha_composite(fixed,(round(cx-head['width']*q/2),round(origin-(head['x']+head['height']/2)*q)))
        scaled=im.resize((max(1,round(a['width']*q)),max(1,round(a['height']*q))),Image.Resampling.LANCZOS);canvas.alpha_composite(scaled,(round(cx-a['y']*q-a['width']*q/2),round(origin-a['x']*q-a['height']*q/2)))
        y=origin-fit['metrics']['shared_ear_targets']['points'][0][1]*q;draw.line((cx-230,y,cx+230,y),fill='#008a9a',width=2);draw.text((i*520+30,665),part+' / NO EARS YET / GEOMETRY INSPECTION ONLY',fill='black')
    canvas.save(sheet);value={'source_key':key,'sha256':digest(sheet),'quality_approved':False,'stage':'HEAD_ONLY_DIAGNOSTIC_NOT_ASSEMBLED_CHARACTER','alignment':{'height':height,'ear_targets':fit['metrics']['shared_ear_targets'],'ear_stage':'BARE_HAIR','ear_measurements':None}}
    meta.write_bytes(canonical(value)+b'\n');return value,sheet
