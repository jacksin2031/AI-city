"""Shared deterministic full-character assembly. Never invokes an image model."""
from pathlib import Path
import copy,json,shutil,hashlib,os,uuid
from PIL import Image
from .assembly import make_profile,build,verify_bundle,bundle_zip,canonical,VERSIONS
from .template import inspect_template
from .mother import prepare
from .texture import prepare_texture,standard_arm
from .design import ROOT,DesignError,require,private_path,load_design,required_parts,arm_style,digest

sha=digest
def region(image,path,width,top,face=False,anchor_x=None,center_x=0,vertical_scale=1.0):
 w,h=image.size;b=image.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
 require(b is not None,'HAIR_MAIN_ALPHA_REQUIRED')
 x0,y0,x1,y1=b
 scale=width/(x1-x0);measured_anchor=anchor_x
 anchor_x=(x0+x1)/2 if anchor_x is None else anchor_x
 if face and measured_anchor is None:
  row=max(y0,min(y1-1,round(y0+(top-110)/scale)))
  a=image.getchannel('A');runs=[];start=None
  for x in range(x0,x1):
   clear=a.getpixel((x,row))<=32
   if clear and start is None:start=x
   if not clear and start is not None:runs.append((start,x));start=None
  if start is not None:runs.append((start,x1))
  internal=[r for r in runs if r[0]>x0+5 and r[1]<x1-5 and r[1]-r[0]>width/scale*.2]
  if internal:anchor_x=sum(max(internal,key=lambda r:r[1]-r[0]))/2
 sv=scale*vertical_scale
 return {'type':'region','path':path,'x':top-(h/2-y0)*sv,'y':(anchor_x-w/2)*scale-center_x,'width':w*scale,'height':h*sv,'rotation':-90},{'alpha32_bbox':b,'uniform_world_scale':scale,'vertical_scale':sv,'main_width':width,'top':top,'face_center_pixel':anchor_x}

def assemble_raw(root,raw_dir,output,layout,has_skirt=False,arm_source='standard',cid='character',integrated_ears=False,hair_overrides=None):
 """Compatibility and designed exports use this same raster/geometry implementation."""
 root=Path(root).resolve()
 def work(value):
  path=Path(value) if Path(value).is_absolute() else root/Path(value)
  return private_path(root,path.relative_to(root).as_posix())
 raw_dir,output=work(raw_dir),work(output)
 require(arm_source in ('standard','generated'),'ARM_SOURCE')
 from .design import BASE_PARTS
 for part in (*BASE_PARTS,*(('SKIRT_FRONT','SKIRT_BACK') if has_skirt else ())):
  require(work(raw_dir/(part+'.png')).is_file(),'CHARACTER_PARTS_INCOMPLETE')
 require(not output.exists(),'OUTPUT_ALREADY_EXISTS')
 source_root=prepare(root)[0].parent
 require(not output.is_relative_to(source_root) and not source_root.is_relative_to(output),'OUTPUT_TEMPLATE_OVERLAP')
 ORIENTATION=(ROOT/'ui/orientation.js').read_bytes()
 directory=output.resolve();directory.mkdir(parents=True);source=directory/'source';parts=directory/'parts';bundle=directory/'bundle'
 source.mkdir();parts.mkdir();shutil.copytree(source_root,source,dirs_exist_ok=True)
 skeleton=source/'ai-city-original-template.json';atlas=source/'ai-city-original-template.atlas';profile=make_profile(skeleton,atlas)
 dimensions={};measure={}
 for part,spec in profile['parts'].items():
  if part=='BLANK':continue
  with Image.open(raw_dir.resolve()/f'{part}.png') as raw:im=raw.convert('RGBA')
  kind='standard' if part.startswith('ARM') and arm_source=='standard' else 'hair' if part.startswith('HAIR') else 'fit'
  normalized,normalization=prepare_texture(im,tuple(spec['canvas']),kind)
  if hair_overrides and part in hair_overrides:
   normalized=hair_overrides[part].copy();normalization.update(transform='FIXED_BASE_EAR_ONLY_COMPOSITE',main_alpha_bbox=normalized.getchannel('A').getbbox())
  box=normalization['main_alpha_bbox'];transform=normalization['transform'];removed_alpha=normalization['removed_alpha_fraction'];is_standard=kind=='standard'
  normalized.save(parts/spec['file']);normalized.save(source/spec['file']);dimensions[spec['file']]=normalized.size
  measure[part]={'raw_sha256':sha(raw_dir.resolve()/f'{part}.png'),'raw_canvas':im.size,'raw_alpha_bbox':box,'export_canvas':normalized.size,'export_alpha_bbox':normalized.getchannel('A').getbbox(),'transform':transform,'alpha_silhouette_mask':False,'cleanup_alpha_threshold':0 if is_standard else 8,'removed_alpha_fraction':removed_alpha,'source': 'STANDARD_TEMPLATE_RECOLOR' if is_standard else 'IMPORTED_IMAGE_ORIGIN_UNVERIFIED'}
 data=json.loads(skeleton.read_text(encoding='utf-8'));skin=next(s for s in data['skins'] if s['name']=='ai-city-original-template')['attachments']
 geometry={}
 widths=(layout['front_width'],layout['back_width'])
 for part,slot,width in [('HAIR_FRONT','hair-front',widths[0]),('HAIR_BACK','back-hair',widths[1])]:
  with Image.open(parts/profile['parts'][part]['file']) as im:attachment,m=region(im,'ai-city-original-template/'+('hair-front' if slot=='hair-front' else 'hair-back'),width,layout.get('back_top',layout['top']) if part=='HAIR_BACK' else layout['top'],face=part=='HAIR_FRONT',anchor_x=layout.get('front_anchor_x' if part=='HAIR_FRONT' else 'back_anchor_x'),center_x=layout.get('front_center_x' if part=='HAIR_FRONT' else 'back_center_x',0),vertical_scale=layout.get('back_scale_y',1.0) if part=='HAIR_BACK' else 1.0)
  skin[slot]={slot:attachment};geometry[part]=m
 # Update full-page atlas dimensions after hair canvas normalization.
 lines=atlas.read_text(encoding='utf-8').splitlines();page=None;pages=inspect_template(source_root/'ai-city-original-template.json',source_root/'ai-city-original-template.atlas')['pages']
 for i,line in enumerate(lines):
  if line in pages:page=line
  if page in dimensions:
   w,h=dimensions[page]
   if line.strip().startswith('size:'):lines[i]=f'size: {w}, {h}'
   elif line.strip().startswith('bounds:'):lines[i]=f'bounds: 0, 0, {w}, {h}'
   elif line.strip().startswith('offsets:'):lines[i]=f'offsets: 0, 0, {w}, {h}'
 if has_skirt:
  custom_skin=next(s for s in data['skins'] if s['name']=='ai-city-original-template')
  custom_skin['bones']=list(dict.fromkeys(custom_skin.get('bones',[])+['skirt-middle','skirt-side-l','skirt-side-r','skirt-side-rotator-l','skirt-side-rotator-r']))
  original=next(s for s in data['skins'] if s['name']=='erikari')['attachments']['skirt']['skirt']
  for part,key in [('SKIRT_FRONT','skirt'),('SKIRT_BACK','skirt-back')]:
   with Image.open(raw_dir.resolve()/f'{part}.png') as raw:normalized,normalization=prepare_texture(raw,(328,201),'skirt')
   file=f'ai-city-template-{key}.png';normalized.save(source/file)
   region_name='ai-city-original-template/'+key
   a=copy.deepcopy(original);a['name']=region_name;a['path']=region_name;skin.setdefault('skirt',{})[key]=a
   lines.extend(['',file,'size: 328, 201','filter: Linear, Linear','pma: false',region_name,'bounds: 0, 0, 328, 201','offsets: 0, 0, 328, 201'])
   measure[part]={'raw_sha256':sha(raw_dir.resolve()/f'{part}.png'),'geometry':'ORIGINAL_ERIKARI_SKIRT_WEIGHTED_MESH_328x201','uniform_fit':True,'export_bbox':normalized.getchannel('A').getbbox(),'source':'IMPORTED_IMAGE_ORIGIN_UNVERIFIED','normalization':normalization}
 skeleton.write_bytes(canonical(data)+b'\n');atlas.write_text('\n'.join(lines)+'\n',encoding='utf-8')
 # make_profile is authoritative, so policy metadata is added to output only after build.
 cleanprofile=make_profile(skeleton,atlas);build(skeleton,atlas,parts,cleanprofile,bundle)
 policy=json.loads((bundle/'orientation-policy.json').read_text(encoding='utf-8'));policy.update(has_skirt=has_skirt,front_order=['body','arm-r','arm-l','head-base'])
 if integrated_ears:policy['ear_mode']='INTEGRATED_SMALL_EARS_IN_HAIR'
 (bundle/'orientation-policy.json').write_bytes(canonical(policy)+b'\n');(bundle/'orientation.js').write_bytes(ORIENTATION)
 manifest=json.loads((bundle/'build-manifest.json').read_text(encoding='utf-8'));manifest.update(experiment_id=VERSIONS['workflow']['revision'],source_arms=arm_source,status='AWAITING_VISUAL_REVIEW')
 for file in manifest['files']:manifest['files'][file]=sha(bundle/file)
 (bundle/'build-manifest.json').write_bytes(canonical(manifest)+b'\n');verify_bundle(bundle)
 (directory/'runtime.zip').write_bytes(bundle_zip(bundle))
 (directory/'assembly.json').write_text(json.dumps({'character':cid,'bundle':'bundle','parts':measure,'hair_geometry':geometry,'status':'AWAITING_VISUAL_REVIEW','old_candidate_art_reused':False,'fixed_head_original':True,'original_ears_hidden':integrated_ears,'fixed_head_ears_original':not integrated_ears,'bones_ik_original':True},indent=2)+'\n',encoding='utf-8')
 return {'status':'ASSEMBLED_NOT_VISUALLY_APPROVED','bundle':str(bundle)}
