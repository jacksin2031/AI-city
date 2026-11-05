"""Immutable tip-only edit references and uniform canvas registration."""
import copy,hashlib,json,re,io
from PIL import Image
from .design import require,private_path,digest
from .assembly import canonical,verify_bundle
from .texture import prepare_texture


def load(root,identity):
 require(re.fullmatch('[a-f0-9]{64}',identity or ''),'TIP_ARTIFACT_ID')
 p=private_path(root,'runtime/work/M08/hair-tip-references/'+identity+'.json');v=json.loads(p.read_text(encoding='utf-8'));require(hashlib.sha256(canonical(v)).hexdigest()==identity,'TIP_ARTIFACT_CHANGED')
 base=private_path(root,v['base_output']);require(digest(base/'export/bundle/build-manifest.json')==v['base_manifest'],'TIP_BASE_CHANGED');verify_bundle(base/'export/bundle')
 require(digest(base/'raw'/f"{v['part']}.png")==v['raw_sha256'],'TIP_RAW_CHANGED')
 for x in v['references']:require(digest(private_path(root,x['file']))==x['sha256'],'TIP_REFERENCE_CHANGED')
 return v


def prepare(root,task,part,feedback):
 if not part.startswith('HAIR') or not feedback or feedback['codes']!=['PROPORTION']:return None
 text=json.dumps(feedback['observations'],ensure_ascii=False)
 if not re.search(r'もみあげ|毛先|髪先|下端|先端|sideburn|tips?',text,re.I):return None
 from .repair_store import read
 from .review import review_dir,read_review
 state=read(root,task);review=read_review(root,state['source_review'])
 if review['render']['status']!='PASS':return None
 context=json.loads((review_dir(root,state['source_review'])/'context.json').read_text(encoding='utf-8'));output=context['character_output'];base=private_path(root,output);fit=json.loads((base/'export/bundle/hair-fit.json').read_text(encoding='utf-8'))
 if fit['revision']!='head-alpha-fit-007':return None
 folder=private_path(root,'runtime/work/M08/hair-tip-references');folder.mkdir(parents=True,exist_ok=True);guide=folder/(task+'-'+part+'-fixed.png')
 if not guide.exists():
  from .ear_pass import render_guide
  render_guide(root,output,guide,tip_only=True)
 raw=base/'raw'/f'{part}.png';v={'part':part,'design_id':state['design_id'],'base_output':output,'base_manifest':digest(base/'export/bundle/build-manifest.json'),'raw_sha256':digest(raw),
 'references':[{'role':'fixed_tip_edit_target','file':raw.relative_to(root).as_posix(),'sha256':digest(raw)},{'role':'fixed_head_hair_tip_guide','file':guide.relative_to(root).as_posix(),'sha256':digest(guide)}]}
 identity=hashlib.sha256(canonical(v)).hexdigest();p=folder/(identity+'.json')
 if not p.exists():p.write_bytes(canonical(v)+b'\n')
 load(root,identity);return identity


def references(root,identity,job):
 v=load(root,identity);result=[]
 for i,x in enumerate(v['references']):
  p=job/'references'/('fixed-tip-'+str(i)+'.png');p.write_bytes(private_path(root,x['file']).read_bytes());result.append(p)
 return result,v['references']


def apply(root,value,resolved,artifacts,head,head_image):
 from .hair_stages import bounds,rear_coverage
 from .ear_geometry import coverage
 images={p:prepare_texture(Image.open(io.BytesIO(r['content'])),(1,1),'hair')[0] for p,r in resolved.items()}
 for part,identity in artifacts.items():
  ref=load(root,identity);require(ref['part']==part and ref['design_id']==value['design_id'],'TIP_DESIGN_BINDING');base=private_path(root,ref['base_output']);oldfit=json.loads((base/'export/bundle/hair-fit.json').read_text(encoding='utf-8'));old=Image.open(base/'raw'/f'{part}.png').convert('RGBA');new=Image.open(io.BytesIO(resolved[part]['content'])).convert('RGBA')
  ratio=new.width/old.width;require(abs(new.height/old.height-ratio)<=ratio*.01,'TIP_CANVAS_REGISTRATION')
  ob=old.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox();nb=new.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox();on=prepare_texture(old,old.size,'hair')[0];onb=on.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox();nn=images[part];nnb=nn.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
  front=part=='HAIR_FRONT';wk='front_width' if front else 'back_width';tk='top' if front else 'back_top';ak='front_anchor_x' if front else 'back_anchor_x';ck='front_center_x' if front else 'back_center_x';ol=oldfit['layout'];worldpx=ol[wk]/(ob[2]-ob[0]);old_anchor=ob[0]+(ol.get(ak,(onb[0]+onb[2])/2)-onb[0])*(ob[2]-ob[0])/(onb[2]-onb[0]);newscale=(nnb[2]-nnb[0])/(nb[2]-nb[0])
  value['layout'].update({wk:(nb[2]-nb[0])*worldpx/ratio,tk:ol[tk]+(ob[1]-nb[1]/ratio)*worldpx,ak:nnb[0]+(old_anchor*ratio-nb[0])*newscale,ck:ol.get(ck,0)})
  other='HAIR_BACK' if front else 'HAIR_FRONT'
  if value['raw_sha256'][other]==oldfit['raw_sha256'][other]:
   for k in (('back_width','back_top','back_anchor_x','back_center_x') if front else ('front_width','top','front_anchor_x','front_center_x')):
    if k in ol:value['layout'][k]=ol[k]
 m=value['metrics'];layout=value['layout'];f=bounds(images['HAIR_FRONT'],layout,'HAIR_FRONT',head);b=bounds(images['HAIR_BACK'],layout,'HAIR_BACK',head);cov=coverage(images['HAIR_FRONT'],head,head_image,layout,side_end=.78);rear=rear_coverage(images['HAIR_BACK'],layout,head,head_image);delta=abs(f['head_hair_height']-b['head_hair_height'])/f['head_hair_height']
 m.update(post_anchor_coverage=cov,rear_head_coverage=rear);m['height_alignment'].update(front=f,back=b,height_difference_fraction=round(delta,6));m['status']='ESTIMATED_NOT_VISUALLY_APPROVED' if cov['crown_coverage']>=.95 and cov['central_face_occlusion']<=.1 and cov['side_boundary_max_uncovered_run_head_fraction']<=.03 and rear>=.98 and delta<=.08 else 'REQUIRES_REVIEW';m['sideburn_bottom']['below_head_fraction']=round(max(0,head['x']-head['height']/2-f['hair_bottom'])/head['height'],6);value['tip_artifacts']=copy.deepcopy(artifacts)
