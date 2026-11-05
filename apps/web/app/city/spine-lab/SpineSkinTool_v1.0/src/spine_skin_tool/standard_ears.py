"""Small reference ears on a frozen hair/head layout; no model or hair resampling."""
import copy,hashlib,json,math
from PIL import Image,ImageChops,ImageDraw,ImageOps
from .assembly import canonical,verify_bundle
from .design import ROOT,private_path,require,digest,load_design
from .hair_fit import target_head
from . import ear_policy
from .reference_assets import library_root

REVISION='standard-ear-001'

def source_image():return library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images/spineboy/ear.png'

def create_artifact(root,output,decision_id):
 source=private_path(root,output);verify_bundle(source/'export/bundle');decision=ear_policy.load(root,decision_id)
 record=json.loads((source/'design.json').read_text(encoding='utf-8'));require(load_design(root,record['design_id'])==record,'EAR_BASE_DESIGN')
 require(decision['mode']=='PARTIAL_BOTH' and decision['photo_sha256']==record['design']['photo']['sha256'],'EAR_DECISION_BASE')
 data={'source_kind':'STANDARD_REFERENCE_EARS','revision':REVISION,'base_output':output,'base_manifest_sha256':digest(source/'export/bundle/build-manifest.json'),'base_fit_sha256':digest(source/'export/bundle/hair-fit.json'),'decision_id':decision_id,'source_shape_sha256':digest(source_image()),'height_head_fraction':.12,'visible_outer_width_fraction':.60,'model_calls':0,'jobs':{}}
 identity=hashlib.sha256(canonical(data)).hexdigest();folder=private_path(root,'runtime/work/M08/ear-artifacts');folder.mkdir(parents=True,exist_ok=True);path=folder/(identity+'.json')
 if not path.exists():path.write_bytes(canonical(data)+b'\n')
 require(json.loads(path.read_text(encoding='utf-8'))==data,'EAR_ARTIFACT_CHANGED');return identity

def compute(root,identity,data,inspection=None):
 require(data['revision']==REVISION and digest(source_image())==data['source_shape_sha256'],'STANDARD_EAR_SOURCE_CHANGED')
 source=private_path(root,data['base_output']);require(digest(source/'export/bundle/hair-fit.json')==data['base_fit_sha256'],'EAR_BASE_CHANGED');verify_bundle(source/'export/bundle')
 decision=ear_policy.load(root,data['decision_id']);record=json.loads((source/'design.json').read_text(encoding='utf-8'));require(decision['mode']=='PARTIAL_BOTH' and decision['photo_sha256']==record['design']['photo']['sha256'],'EAR_DECISION_BASE')
 fit=json.loads((source/'export/bundle/hair-fit.json').read_text(encoding='utf-8'));layout=copy.deepcopy(fit['layout']);head,head_path=target_head(root)
 skin=next(s for s in json.loads((source/'export/bundle/skeleton.json').read_text(encoding='utf-8'))['skins'] if s['name']=='ai-city-original-template')['attachments']
 with Image.open(source_image()) as raw:shape=raw.convert('RGBA');shape=shape.crop(shape.getchannel('A').getbbox())
 images={};measure={};roots=fit['metrics']['shared_ear_targets']['points']
 for part,slot in [('HAIR_FRONT','hair-front'),('HAIR_BACK','back-hair')]:
  front=part.endswith('FRONT');file=source/'export/bundle'/('ai-city-template-hair-front.png' if front else 'ai-city-template-hair-back.png')
  with Image.open(file) as im:base=im.convert('RGBA')
  require(digest(source/'raw'/f'{part}.png')==fit['raw_sha256'][part],'EAR_BASE_RAW_CHANGED')
  a=skin[slot][slot];unit=a['width']/base.width;require(abs(unit-a['height']/base.height)<1e-5,'EAR_BASE_UNIFORM_GEOMETRY');left=-a['y']-a['width']/2;top=a['x']+a['height']/2
  height=max(1,round(head['height']*data['height_head_fraction']/unit));ear=shape.resize((max(1,round(shape.width*height/shape.height)),height),Image.Resampling.LANCZOS)
  placements=[]
  for index,(wx,wy) in enumerate(roots):
   sprite=ear if index==0 else ImageOps.mirror(ear);x=round((wx-left)/unit)-(sprite.width if index==0 else 0);y=round((top-wy)/unit-sprite.height/2);placements.append((sprite,x,y))
  x0=min(0,math.floor((-head['width']/2-left)/unit),*[x for im,x,y in placements]);y0=min(0,math.floor((top-head['x']-head['height']/2)/unit),*[y for im,x,y in placements]);x1=max(base.width,math.ceil((head['width']/2-left)/unit),*[x+im.width for im,x,y in placements]);y1=max(base.height,math.ceil((top-head['x']+head['height']/2)/unit),*[y+im.height for im,x,y in placements])
  size=(x1-x0,y1-y0);require(max(size)<=4096,'STANDARD_EAR_CANVAS_LIMIT');under=Image.new('RGBA',size);over=Image.new('RGBA',size);pieces=[]
  for index,(sprite,x,y) in enumerate(placements):
   x-=x0;y-=y0;one=Image.new('RGBA',size);one.alpha_composite(sprite,(x,y));under.alpha_composite(one)
   # Only the NEW ear's inner attachment portion is occluded. No hair mask/crop.
   outer=Image.new('L',sprite.size);d=ImageDraw.Draw(outer);cut=round(sprite.width*data['visible_outer_width_fraction']);d.rectangle((0,0,cut-1,sprite.height) if index==0 else (sprite.width-cut,0,sprite.width,sprite.height),fill=255)
   exposed=sprite.copy();exposed.putalpha(ImageChops.multiply(sprite.getchannel('A'),outer));visible_layer=Image.new('RGBA',size);visible_layer.alpha_composite(exposed,(x,y));over.alpha_composite(visible_layer);pieces.append((one.getchannel('A'),visible_layer.getchannel('A')))
  hair=Image.new('RGBA',size);hair.alpha_composite(base,(-x0,-y0));canvas=under.copy();canvas.alpha_composite(hair);canvas.alpha_composite(over);box=canvas.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
  layout.update({('front_width' if front else 'back_width'):(box[2]-box[0])*unit,('top' if front else 'back_top'):top-y0*unit-box[1]*unit,('front_anchor_x' if front else 'back_anchor_x'):-left/unit-x0,('front_center_x' if front else 'back_center_x'):0})
  each=[]
  for index,(mask,top_mask) in enumerate(pieces):
   actual=ImageChops.lighter(top_mask,ImageChops.multiply(mask,ImageChops.invert(hair.getchannel('A'))));total=sum(v>96 for v in mask.getdata());seen=sum(v>96 for v in actual.getdata());each.append({'side':'left' if index==0 else 'right','total_pixels':total,'visible_pixels':seen,'visible_fraction':round(seen/max(1,total),6)})
  require(len(each)==2 and all(e['visible_fraction']>=.4 for e in each),'STANDARD_EAR_VISIBILITY')
  measure[part]={'roots_head_local':roots,'visible_ear_pixels':sum(e['visible_pixels'] for e in each),'per_ear':each,'hair_geometry_frozen':True,'both_ears_generated':False,'both_ears_present':True,'source_kind':'STANDARD_REFERENCE_EARS','model_calls':0,'head_units_per_pixel':unit,'hair_base_sha256':fit['raw_sha256'][part],'base_export_sha256':digest(file),'original_hair_resampled':False,'original_hair_cropped':False,'placement':'NEW_EAR_INNER_ROOT_UNDER_SIDE_HAIR_OUTER_EAR_OVER_SIDE_HAIR'}
  images[part]=canvas
  if inspection is not None:
   qa=Image.new('RGBA',size,'#edf1f3')
   with Image.open(head_path) as original:h=original.convert('RGBA').resize((round(head['width']/unit),round(head['height']/unit)),Image.Resampling.LANCZOS)
   qa.alpha_composite(h,(round((-head['width']/2-left)/unit)-x0,round((top-head['x']-head['height']/2)/unit)-y0));qa.alpha_composite(under);faded=hair.copy();faded.putalpha(faded.getchannel('A').point(lambda v:round(v*.18)));qa.alpha_composite(faded);qa.alpha_composite(over);inspection[part]=qa
 from .hair_stages import bounds
 final_bounds={p:bounds(images[p],layout,p,head) for p in images};value=copy.deepcopy(fit);value['layout']=layout;value['metrics']['height_alignment'].update(front=final_bounds['HAIR_FRONT'],back=final_bounds['HAIR_BACK'],height_difference_fraction=round(abs(final_bounds['HAIR_FRONT']['head_hair_height']-final_bounds['HAIR_BACK']['head_hair_height'])/final_bounds['HAIR_FRONT']['head_hair_height'],6));value['ear_pass']={'artifact':identity,'source_kind':'STANDARD_REFERENCE_EARS','revision':REVISION,'decision_id':data['decision_id'],'measurements':measure,'stage':'BOTH_EARS','base_fit_id':fit['fit_id'],'model_calls':0};value['metrics']['ear_stage']='BOTH_EARS';value.pop('fit_id',None);value['fit_id']=hashlib.sha256(canonical(value)).hexdigest();return images,layout,value
