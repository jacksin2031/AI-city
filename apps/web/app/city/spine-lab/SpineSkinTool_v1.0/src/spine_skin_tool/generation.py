"""单部位生成适配；默认仅预检，云调用无自动重试，输出保留原稿。"""
import base64
import copy
import hashlib
import io
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import socket
import threading
import time
import tomllib
import urllib.error
import urllib.parse
import urllib.request
import uuid
import warnings

from PIL import Image, ImageChops, ImageDraw, ImageOps
from .assembly import canonical, png_info
from .config import runtime_path
from .template import digest
from .codex_subscription import generate_image, login_status, SubscriptionError
from .texture import normalize_texture, standard_arm, prepare_texture
from .reference_assets import library_root

ROOT=Path(__file__).resolve().parents[2]
VERSIONS=tomllib.loads((ROOT/'runtime/versions.toml').read_text(encoding='utf-8'))
CONFIG_SCHEMA=VERSIONS['product']['provider_config_schema']
MAX_BYTES=24*1024*1024
LOCK=threading.Lock()
REFERENCE_ROLES=['original_character_photo','neutral_canvas_anchor_guide','fixed_head_and_ear_reuse_reference','harri_construction_and_style_reference','davide_spineboy_style_reference']

class GenerationError(ValueError):
    def __init__(self,code):
        self.code=code
        detail={'CODEX_CHATGPT_LOGIN_REQUIRED':'公式 Codex CLI で ChatGPT にログインしてください。',
                'CODEX_IMAGEGEN_UNAVAILABLE':'この Codex 実行では内蔵画像生成を利用できません。APIには切り替えません。',
                'CODEX_SUBSCRIPTION_LIMIT_REACHED':'購読の画像生成制限に達しました。解除後に利用状態を確認してください。自動再試行しません。',
                'CODEX_OUTPUT_MODERATION_BLOCKED':'生成結果がサービスの安全性チェックで拒否されました。画像は保存されず、自動再試行もしません。',
                'CODEX_TIMEOUT_RESULT_UNKNOWN_NO_RETRY':'生成が時間内に完了しませんでした。利用枠消費の有無は未確認です。自動再試行しません。',
                'LIVE_CALL_LIMIT':'設定された生成回数に達しました。過去の実行記録は保持されています。'}.get(code,'生成設定・入力・利用枠を確認してください。前の候補は保存されています。')
        super().__init__(code+': '+detail)

PART_PROMPTS={
    'HAIR_FRONT':('front hair only: recreate the real person’s haircut, hairline, direction, volume and hair color from Image 1 as a chibi front-hair layer. Keep fixed head and expressions separate; include small partially concealed ears in this hair layer. Use a few broad graphic hair clumps and minimal cel-shadow shapes.', 'never copy either style reference’s hairstyle. No full head, face, neck, fine strands, noisy highlights, crown gap or detached islands. Cover the fixed crown and temples while leaving the intended face opening readable.'),
    'HAIR_BACK':('one continuous opaque chibi rear hair mass covering the entire rear head base; the head model does not need to remain visible from behind. Infer the rear of the haircut from the original photo conservatively. Use a few broad simplified hair clumps, a coherent fill and minimal shadow. Keep crown height, left/right extent and overall volume close to the front design at the same head scale, allowing only hairstyle-justified differences.', 'no scalp, face, neck or clothing; ear areas naturally occluded; no realistic strands, scalp-like texture, patchwork, pasted tufts, seams, holes or central split. The front generated texture may be compared by the reviewer but must never be supplied as a model input.'),
    'BODY_FRONT':('one compact front torso garment panel like the construction of Harri body: rounded top and continuous simple side contours, with a bowl-shaped lower edge. The torso has NO shoulder area. Its outer top is ONE continuous convex inverted-U dome with highest point at top center. Collar and neckline are INTERIOR ink strokes only: no neckline notch, shoulder peaks or flares. The upper third is fully filled garment color. Keep the lower sides gently widening into a rounded bowl. Use two or three flat fold marks only; no trouser pockets, fly or anatomical dividing lines in the lower color band. All shoulder pixels, shoulder caps and sleeves belong exclusively to ARM_FRONT. For trousers, include a connected curved lower-trouser color band at the bottom, coherently matching the approximate dominant hue of the trouser color of LEG_FRONT. Use simple clear garment markings only where the photo supports them.', 'no shoulders, raised neck corners, flared shoulder wings, armholes drawn as protrusions, sleeves, arms, hands, head, skin, full trouser legs, separate pants or skirt. Do not draw sleeve caps or upper-arm fabric. Do not invent a Harri shirt emblem.'),
    'BODY_BACK':('one compact back torso garment panel matching the front garment and Harri-style construction: rounded top, simple sides and bowl-shaped lower edge. The torso has NO shoulder area. Its outer top is ONE continuous convex inverted-U dome with highest point at top center. Collar and neckline are INTERIOR ink strokes only: no neckline notch, shoulder peaks or flares. The upper third is fully filled garment color. Keep the lower sides gently widening into a rounded bowl. Use two or three flat fold marks only; no trouser pockets, fly or anatomical dividing lines in the lower color band. All shoulder pixels and sleeves belong exclusively to ARM_BACK. A connected curved lower-trouser band should approximately match LEG_BACK trouser color. Infer unseen rear garment details conservatively and label them as inference.', 'no shoulders, upturned or flared shoulder corners, raised collar wings, sleeves, arms, hands, head, neck skin, full trouser legs, detached pants, skirt or copied front-only graphic. Do not draw sleeve caps or upper-arm fabric.'),
    'ARM_FRONT':('one front-view chibi arm (standard Harri recoloring is the approved reliable path), following Harri arm construction: a simple broad tube with rounded upper shoulder cap integrated into this layer; sleeve color at the top when appropriate, exposed skin below, ending in a smooth semicircular mitten-like hand. Shoulder and sleeve belong entirely to this arm layer. Keep the observed source arm aspect and substantial thickness; simplify anatomy.', 'no fingers, separate thumb, palm lines, knuckles, fingernails, realistic wrist taper, long skinny forearm, torso, second arm, head or legs. No detached hand or shoulder piece.'),
    'ARM_BACK':('one rear-view chibi arm (standard Harri recoloring is the approved reliable path) with the same tube thickness and length as the front design: rounded shoulder cap and sleeve at the top, simple tube below, smooth semicircular hand end. Use Harri construction with photo-derived clothing and skin colors.', 'no fingers, separate thumb, palm or hand-back anatomy, knuckles, realistic wrist taper, skinny forearm, torso, second arm, head or legs. No detached shoulder or hand.'),
    'LEG_FRONT':('one front-view chibi leg, following Harri leg construction: a broad simple tube with rounded upper end, minimal knee detail and a compact simplified foot/shoe end. For trousers, fill the leg with approximately the same dominant trouser hue as the BODY_FRONT lower lower-trouser band. Keep source attachment proportions; photo realism must not determine anatomy.', 'no long skinny anatomical leg, sculpted calf, realistic knee, toes, detailed laces, torso, waist, body hem, skirt or separate pants outside the tube. Do not draw a pair of legs in one texture.'),
    'LEG_BACK':('one rear-view chibi tubular leg matching the front leg thickness, length, trouser fill and simplified shoe. Trouser color should approximately match the BODY_BACK lower lower-trouser band. Use simple rounded forms like Harri, with only essential rear shoe cues.', 'no anatomical calf, skinny leg, realistic knee, toes, detailed shoe anatomy, torso, waist, body hem, skirt or second leg.'),
    'SKIRT_FRONT':('ONE separate front-view white or chosen-color A-line skirt layer, narrow rounded waistband and wide shallow bowl hem, using EriKari skirt spread for animated leg coverage. Only a few clear fold strokes; no body or legs.', 'no torso, blouse, arms, skin, waist anatomy, legs, shoes or complete dress. Do not copy the source red checks, lace or palette; use the chosen outfit palette.'),
    'SKIRT_BACK':('ONE separate rear-view A-line skirt layer matching the front chosen skirt palette and flared volume; EriKari supplies hem spread only. Keep a simple opaque fabric panel with sparse folds.', 'no torso, blouse, arms, skin, legs, shoes, complete dress or source-character print. Back details are a chosen coherent design.'),
}

def build_part_prompt(part,description,canvas=None):
    if part not in PART_PROMPTS:raise GenerationError('REQUEST_PART')
    if VERSIONS['models']['image_prompt_revision']=='image-prompt-014':
        if part.startswith('HAIR'):
            from .hair_stages import bare_prompt
            return bare_prompt(part,description).replace('Draw NO ears, skin, face, head, eyes, neck, clothes, labels or marks.','Draw HAIR ONLY; leave the fixed original head and its features separate.').replace('toward the jaw','along the upper side cheeks; the lower jaw may remain visible').replace('or patch one edge','or stretch one edge')+'\nSIDEBURN RULE: short hair tips should finish close to their adjacent head outline. Small natural tip extension is acceptable. Reject clearly long thin hanging points below the lower face. Do not require a hair ring around the chin. Fit the complete hair first; localized tip correction may use the SAME frozen assembled reference while keeping crown, fringe and face opening.'
        from .component_prompts import brief
        return brief(part,description)
    subject,avoid=PART_PROMPTS[part]
    construction_reference='EriKari original skirt: use only its flared construction and animated hem spread' if part.startswith('SKIRT') else 'original Harri component: use its simple chibi construction, broad tubular limbs, semicircular hands, shoulder-free torso and clear economical linework where applicable'
    canvas_note=(f"Observed experimental export canvas: {canvas[0]} x {canvas[1]} pixels; preserve this canvas aspect ratio and use the neutral center anchor only. These values are not final production dimensions. " if canvas else "Use only the neutral canvas ratio and center anchor shown in Image 2. ")
    if part.startswith('HAIR') and VERSIONS['models']['image_prompt_revision']=='image-prompt-013':
        from .hair_stages import bare_prompt
        return bare_prompt(part,description)
    if part.startswith('HAIR'):
        shape=('Connected front hair AND SMALL EARS together, with a clear transparent opening for the EXISTING fixed face. Cover the head crown, temples and side cheek FRAME down toward the jaw without covering the central face. Small ear tips nest between the hair side masses, partly concealed; NOT the original large protruding ears.' if part=='HAIR_FRONT' else
            'REAR has ZERO face openings and ZERO large internal transparent windows within the head footprint. Paint continuous opaque HAIR over the ENTIRE fixed head target in Image 3, including its center; no front fringe silhouette or fake face aperture. A SOLID connected rear cap covering the whole back of the fixed head. Infer the same photographed haircut from behind, with ear areas naturally hidden by hair. No face opening. Match the FRONT hairstyle rendering and palette; rear shading is not subject to a stricter independent flatness requirement.')
        return f"""Use case: stylized-concept
Asset: ONE isolated transparent RGBA {part} hair-and-ear sprite for an existing 2D chibi head.
Input roles: Image 1 determines this person's haircut silhouette, sweep, length and color. Image 2 is a neutral anchor aid, NOT a stencil or final size. Image 3 is the ORIGINAL FIXED HEAD MODEL for face-opening fit, skin tone and painted line style; do NOT copy large original ears or draw the head/face. Images 4/5 are ORIGINAL Harri/Davide/Spineboy component art for economical painted contours and simplified shading, never identity or hairstyle copying.
Shape: {shape} Straight-on {'FRONT' if part=='HAIR_FRONT' else 'REAR'} view. Design the WHOLE hairstyle for the fixed head's required coverage width. Hair plus head should have a natural rounded skull-like volume, not a perfect circle and not an inflated tall cap. Preserve photographed cut/sweep/length and coherent accessories.
Fit: the fixed head is approximately 286 wide by 249 high in Spine units. Its face remains original and separate. Cover BOTH side-face boundaries as well as crown/temples, keep eyes/eyebrows/mouth readable through a transparent face opening. The opening must be designed around this head, not around a previous failed PNG. Width, height, outer contour and opening MAY change by 100-150 pixels or more where needed. There is NO old-outline pixel-coordinate, IoU or bounding-box-delta lock. Canvas dimensions are export observations, not a shape restriction.
Geometry: proportional scaling of the whole asset is allowed; NEVER horizontally stretch or squash old art. If fitting the width makes the head too tall or swollen, redesign and generate a naturally proportioned whole haircut at the needed width instead. Never use a mask or old-character alpha silhouette to conceal poor fit.
Style: use the same BROAD STYLE FAMILY as the reference: illustrated 2D chibi/cartoon. FRONT and REAR hair must share that broad rendering style and a coherent palette. Exact shadow logic, strand count, gradient technique, brushwork, highlight shapes or line density do NOT have to reproduce original Spine art and are NOT rejection reasons. A side-swept haircut may remain asymmetric while the HEAD VIEW is frontal. Other parts need compatible broad appearance, not matching hair shading.
View requirement: STRICT ORTHOGRAPHIC FRONT for HAIR_FRONT; STRICT ORTHOGRAPHIC REAR for HAIR_BACK. Head yaw/pitch/roll are zero. NEVER three-quarter, profile, turned, tilted or oblique. Even when Image 1 is a three-quarter photo, reinterpret the hairstyle for the fixed FRONTAL head. Front face opening is centered and frontal; keep its axis upright. Preserve natural asymmetry of fringe/bun/accessories WITHOUT turning the skull or face opening.
Coverage allowance: design 1-3% extra overlap at crown/side-cheek joins (default target 3% total width/height, about 4 original-head pixels per side on a 286px head). Do not merely touch one boundary pixel. Keep a slightly overlapping hair edge around the intended frontal head while the central face stays transparent/readable. A blind enlargement that also enlarges the transparent face hole is not proof of coverage. Fitting may ONLY uniformly scale the WHOLE asset; never stretch one axis or patch one edge.
EAR ROOT ANCHORS FIRST: Image 3 marks the fixed-head anatomical connection points with cyan crosses. In FRONT, design BOTH small ear roots at that head-relative height and separation, around 58% down the original head height, NOT at the jaw or lower cheek. Use the original head aspect/proportions to design the entire hair-and-ear group. The assembler will align those two roots by ONE uniform scale plus translation; it will NOT move ears independently or squash the hairstyle. Once roots are aligned, crown height, fringe clearance and side-cheek overlap must still work. If they do not, redesign the whole hairstyle for this head rather than making an ear-low tall cap. Keep skin fill distinct from hair so both small partial ear roots are visible for measurement. NEVER paint guide crosses or labels. Ears: original rig ears are hidden in EVERY direction and animation. New ears belong inside this hair PNG. Small rounded partially visible ears, warm skin outline and skin fill matching Image 3; hair naturally overlaps most of each ear. Do not paint the entire face, cheek skin, head model, eyes, eyebrows, mouth, neck or clothes.
Locked original-photo design: {description.strip()}
Output constraints: genuine transparent background, complete isolated hair plus its small integrated ears only; transparent face opening in front, solid coverage at rear, no labels or guides. Every attempt uses the SAME ORIGINAL PHOTO and ORIGINAL references; only text changes. No previous generated asset or preview is an image input."""
    prompt=f"""Use case: stylized-concept
Asset type: one isolated RGBA texture layer for a rigged 2D chibi character.
Input images (fixed order): Image 1 is the original character photo and is mandatory on every attempt; it controls identity, visible haircut, garment design and colors. Image 2 is a neutral canvas-and-anchor guide with no character artwork or silhouette. Image 3 contains the fixed original head base and ear for placement and reuse only; never redraw them. Image 4 is the {construction_reference}. Image 5 is a sheet of original Davide and Spineboy components, for consistent contour and simplified shading treatment only. For hair requests, style inputs show body art rather than source hairstyles. Never copy reference-character identity, hairstyle, outfit, emblems or palette. Never use a previously generated part, candidate, contact sheet or preview as an image input; change text and regenerate from the original photo each time.
Primary request: generate only {part}: {subject}
View normalization: STRICT straight-on orthographic {'FRONT' if part.endswith('FRONT') else 'REAR'} view, with ZERO head yaw/pitch/roll, NEVER three-quarter/profile/oblique, regardless of the photo camera angle. Side-part/updo hair must not copy a three-quarter face opening. Cover both fixed-head corners while keeping eyes/eyebrows clear. If the photographed hairstyle has a low bun/ribbon, it belongs behind the head, not as a pasted side piece in the front cap; do not add one when absent.
Style/medium: simple 2D chibi game texture matching the original Harri, Davide and Spineboy skins; readable cartoon contours and a compatible 2D illustrated chibi style. Clothing TYPE and broad dominant colors matter; exact pattern, hem hue, rendering density and shadow recipe do not need to copy a photo or reference. The photo controls visible appearance and colors; when the photo is incomplete, use partial visible clothing as a styling cue and choose a coherent full outfit freely, labeling it as a design choice. Explicit user instructions and clearly visible lower garments fix the relevant outfit details. Lock the chosen garment palette across all independent parts. The original photo controls visible design; Harri controls component construction, not personal identity. Simplify photographic anatomy into the source chibi proportions. Reject a clear STYLE FAMILY change such as a photographic, realistic 3D or pixel-art part among illustrated chibi parts. Do not reject ordinary shadow, gradient, strand, highlight or brush differences.
Assembly contract: front and side views use back-to-front LEGS < TORSO/SKIRT < ARMS < HEAD_GROUP; REAR views use LEGS < ARMS < TORSO/SKIRT < HEAD_GROUP. The whole arm stays behind the head group in every view; it is in front of the torso only in front/side views and behind the torso/skirt in rear views; do not bake occlusion or adjacent parts into this PNG. This is a requirement for subsequent runtime assembly, not a claim that a generated image changes draw order. Hide original ear attachments in EVERY view and emote. New small partially concealed ears belong to the hair layer, never to this garment/limb PNG. Back-facing hair must fully cover the rear head.
Join allowance: allow 1-3% generous overlap at part junctions; any size adjustment must uniformly scale the whole component, never stretch one axis, locally patch, or change fixed bones.
Constraints: one isolated part; true transparent background; keep the full part inside the neutral canvas; {canvas_note}Do not copy a source-character silhouette or use source artwork as a clipping mask. Fixed head, features and expressions stay unchanged; original ear attachments are hidden. Existing geometry is experimental and fit must be reviewed in runtime. Optional skirts remain separate and must pass real trot leg-sweep occlusion checks.
Avoid: {avoid} No background, contact sheet, guide marks, labels, text, extra parts, white matte, checkerboard or watermark.
Part-specific design notes (unseen clothing is an authorized design choice): {description.strip()}
Contour contract: use material-relative outlines, not one universal dark contour. Sleeve/shoulder edges use a darker shade of the sleeve color; exposed arms and semicircular hands use a warm deeper skin-tone outline similar to original Harri, never outline-free skin or a sleeve-colored skin edge. Keep body/leg/hair outlines consistent with their own material palettes.
Scope rule: use only design details relevant to this part. A sleeve description never authorizes sleeves in BODY. BODY is a single filled dome; skirt stays separate; a collar is an internal mark. Keep lower-trouser panel and LEG palette consistent. No generated image is an input to another attempt."""
    return prompt

def defaults():
    return {'schema_version':CONFIG_SCHEMA,'live_enabled':False,'upload_consent':False,
            'billing_source':'UNVERIFIED','max_live_calls':1,
            'codex':{'executable':'codex','timeout_seconds':600},
            'grok':{'model':VERSIONS['models']['grok_image_model'],'key_env':'XAI_API_KEY','api_key':''},
            'comfyui':{'url':'http://127.0.0.1:8188','workflow':'runtime/secrets/comfy-workflow.json',
                       'prompt_node':'','prompt_input':'text','image_bindings':[], 'output_node':'','poll_seconds':1,'max_polls':120}}

def settings(root=ROOT):
    path=runtime_path(root,'runtime/secrets/providers.json')
    return validate_settings(json.loads(path.read_text(encoding='utf-8')) if path.exists() else defaults(),root)

def validate_settings(value,root=ROOT):
    value=copy.deepcopy(value)
    expected=defaults()
    if isinstance(value,dict) and value.get('schema_version') in ('1.0.0','1.1.0'):
        # Discard legacy OpenAI API credentials in memory; never use them for subscription work.
        value.pop('openai',None);value['codex']=copy.deepcopy(expected['codex'])
        if isinstance(value.get('grok'),dict):value['grok'].setdefault('api_key','')
        value['schema_version']=CONFIG_SCHEMA
        value['live_enabled']=False  # Re-enable explicitly after reviewing the new transport.
    if not isinstance(value,dict) or set(value)!=set(expected):raise GenerationError('CONFIG_KEYS')
    for key in ('live_enabled','upload_consent'):
        if type(value[key]) is not bool:raise GenerationError('CONFIG_TYPE')
    if value['schema_version']!=CONFIG_SCHEMA or value['billing_source'] not in ('UNVERIFIED','SUBSCRIPTION_API_CREDITS_CONFIRMED','EXPLICIT_API_BUDGET'):raise GenerationError('BILLING_CONFIG')
    if type(value['max_live_calls']) is not int or not 1<=value['max_live_calls']<=VERSIONS['execution']['global_reservation_capacity']:raise GenerationError('CALL_LIMIT')
    for key in ('codex','grok','comfyui'):
        if not isinstance(value[key],dict) or set(value[key])!=set(expected[key]):raise GenerationError('PROVIDER_KEYS')
    for key in ('grok',):
        spec=value[key]
        if spec['model']=='':spec['model']=expected[key]['model']
        if not isinstance(spec['model'],str) or not re.fullmatch(r'[a-zA-Z0-9_.-]{1,100}',spec['model']):raise GenerationError('MODEL_INVALID')
        if not isinstance(spec['key_env'],str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,80}',spec['key_env']):raise GenerationError('KEY_ENV_INVALID')
        if not isinstance(spec['api_key'],str) or len(spec['api_key'])>512 or spec['api_key']!=spec['api_key'].strip() or any(char in spec['api_key'] for char in '\r\n\x00'):raise GenerationError('API_KEY_INVALID')
    c=value['codex']
    if not isinstance(c['executable'],str) or not c['executable'] or any(x in c['executable'] for x in ('\r','\n','\x00')):raise GenerationError('CODEX_EXECUTABLE')
    if type(c['timeout_seconds']) is not int or not 60<=c['timeout_seconds']<=1200:raise GenerationError('CODEX_TIMEOUT')
    c=value['comfyui'];u=urllib.parse.urlsplit(c['url'])
    if u.scheme!='http' or u.hostname not in ('127.0.0.1','localhost','::1') or u.path not in ('','/') or u.query or u.fragment or u.username or u.password:raise GenerationError('COMFY_NOT_LOOPBACK')
    try:u.port
    except ValueError:raise GenerationError('COMFY_PORT') from None
    workflow=runtime_path(root,c['workflow'])
    if not workflow.is_relative_to((root/'runtime/secrets').resolve()):raise GenerationError('WORKFLOW_PATH')
    for key in ('prompt_node','prompt_input','output_node'):
        if not isinstance(c[key],str) or len(c[key])>100:raise GenerationError('COMFY_BINDING')
        if not isinstance(c['image_bindings'],list) or len(c['image_bindings'])>5:raise GenerationError('COMFY_BINDING')
    for b in c['image_bindings']:
        if not isinstance(b,dict) or set(b)!={'node','input'} or any(not isinstance(v,str) or not v for v in b.values()):raise GenerationError('COMFY_BINDING')
    if type(c['max_polls']) is not int or not 1<=c['max_polls']<=300 or type(c['poll_seconds']) not in (int,float) or not .1<=c['poll_seconds']<=5:raise GenerationError('POLL_LIMIT')
    return copy.deepcopy(value)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

class HTTPTransport:
    """No hidden retry, redirect or environment proxy forwarding."""
    def request(self,method,url,headers=None,body=None):
        try:
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
            with opener.open(urllib.request.Request(url,data=body,headers=headers or {},method=method),timeout=120) as response:
                data=response.read(MAX_BYTES+1)
                if len(data)>MAX_BYTES:raise GenerationError('RESPONSE_TOO_LARGE')
                return data
        except urllib.error.HTTPError as error:raise GenerationError('HTTP_'+str(error.code)) from None
        except (OSError,ValueError) as error:
            if isinstance(error,GenerationError):raise
            raise GenerationError('NETWORK_RESULT_UNKNOWN_NO_RETRY') from None

def multipart(fields,files):
    boundary='spine-'+uuid.uuid4().hex;chunks=[]
    for name,value in fields.items():chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name,filename,content in files:
        chunks.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: image/png\r\n\r\n'.encode(),content,b'\r\n'])
    chunks.append(f'--{boundary}--\r\n'.encode())
    return b''.join(chunks),'multipart/form-data; boundary='+boundary

def character_references(root=ROOT):
    work=Path(root)/'runtime/work/M04'
    return sorted(p.name for p in work.glob('character-reference*.png') if re.fullmatch(r'character-reference(?:-?[1-9][0-9]*)?\.png',p.name) and p.is_file() and not p.is_symlink())

def _reference_name(root,name=None):
    if name is None:
        names=character_references(root);return 'character-reference.png' if 'character-reference.png' in names else names[0] if names else 'character-reference.png'
    if not isinstance(name,str) or not re.fullmatch(r'character-reference(?:-?[1-9][0-9]*)?\.png',name):raise GenerationError('REFERENCE_PATH')
    return name

def part_canvas(profile,part):
    if part in profile['parts']:return profile['parts'][part]['canvas']
    if part in ('SKIRT_FRONT','SKIRT_BACK'):
        with Image.open(library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images/erikari/skirt.png') as im:return list(im.size)
    raise GenerationError('REQUEST_PART')

def reference_roles(part):
    roles=list(REFERENCE_ROLES)
    if part.startswith('SKIRT'):roles[3]='erikari_skirt_construction_reference'
    if VERSIONS['models']['image_prompt_revision']=='image-prompt-014' and part.startswith(('BODY','LEG')):return [roles[i] for i in (0,3,4)]
    return roles

def _character_reference(root,name=None):
    work=Path(root)/'runtime/work/M04';character=work/_reference_name(root,name)
    if character.is_symlink() or not character.resolve().is_relative_to(work.resolve()):raise GenerationError('REFERENCE_PATH')
    if not character.is_file():raise GenerationError('CHARACTER_REFERENCE_REQUIRED')
    try:return image_bytes(character.read_bytes())
    except GenerationError:raise GenerationError('CHARACTER_REFERENCE_INVALID') from None

def references(profile,atlas,part,job,root=ROOT,character_reference=None):
    """Mandatory original photo first, then a neutral canvas guide and reuse/style references."""
    refs=job/'references';refs.mkdir()
    _character_reference(root,character_reference).save(refs/'character.png')
    width,height=part_canvas(profile,part)
    guide=Image.new('RGBA',(width,height),(248,248,248,255));draw=ImageDraw.Draw(guide)
    line=max(1,round(min(width,height)*0.006));center=(width//2,height//2)
    draw.rectangle((0,0,width-1,height-1),outline=(94,120,135,255),width=line)
    draw.line((center[0],line,center[0],height-line-1),fill=(154,170,179,210),width=line)
    draw.line((line,center[1],width-line-1,center[1]),fill=(154,170,179,210),width=line)
    radius=max(2,line*2);draw.ellipse((center[0]-radius,center[1]-radius,center[0]+radius,center[1]+radius),fill=(90,110,124,255))
    guide.save(refs/'canvas-guide.png')
    style_root=library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images'
    sheet=Image.new('RGBA',(640,360),(235,235,235,255));draw=ImageDraw.Draw(sheet)
    fixed=[('ORIGINAL FIXED HEAD - SKIN / LINE / FIT','spineboy/head-base.png')] if part.startswith('HAIR') else [('ORIGINAL HEAD BASE','spineboy/head-base.png'),('ORIGINAL EAR','spineboy/ear.png')]
    for index,(label,relative) in enumerate(fixed):
        with Image.open(style_root/relative) as raw:image=raw.convert('RGBA')
        thumb=ImageOps.contain(image,(300,300));x=index*320+(320-thumb.width)//2;y=42+(300-thumb.height)//2
        sheet.alpha_composite(thumb,(x,y));draw.text((index*320+8,12),label+(' [NO LARGE EARS]' if part.startswith('HAIR') else ' [FIXED REUSE]'),fill='black')
    sheet.save(refs/'fixed-head-ears.png')
    if part.startswith('HAIR') and VERSIONS['models']['image_prompt_revision']=='image-prompt-012':
        from .mother import prepare as original_template
        from .ear_geometry import guide
        original_source=original_template(ROOT)[0];original_data=json.loads(original_source.read_text(encoding='utf-8'))
        original_head=next(s for s in original_data['skins'] if s['name']=='ai-city-original-template')['attachments']['head-base']['head-base']
        guide(original_source,original_head,style_root/'spineboy/head-base.png',refs/'fixed-head-ears.png')
    component='arm' if part.startswith('ARM') else 'leg' if part.startswith('LEG') else 'body'
    # Hair never receives source-character hair artwork. Keep five inputs for all adapters.
    style=style_root/('erikari/skirt.png' if part.startswith('SKIRT') else f'harri/{component}.png')
    if not style.is_file():raise GenerationError('STYLE_REFERENCE_MISSING')
    png_info(style);shutil.copyfile(style,refs/'style-1.png')
    styles=Image.new('RGBA',(640,360),(235,235,235,255));draw=ImageDraw.Draw(styles)
    for index,name in enumerate(('davide','spineboy')):
        style=style_root/f'{name}/{component}.png'
        if not style.is_file():raise GenerationError('STYLE_REFERENCE_MISSING')
        png_info(style)
        with Image.open(style) as raw:thumb=ImageOps.contain(raw.convert('RGBA'),(300,300))
        styles.alpha_composite(thumb,(index*320+(320-thumb.width)//2,42+(300-thumb.height)//2))
        draw.text((index*320+8,12),name.upper()+' [STYLE ONLY]',fill='black')
    styles.save(refs/'style-2.png')
    paths=[refs/'character.png',refs/'canvas-guide.png',refs/'fixed-head-ears.png',refs/'style-1.png',refs/'style-2.png']
    if VERSIONS['models']['image_prompt_revision']=='image-prompt-014' and part.startswith(('BODY','LEG')):return [paths[i] for i in (0,3,4)]
    return paths

def image_bytes(content):
    if not content or len(content)>MAX_BYTES:raise GenerationError('OUTPUT_SIZE')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                if image.format not in ('PNG','JPEG','WEBP') or image.width*image.height>16777216:raise GenerationError('OUTPUT_IMAGE')
                image.load();result=image.convert('RGBA')
                if result.getchannel('A').getbbox() is None:raise GenerationError('OUTPUT_EMPTY')
                return result
    except (OSError,ValueError,Image.DecompressionBombError,Image.DecompressionBombWarning):raise GenerationError('OUTPUT_IMAGE_INVALID') from None

def cloud_request(provider,config,prompt,paths):
    files=[p.read_bytes() for p in paths];spec=config[provider]
    if provider!='grok':raise GenerationError('PROVIDER_INVALID')
    images=[{'type':'image_url','url':'data:image/png;base64,'+base64.b64encode(b).decode()} for b in files]
    body=canonical({'model':spec['model'],'prompt':prompt,'images':images,'n':1,'response_format':'b64_json'})
    return 'https://api.x.ai/v1/images/edits','application/json',body

def download_public(url,transport):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.fragment or u.port not in (None,443):raise GenerationError('OUTPUT_URL')
    if not (u.hostname.endswith('.x.ai') or u.hostname=='x.ai'):raise GenerationError('OUTPUT_HOST_NOT_ALLOWED')
    try:addresses=socket.getaddrinfo(u.hostname,443,type=socket.SOCK_STREAM)
    except OSError:raise GenerationError('OUTPUT_DNS') from None
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):raise GenerationError('OUTPUT_URL_PRIVATE')
    return transport.request('GET',url)  # Deliberately no bearer header on media download.

def cloud_result(content,transport):
    try:
        value=json.loads(content);data=value['data']
        if not isinstance(data,list) or len(data)!=1:raise GenerationError('OUTPUT_COUNT')
        item=data[0]
        if item.get('b64_json'):
            if len(item['b64_json'])>MAX_BYTES*4//3+8:raise GenerationError('OUTPUT_SIZE')
            return base64.b64decode(item['b64_json'],validate=True),value.get('usage')
        if item.get('url'):return download_public(item['url'],transport),value.get('usage')
    except (KeyError,TypeError,ValueError):raise GenerationError('PROVIDER_RESPONSE_INVALID') from None
    raise GenerationError('PROVIDER_RESPONSE_EMPTY')

def comfy_workflow(config,root=ROOT):
    c=config['comfyui'];path=runtime_path(root,c['workflow'])
    if not path.is_file():raise GenerationError('COMFY_WORKFLOW_REQUIRED')
    workflow=json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(workflow,dict) or not workflow or len(workflow)>500:raise GenerationError('COMFY_API_WORKFLOW_REQUIRED')
    def binding(node,key):
        if node not in workflow or not isinstance(workflow[node],dict) or not isinstance(workflow[node].get('inputs'),dict) or key not in workflow[node]['inputs']:raise GenerationError('COMFY_BINDING_MISSING')
    binding(c['prompt_node'],c['prompt_input'])
    if c['output_node'] not in workflow or not c['image_bindings']:raise GenerationError('COMFY_BINDING_MISSING')
    for b in c['image_bindings']:binding(b['node'],b['input'])
    return copy.deepcopy(workflow)

def comfy_generate(config,prompt,paths,job,transport,root=ROOT,sleep=time.sleep):
    c=config['comfyui'];base=c['url'].rstrip('/');workflow=comfy_workflow(config,root)
    if len(c['image_bindings'])!=len(paths):raise GenerationError('COMFY_REFERENCE_BINDINGS')
    for index,(path,binding) in enumerate(zip(paths,c['image_bindings'])):
        body,mime=multipart({'type':'input','overwrite':'false'},[('image',job.name+f'-ref-{index}.png',path.read_bytes())])
        uploaded=json.loads(transport.request('POST',base+'/upload/image',{'Content-Type':mime},body))
        name=uploaded['name'];folder=uploaded.get('subfolder','')
        if not isinstance(name,str) or '/' in name or '\\' in name or '..' in name or folder:raise GenerationError('COMFY_UPLOAD_PATH')
        workflow[binding['node']]['inputs'][binding['input']]=name
    workflow[c['prompt_node']]['inputs'][c['prompt_input']]=prompt
    queued=json.loads(transport.request('POST',base+'/prompt',{'Content-Type':'application/json'},canonical({'prompt':workflow,'client_id':job.name})))
    if queued.get('error') or queued.get('node_errors'):raise GenerationError('COMFY_QUEUE_REJECTED')
    prompt_id=queued.get('prompt_id')
    if not isinstance(prompt_id,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',prompt_id):raise GenerationError('COMFY_PROMPT_ID')
    (job/'queue.json').write_bytes(canonical({'prompt_id':prompt_id,'status':'QUEUED_NO_AUTOMATIC_RESUBMIT'})+b'\n')
    for _ in range(c['max_polls']):
        history=json.loads(transport.request('GET',base+'/history/'+prompt_id)).get(prompt_id)
        if history:
            status=history.get('status',{})
            if status.get('status_str')=='error':raise GenerationError('COMFY_EXECUTION_ERROR')
            images=history.get('outputs',{}).get(c['output_node'],{}).get('images',[])
            if images:
                if len(images)!=1:raise GenerationError('COMFY_OUTPUT_COUNT')
                item=images[0]
                if item.get('type') not in ('output','temp') or any(not isinstance(item.get(k,''),str) or '..' in item.get(k,'') or '\\' in item.get(k,'') or item.get(k,'').startswith('/') for k in ('filename','subfolder')):raise GenerationError('COMFY_OUTPUT_PATH')
                return transport.request('GET',base+'/view?'+urllib.parse.urlencode({k:item.get(k,'') for k in ('filename','subfolder','type')})),None
        sleep(c['poll_seconds'])
    raise GenerationError('COMFY_TIMEOUT_QUEUED_NO_RETRY')

def provider_status(root=ROOT):
    config=settings(root)
    return {'live_enabled':config['live_enabled'],'upload_consent':config['upload_consent'],
            'billing_source':config['billing_source'],'subscription_balance':'NOT_VERIFIED','character_references':character_references(root),
            'providers':{'standard':{'model':'Harri standard arm recolor','credential_present':True,'validation':'DETERMINISTIC_NO_MODEL'},'codex':{'model':'Codex built-in ImageGen','credential_present':login_status(config['codex']),
                                  'validation':'CHATGPT_LOGIN_CHECK_ONLY','billing':'CODEX_SUBSCRIPTION'},
                         'grok':{'model':config['grok']['model'],'credential_present':bool(config['grok']['api_key'] or os.environ.get(config['grok']['key_env'])),
                                 'validation':'MOCK_PROTOCOL_ONLY_LIVE_UNVERIFIED'},
                         'comfyui':{'model':None,'credential_present':None,'validation':'MOCK_PROTOCOL_ONLY_LIVE_UNVERIFIED'}}}

def generate(root,profile,atlas,payload,transport=None,job_id=None):
    """One part per explicit job. No credentials/body are written to logs or exposed to UI."""
    if not isinstance(payload,dict) or not {'provider','part','description','execute'}<=set(payload) or set(payload)-{'provider','part','description','execute','character_reference','arm_style','design_id','repair_request_id','flow_id','ear_request_id'}:raise GenerationError('REQUEST_KEYS')
    provider,part=payload['provider'],payload['part']
    payload=copy.deepcopy(payload)
    if payload.get('design_id'):
        from .design import load_design,part_request,arm_style,require
        require(isinstance(payload['description'],str),'REQUEST_DESCRIPTION')
        frozen=load_design(root,payload['design_id']);request=part_request(root,frozen,profile,part)
        require(not payload['description'].strip() or payload['description']==request['description'],'DESIGN_DESCRIPTION_CONFLICT')
        require('character_reference' not in payload or payload['character_reference']==request['character_reference'],'DESIGN_PHOTO_CONFLICT')
        require((provider=='standard')==part.startswith('ARM'),'DESIGN_PROVIDER_CONFLICT')
        if 'arm_style' in payload:require(payload['arm_style']==arm_style(frozen['design']),'DESIGN_ARM_STYLE_CONFLICT')
        payload.update(description=request['description'],character_reference=request['character_reference'])
        if part.startswith('ARM'):payload['arm_style']=arm_style(frozen['design'])
    if provider not in ('comfyui','codex','grok','standard') or (part not in profile['parts'] and part not in ('SKIRT_FRONT','SKIRT_BACK')) or part=='BLANK':raise GenerationError('REQUEST_PART')
    if type(payload['execute']) is not bool or not isinstance(payload['description'],str) or not 1<=len(payload['description'].strip())<=4000:raise GenerationError('REQUEST_DESCRIPTION')
    if provider=='standard':return generate_standard_arm(root,profile,payload)
    reference_name=_reference_name(root,payload.get('character_reference'))
    config=settings(root)
    prompt=build_part_prompt(part,payload['description'],part_canvas(profile,part));regeneration_variant=0
    repair_request=None
    ear_request=None
    if payload.get('ear_request_id'):
        from .ear_pass import load_request as load_ear_request
        from .pipeline_store import read as read_flow,directory as flow_directory
        from .pipeline import context as flow_context,totals
        state=read_flow(root,payload.get('flow_id'));flow_context(root,state);ear_request=load_ear_request(root,payload['ear_request_id'])
        if provider!='codex' or ear_request['flow_id']!=state['id'] or ear_request['design_id']!=payload.get('design_id') or ear_request['part']!=part or state.get('ear_requests',{}).get(part)!=payload['ear_request_id']:raise GenerationError('EAR_FLOW_BINDING')
        if payload['execute'] and (state['phase']!='EARS_GENERATE' or state['status']!='RUNNING' or state.get('ear_jobs',{}).get(part)!=job_id or not state['limits']['live_generation'] or totals(root,state)['image_calls_reserved']>state['limits']['max_image_calls'] or (flow_directory(root,state['id'])/'cancel.requested').exists()):raise GenerationError('EAR_RESERVED_JOB_REQUIRED')
        prompt=ear_request['prompt']
    if payload.get('flow_id') and not ear_request:
        from .pipeline_store import read as read_flow,directory as flow_directory
        from .pipeline import context as flow_context
        state=read_flow(root,payload['flow_id']);flow_context(root,state)
        if payload.get('repair_request_id') or provider!='codex' or state['design_id']!=payload.get('design_id'):raise GenerationError('FLOW_BINDING')
        if payload['execute'] and (not job_id or state['jobs'].get(part)!=job_id or state['status']!='RUNNING' or state['phase']!='GENERATE' or not state['limits']['live_generation'] or part in state['completed_parts'] or state['initial_image_calls_reserved']!=len(state['jobs'])+len(state.get('failed_jobs',[])) or state['initial_image_calls_reserved']>state['limits']['max_image_calls'] or (flow_directory(root,state['id'])/'cancel.requested').exists()):raise GenerationError('FLOW_RESERVED_JOB_REQUIRED')
    if payload.get('repair_request_id'):
        from .repair_requests import load_request
        repair_request=load_request(root,payload['repair_request_id'],profile)
        if provider!='codex' or repair_request['design_id']!=payload.get('design_id') or repair_request['part']!=part:raise GenerationError('REPAIR_BINDING')
        prompt=repair_request['prompt']
        if payload['execute']:
            from .repair_store import read as read_repair,directory as repair_directory
            state=read_repair(root,repair_request['task_id'])
            if not job_id or len(state['attempts'])<repair_request['cycle']:raise GenerationError('REPAIR_RESERVED_JOB_REQUIRED')
            attempt=state['attempts'][repair_request['cycle']-1]
            if not job_id or attempt['jobs'].get(part)!=job_id or attempt['requests'].get(part)!=payload['repair_request_id'] or part not in attempt['sent'] or state['status']!='RUNNING' or (repair_directory(root,state['id'])/'cancel.requested').exists():raise GenerationError('REPAIR_RESERVED_JOB_REQUIRED')
    if payload.get('flow_id') and not ear_request and VERSIONS['models']['image_prompt_revision']=='image-prompt-014':
        n=sum(x['part']==part for x in state.get('failed_jobs',[]))
        if n:
            from .component_prompts import regeneration_prompt
            prompt=regeneration_prompt(part,payload['description'],prompt,n);regeneration_variant=n
    if provider=='comfyui':comfy_workflow(config,root)
    if not payload['execute']:
        return {'status':'PREFLIGHT_ONLY_NO_MODEL_CALL','provider':provider,'part':part,'model':VERSIONS['models']['image_model'] if provider=='codex' else config[provider].get('model'),
                'reference_roles':reference_roles(part),'character_reference_required':True,
                'character_reference_name':reference_name,'character_reference_present':(Path(root)/'runtime/work/M04'/reference_name).is_file(),
                'prompt_revision':VERSIONS['models']['image_prompt_revision'],
                'design_id':payload.get('design_id'),'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),'prompt':prompt,'live_enabled':config['live_enabled'],'billing_source':config['billing_source']}
    if config['live_enabled'] is not True or config['upload_consent'] is not True:raise GenerationError('LIVE_DISABLED')
    if provider=='grok' and config['billing_source']=='UNVERIFIED':raise GenerationError('BILLING_UNVERIFIED')
    key=(config[provider].get('api_key') or os.environ.get(config[provider]['key_env'],'') ) if provider=='grok' else ''
    if provider=='grok' and (not key or '\r' in key or '\n' in key):raise GenerationError('API_KEY_REQUIRED')
    if provider=='codex' and not login_status(config['codex']):raise GenerationError('CODEX_CHATGPT_LOGIN_REQUIRED')
    _character_reference(root,reference_name)  # Fail before reserving a call if the mandatory original photo is absent/invalid.
    jobs=runtime_path(root,'runtime/work/M04/generation/jobs');jobs.mkdir(parents=True,exist_ok=True)
    # Reservation persists even after unknown network outcomes; no double-charge retry.
    with LOCK:
        if job_id is not None and (not isinstance(job_id,str) or not re.fullmatch(r'job-[a-f0-9]{32}',job_id)):raise GenerationError('JOB_ID')
        job=jobs/(job_id or 'job-'+uuid.uuid4().hex)
        if job.exists():raise GenerationError('JOB_ALREADY_EXISTS')
        reservation_prefix='codex-call' if provider=='codex' else 'call'
        for index in range(1,config['max_live_calls']+1):
            try:
                # Exclusive file creation also protects multiple preview processes.
                with (jobs/f'{reservation_prefix}-{index:04d}.reserved').open('x',encoding='utf-8') as reservation:reservation.write(job.name)
                break
            except FileExistsError:continue
        else:raise GenerationError('LIVE_CALL_LIMIT')
        job.mkdir()
        record={'flow_id':payload.get('flow_id'),'repair_request_id':payload.get('repair_request_id'),'started_at':time.time(),'design_id':payload.get('design_id'),'id':job.name,'status':'RESERVED','provider':provider,'part':part,'model':VERSIONS['models']['image_model'] if provider=='codex' else config[provider].get('model'),
                'prompt_revision':VERSIONS['models']['image_prompt_revision'],'character_reference_name':reference_name,'regeneration_variant':regeneration_variant,
                'billing_source':'CODEX_SUBSCRIPTION' if provider=='codex' else config['billing_source'],'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),'model_calls_reserved':1}
        (job/'report.json').write_bytes(canonical(record)+b'\n')
    active_started=time.monotonic()
    try:
        if ear_request:
            from .ear_pass import references as ear_references
            paths=ear_references(root,payload['ear_request_id'],job);roles=['original_character_photo',*['fixed_ear_stage_reference']*(len(paths)-1)];record.update(ear_request_id=payload['ear_request_id'],artifact_role='EAR_ONLY_PASS')
        else:
            paths=references(profile,atlas,part,job,root,reference_name);roles=reference_roles(part)
            if repair_request and repair_request.get('tip_artifact'):
                from .hair_tip import references as tip_references
                extra,items=tip_references(root,repair_request['tip_artifact'],job);paths+=extra;roles+=[x['role'] for x in items];record['tip_artifact']=repair_request['tip_artifact']
        record['references']=[{'role':role,'file':p.name,'sha256':digest(p)} for role,p in zip(roles,paths)]
        transport=transport or HTTPTransport()
        if provider=='codex':
            from .character_session import for_design
            session=for_design(root,payload.get('design_id'),payload.get('flow_id') or (state.get('parent_flow_id') if repair_request else None))
            if session:
                record['session_mode']='PER_CHARACTER';record['character_session_flow']=session['flow_id'];record['requested_model']=VERSIONS['models']['character_session_model']
                content,usage=generate_image(config['codex'],prompt,paths,job,session=session,part=('EARS_'+part.split('_')[1]) if ear_request else part,local_edit=bool(record.get('tip_artifact')))
            else:content,usage=generate_image(config['codex'],prompt,paths,job)
        elif provider=='comfyui':content,usage=comfy_generate(config,prompt,paths,job,transport,root)
        else:
            url,mime,body=cloud_request(provider,config,prompt,paths)
            response=transport.request('POST',url,{'Content-Type':mime,'Authorization':'Bearer '+key},body)
            content,usage=cloud_result(response,transport)
        # Save original provider bytes, then lossless RGBA conversion as separate artifact.
        (job/'raw-image.bin').write_bytes(content);image=image_bytes(content);image.save(job/'image.png')
        record.update(status='GENERATED_AWAITING_MANUAL_REVIEW',canvas=list(image.size),alpha_ready=image.getchannel('A').getextrema()[0]<255,
                      raw_sha256=hashlib.sha256(content).hexdigest(),image_sha256=digest(job/'image.png'))
        # Numeric usage only; do not persist arbitrary upstream response strings.
        if isinstance(usage,dict):record['usage']={k:v for k,v in usage.items() if isinstance(k,str) and type(v) in (int,float)}
    except Exception as error:
        record.update(status='FAILED_OR_RESULT_UNKNOWN_NO_RETRY',error_code=error.code if isinstance(error,(GenerationError,SubscriptionError)) else 'INVALID_PROVIDER_RESPONSE')
        record['finished_at']=time.time();record['elapsed_seconds']=time.monotonic()-active_started
        if (job/'execution-timing.json').is_file():record['execution_timing']=json.loads((job/'execution-timing.json').read_text(encoding='utf-8'))
        (job/'report.json').write_bytes(canonical(record)+b'\n')
        if isinstance(error,GenerationError):raise
        if isinstance(error,SubscriptionError):raise GenerationError(error.code) from None
        raise GenerationError('INVALID_PROVIDER_RESPONSE') from None
    clock=job/'execution-timing.json'
    if clock.is_file():record['execution_timing']=json.loads(clock.read_text(encoding='utf-8'))
    record['finished_at']=time.time();record['elapsed_seconds']=time.monotonic()-active_started
    (job/'report.json').write_bytes(canonical(record)+b'\n')
    return record

def generate_standard_arm(root,profile,payload):
    local_started=time.time();local_active_started=time.monotonic()
    if payload['part'] not in ('ARM_FRONT','ARM_BACK'):raise GenerationError('STANDARD_ARM_PART_ONLY')
    style=payload.get('arm_style',{'sleeve_color':'#F4F0E8','skin_color':'#FFD3BF','sleeve_fraction':0.21})
    source=library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images/harri/arm.png'
    try:
        with Image.open(source) as im:output=standard_arm(im,style)
    except (OSError,ValueError):raise GenerationError('STANDARD_ARM_STYLE') from None
    if not payload['execute']:return {'status':'PREFLIGHT_ONLY_NO_MODEL_CALL','provider':'standard','part':payload['part'],'design_id':payload.get('design_id'),'prompt':'STANDARD_TEMPLATE_RECOLOR; no image model call; '+json.dumps(style,sort_keys=True),'character_reference_present':True,'model_calls_reserved':0}
    jobs=runtime_path(root,'runtime/work/M04/generation/jobs');jobs.mkdir(parents=True,exist_ok=True);job=jobs/('job-'+uuid.uuid4().hex);job.mkdir()
    output.save(job/'image.png');(job/'raw-image.bin').write_bytes((job/'image.png').read_bytes())
    record={'design_id':payload.get('design_id'),'id':job.name,'status':'GENERATED_AWAITING_MANUAL_REVIEW','part':payload['part'],'provider':'standard','method':'USER_APPROVED_STANDARD_TEMPLATE_RECOLOR','outline_policy':'MATERIAL_RELATIVE_SLEEVE_AND_WARM_SKIN','workflow_revision':VERSIONS['workflow']['revision'],'ai_generated':False,'model_calls_reserved':0,'source_sha256':digest(source),'style':style,'canvas':list(output.size),'alpha_ready':True,'image_sha256':digest(job/'image.png')}
    record['started_at']=local_started;record['finished_at']=time.time();record['elapsed_seconds']=time.monotonic()-local_active_started
    (job/'report.json').write_bytes(canonical(record)+b'\n');return record

def prepare_trial_inputs(root,profile,atlas,inputs,job_id):
    """Import by uniform fit, preserving provider original; never apply an old silhouette mask."""
    if not isinstance(job_id,str) or not re.fullmatch(r'job-[a-f0-9]{32}',job_id):raise GenerationError('JOB_ID')
    job=runtime_path(root,'runtime/work/M04/generation/jobs/'+job_id)
    record=json.loads((job/'report.json').read_text(encoding='utf-8'))
    if record.get('status')!='GENERATED_AWAITING_MANUAL_REVIEW':raise GenerationError('JOB_NOT_READY')
    if record.get('design_id'):raise GenerationError('FROZEN_JOB_REQUIRES_CHARACTER_FLOW')
    destination=job/('trial-inputs-'+uuid.uuid4().hex);destination.mkdir()
    for part,spec in profile['parts'].items():
        if part!='BLANK':
            path=(inputs/spec['file']).resolve()
            if not path.is_relative_to(inputs.resolve()):raise GenerationError('INPUT_PATH')
            png_info(path);shutil.copyfile(path,destination/spec['file'])
    if record['part'] not in profile['parts']:raise GenerationError('OPTIONAL_SKIRT_REQUIRES_FULL_CHARACTER_EXPORT')
    spec=profile['parts'][record['part']];image=image_bytes((job/'image.png').read_bytes())
    if image.getchannel('A').getextrema()[0]==255:raise GenerationError('OUTPUT_ALPHA_REQUIRED')
    if record.get('ai_generated') is False and list(image.size)==spec['canvas']:
        canvas=image.copy();normalization={'transform':'PRESERVE_STANDARD_ARM_ALPHA'}
    else:canvas,normalization=prepare_texture(image,tuple(spec['canvas']))
    canvas.save(destination/spec['file']);png_info(destination/spec['file'])
    (destination/'generation-provenance.json').write_bytes(canonical({'job':job_id,'record':record,'transform':'UNIFORM_FIT_BOTTOM_ANCHOR_NO_REFERENCE_MASK','normalization':normalization})+b'\n')
    return destination
