"""Strict experimental design contract shared by the UI, CLI and part generation."""
import copy
import hashlib
import json
import math
from pathlib import Path
import re

from PIL import Image
from .assembly import canonical, VERSIONS
from .config import runtime_path

ROOT=Path(__file__).resolve().parents[2]
FEATURES=('hair','torso','lower','sleeve','leg','shoe')
BASE_PARTS=('HAIR_FRONT','HAIR_BACK','BODY_FRONT','BODY_BACK','ARM_FRONT','ARM_BACK','LEG_FRONT','LEG_BACK')


class DesignError(ValueError):
    def __init__(self,code):
        self.code=code
        super().__init__(code+': 設計書・写真・入力素材の整合性を確認してください。以前の候補は保存されています。')


def require(condition,code):
    if not condition:raise DesignError(code)


def private_path(root,value):
    path=runtime_path(Path(root).resolve(),value)
    require(path.is_relative_to((Path(root)/'runtime/work').resolve()),'PRIVATE_WORK_REQUIRED')
    return path


def photo_path(root,name):
    require(isinstance(name,str) and re.fullmatch(r'character-reference(?:-?[1-9][0-9]*)?\.png',name),'PHOTO_NAME')
    path=private_path(root,'runtime/work/M04/'+name)
    require(path.is_file() and path.stat().st_size<=24*1024*1024,'PHOTO_REQUIRED')
    return path


def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def keys(value,expected,code):require(isinstance(value,dict) and set(value)==set(expected),code)


def text(value,empty=False):
    require(isinstance(value,str) and len(value)<=1400 and (empty or bool(value.strip())) and '\x00' not in value,'DESIGN_TEXT')
    return value.strip()


def color(value):
    require(isinstance(value,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',value),'DESIGN_COLOR')
    return value.upper()


def validate_design(value,root=ROOT):
    value=copy.deepcopy(value)
    keys(value,('schema_version','character_id','photo','observed','appearance','skin_color','outline_policy','style','layout','production_approved'),'DESIGN_KEYS')
    require(value['schema_version']==VERSIONS['product']['design_schema'],'DESIGN_SCHEMA')
    require(isinstance(value['character_id'],str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}',value['character_id']),'CHARACTER_ID')
    require(value['production_approved'] is False,'EXPERIMENTAL_ONLY')
    keys(value['photo'],('file','sha256'),'PHOTO_KEYS')
    path=photo_path(root,value['photo']['file'])
    require(value['photo']['sha256']==digest(path),'PHOTO_CHANGED')
    with Image.open(path) as image:
        require(image.width*image.height<=16777216,'PHOTO_PIXELS');image.verify()
    keys(value['observed'],('hair','upper','lower'),'OBSERVED_KEYS')
    for key in value['observed']:value['observed'][key]=text(value['observed'][key],True)
    keys(value['appearance'],FEATURES,'APPEARANCE_KEYS')
    for feature in FEATURES:
        item=value['appearance'][feature]
        extra=('kind',) if feature=='lower' else ('fraction',) if feature=='sleeve' else ()
        keys(item,('description','color','basis',*extra),'FEATURE_KEYS')
        item['description']=text(item['description']);item['color']=color(item['color'])
        require(item['basis'] in ('PHOTO','FREE_DESIGN','USER'),'DESIGN_BASIS')
        observation='hair' if feature=='hair' else 'upper' if feature in ('torso','sleeve') else 'lower'
        require(item['basis']!='PHOTO' or bool(value['observed'][observation]),'PHOTO_BASIS_WITHOUT_OBSERVATION')
    lower=value['appearance']['lower'];sleeve=value['appearance']['sleeve']
    require(lower['kind'] in ('pants','skirt'),'LOWER_KIND')
    if lower['kind']=='pants':require(lower['color']==value['appearance']['leg']['color'],'PANTS_LEG_COLOR_CONFLICT')
    require(type(sleeve['fraction']) in (int,float) and math.isfinite(sleeve['fraction']) and 0<=sleeve['fraction']<=1,'SLEEVE_FRACTION')
    value['skin_color']=color(value['skin_color'])
    require(value['outline_policy']=='MATERIAL_RELATIVE','OUTLINE_POLICY')
    require(value['style']=={'construction':'harri','render':['davide','spineboy']},'STYLE_ROLE_CONFLICT')
    keys(value['layout'],('front_width','back_width','top'),'LAYOUT_KEYS')
    for name,number in value['layout'].items():
        require(type(number) in (int,float) and math.isfinite(number) and (100<=number<=800 if name!='top' else 150<=number<=600),'LAYOUT_RANGE')
    return value


def draft_design(root,photo,character_id='character',preset='short'):
    layouts=json.loads((ROOT/'templates/chibi-4.3-beta/character-layouts.json').read_text(encoding='utf-8'))['layouts']
    require(preset in layouts,'LAYOUT_PRESET')
    def item(description,c,**extra):return {'description':description,'color':c,'basis':'FREE_DESIGN',**extra}
    return validate_design({'schema_version':VERSIONS['product']['design_schema'],'character_id':character_id,
        'photo':{'file':photo,'sha256':digest(photo_path(root,photo))},'observed':{'hair':'','upper':'','lower':''},
        'appearance':{'hair':item('Short simplified hair; edit this example to match the original photo.','#25252D'),
            'torso':item('Plain compact shirt panel.','#F4F0E8'),
            'lower':item('Chosen simple trousers; not observed in the photo.','#35333D',kind='pants'),
            'sleeve':item('Short sleeve cap.','#F4F0E8',fraction=37/179),
            'leg':item('One broad tubular trouser leg.','#35333D'),
            'shoe':item('Simple rounded shoe.','#E9E4DC')},
        'skin_color':'#FFD3BF','outline_policy':'MATERIAL_RELATIVE','style':{'construction':'harri','render':['davide','spineboy']},
        'layout':copy.deepcopy(layouts[preset]),'production_approved':False},root)


def freeze_design(root,value):
    design=validate_design(value,root)
    record={'design':design,'schema_version':VERSIONS['product']['design_schema'],
        'workflow_revision':VERSIONS['workflow']['revision'],'prompt_revision':VERSIONS['models']['image_prompt_revision'],
        'template_revision':VERSIONS['spine']['template_revision'],'status':'FROZEN_EXPERIMENTAL'}
    identity=hashlib.sha256(canonical(record)).hexdigest();record['design_id']=identity
    path=private_path(root,f'runtime/work/M04/character-flow/designs/design-{identity}.json')
    path.parent.mkdir(parents=True,exist_ok=True)
    try:
        with path.open('xb') as stream:stream.write(canonical(record)+b'\n')
    except FileExistsError:require(path.read_bytes()==canonical(record)+b'\n','FROZEN_RECORD_CHANGED')
    return record


def load_design(root,identity):
    require(isinstance(identity,str) and re.fullmatch(r'[0-9a-f]{64}',identity),'DESIGN_ID')
    path=private_path(root,f'runtime/work/M04/character-flow/designs/design-{identity}.json')
    require(path.is_file(),'DESIGN_NOT_FOUND')
    record=json.loads(path.read_text(encoding='utf-8'));check=copy.deepcopy(record);check.pop('design_id',None)
    require(record.get('design_id')==identity and hashlib.sha256(canonical(check)).hexdigest()==identity,'FROZEN_RECORD_CHANGED')
    current=(VERSIONS['workflow']['revision'],VERSIONS['models']['image_prompt_revision'])
    observed=(record.get('workflow_revision'),record.get('prompt_revision'))
    compatible_legacy=current in (('photo-to-skin-shared-011','image-prompt-011'),('photo-to-skin-shared-012','image-prompt-012'),('photo-to-skin-shared-013','image-prompt-013'),('photo-to-skin-shared-014','image-prompt-014')) and observed in {(f'photo-to-skin-shared-{n:03}',f'image-prompt-{n:03}') for n in (7,8,9,10,11,12,13)}
    require((observed==current or compatible_legacy) and record.get('template_revision')==VERSIONS['spine']['template_revision'],'DESIGN_VERSION_STALE')
    validate_design(record['design'],root)
    return record


def required_parts(design):
    return (*BASE_PARTS,*(('SKIRT_FRONT','SKIRT_BACK') if design['appearance']['lower']['kind']=='skirt' else ()))


def arm_style(design):
    sleeve=design['appearance']['sleeve']
    return {'sleeve_color':sleeve['color'],'skin_color':design['skin_color'],'sleeve_fraction':sleeve['fraction']}


def part_description(design,part):
    require(part in required_parts(design),'PART_NOT_IN_DESIGN')
    a=design['appearance']
    def describe(key):
        x=a[key];return f"{key}: {x['description']} Color {x['color']}; design basis {x['basis']}."
    if part.startswith('HAIR'):return describe('hair')
    if part.startswith('BODY'):
        hem=f"Connected lower-trouser band color {a['lower']['color']}, approximately coherent with the LEG dominant hue; small shade differences are fine." if a['lower']['kind']=='pants' else f"Rounded waist hem color {a['torso']['color']}; skirt is a separate asset. No trouser panel or skirt in BODY."
        return describe('torso')+' '+hem
    if part.startswith('ARM'):return describe('sleeve')+f" Sleeve fraction {a['sleeve']['fraction']}; fixed skin color {design['skin_color']}; preserve material-relative sleeve/skin outlines."
    if part.startswith('LEG'):return describe('leg')+' '+describe('shoe')
    return describe('lower')+' Separate flared skirt only; no blouse or legs.'


def part_request(root,record,profile,part):
    from .generation import build_part_prompt,part_canvas,reference_roles
    # Validate a loaded record instead of accepting a caller-modified dictionary.
    record=load_design(root,record['design_id']);design=record['design'];description=part_description(design,part)
    canvas=part_canvas(profile,part);standard=part.startswith('ARM')
    prompt=('STANDARD_TEMPLATE_RECOLOR; no image model call; '+json.dumps(arm_style(design),sort_keys=True)) if standard else build_part_prompt(part,description,canvas)
    return {'part':part,'method':'STANDARD_TEMPLATE_RECOLOR' if standard else 'ORIGINAL_PHOTO_GENERATION',
        'design_id':record['design_id'],'character_reference':design['photo']['file'],'canvas':canvas,
        'description':description,'prompt':prompt,'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),
        'reference_roles':['original_harri_arm'] if standard else reference_roles(part),
        'model_calls_reserved':0,'arm_style':arm_style(design) if standard else None}
