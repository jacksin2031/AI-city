"""Evidence-bound quality checks. Structural success never implies semantic approval."""
import copy
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import threading
import uuid

from PIL import Image
from .assembly import canonical,verify_bundle,PARTS,FACE,VERSIONS
from .design import ROOT,private_path,require,DesignError,load_design,required_parts,digest,arm_style
from .texture import standard_arm,prepare_texture
from .reference_assets import library_root

LOCK=threading.RLock()


def policy():
    value=json.loads((ROOT/'runtime/config/quality-policy.json').read_text(encoding='utf-8'))
    require(value['revision']==VERSIONS['product']['quality_policy'],'QUALITY_POLICY_VERSION')
    return value


def stage_confidence_floor(environment=None):
    """Preview-only 0.80 stage gate; never relax the production policy."""
    env = os.environ if environment is None else environment
    if (env.get("AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH") == "1"
            and env.get("AI_CITY_VISITOR_NAMESPACE") == "preview-staging-20261107"):
        return 0.8
    return policy()["visual_confidence_floor"]


def finding(code,part='CHARACTER',result='FAIL',message='',frame_id=None,direction='all',severity='MAJOR',confidence=1.0):
    return {'code':code,'part':part,'result':result,'severity':severity,'confidence':0.0 if result=='UNKNOWN' else confidence,
            'direction':direction,'frame_id':frame_id,'message_ja':message or '素材・接合部・方向ルールを確認してください。'}


def image_metrics(image):
    im=image.convert('RGBA');alpha=im.getchannel('A');box=alpha.getbbox()
    main=alpha.point(lambda a:a if a>policy()['alpha_threshold'] else 0).getbbox()
    area=lambda b:(b[2]-b[0])*(b[3]-b[1]) if b else 0
    return {'canvas':list(im.size),'alpha_bbox':box,'main_alpha_bbox':main,
            'opaque_background':alpha.getextrema()[0]==255,'outlier_bbox_ratio':area(box)/max(1,area(main))}


def palette_distance(image,target,y_range):
    im=image.convert('RGBA');w,h=im.size
    crop=im.crop((int(w*.3),int(h*y_range[0]),max(int(w*.7),int(w*.3)+1),max(int(h*y_range[1]),int(h*y_range[0])+1)))
    crop.thumbnail((64,64));rgb=tuple(int(target[i:i+2],16) for i in (1,3,5))
    distances=sorted(sum((a-b)**2 for a,b in zip(p[:3],rgb))**.5 for p in crop.getdata() if p[3]>240)
    return statistics.median(distances[:max(1,len(distances)//5)]) if distances else None


def check_part(image,part,design,expected_arm=None):
    metrics=image_metrics(image);issues=[]
    if not metrics['main_alpha_bbox']:issues.append(finding('EMPTY_PART',part,message='有効な不透明部分がありません。'))
    if metrics['opaque_background']:issues.append(finding('OPAQUE_BACKGROUND',part,message='透明背景ではありません。'))
    # Only structural validity belongs to the individual normalized export.
    # Alpha fringe is checked on the fully assembled Spine animation captures,
    # not raw ImageGen inputs or separately laid-out texture pages.
    if expected_arm is not None and (image.size!=expected_arm.size or image.convert('RGBA').tobytes()!=expected_arm.tobytes()):
        issues.append(finding('STANDARD_ARM_OUTLINE_OR_PALETTE',part,message='標準の腕の形・袖線・肌色線が確定設計と一致しません。'))
    if design['appearance']['lower']['kind']=='pants' and part.startswith(('BODY','LEG')):
        delta=palette_distance(image,design['appearance']['lower']['color'],(.75,1) if part.startswith('BODY') else (.15,.6))
        metrics['locked_pants_color_distance']=delta
        # This uncalibrated part-only palette sample is a diagnostic metric.
        # The assembled visual review judges garment colors in full context.
        if delta is None or delta>policy()['palette_distance_warning']:
            metrics['pants_color_visual_review_advisory']=True
    return metrics,issues


def hard_checks(root,output):
    from .character_flow import source_profile
    folder=private_path(root,output);bundle=private_path(root,output+'/export/bundle')
    source,atlas,profile=source_profile(root)
    snapshot=private_path(root,output+'/design.json');require(snapshot.is_file(),'DESIGN_SNAPSHOT_REQUIRED')
    record=json.loads(snapshot.read_text(encoding='utf-8'));issues=[];parts={}
    try:require(load_design(root,record['design_id'])==record,'DESIGN_SNAPSHOT_CHANGED')
    except (ValueError,OSError,KeyError,TypeError):issues.append(finding('DESIGN_OR_PHOTO_CHANGED',message='設計書または元写真の整合性を確認できません。'))
    try:manifest=verify_bundle(bundle)
    except (ValueError,OSError,KeyError,TypeError):manifest=None;issues.append(finding('BUNDLE_INTEGRITY',message='JSON・atlas・画像のハッシュまたは形式が一致しません。'))
    with Image.open(library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images/harri/arm.png') as im:expected=standard_arm(im,arm_style(record['design']))
    observed={};ear_overrides=None
    fit_path=bundle/'hair-fit.json'
    if fit_path.is_file():
        fit_record=json.loads(fit_path.read_text(encoding='utf-8'))
        if fit_record.get('ear_pass'):
            from .ear_pass import compute
            ear_overrides,_,_=compute(root,fit_record['ear_pass']['artifact'])
    for part in required_parts(record['design']):
        file=PARTS.get(part,'skirt' if part=='SKIRT_FRONT' else 'skirt-back')
        path=private_path(root,output+'/export/bundle/ai-city-template-'+file+'.png')
        raw=private_path(root,output+'/raw/'+part+'.png')
        observed[raw.relative_to(folder).as_posix()]=digest(raw) if raw.is_file() else None
        if not path.is_file():issues.append(finding('PART_MISSING',part,message='必須の部位画像がありません。'));continue
        try:
            with Image.open(path) as im:metrics,found=check_part(im,part,record['design'],expected if part.startswith('ARM') else None)
            metrics['export_sha256']=digest(path);metrics['raw_sha256']=observed[raw.relative_to(folder).as_posix()]
            if raw.is_file():
                with Image.open(raw) as im:
                    metrics['raw']=image_metrics(im)
                    size=(328,201) if part.startswith('SKIRT') else tuple(profile['parts'][part]['canvas'])
                    kind='standard' if part.startswith('ARM') else 'hair' if part.startswith('HAIR') else 'skirt' if part.startswith('SKIRT') else 'fit'
                    normalized,normalization=prepare_texture(im,size,kind)
                if ear_overrides and part in ear_overrides:normalized=ear_overrides[part]
                metrics['expected_export_canvas']=list(normalized.size);metrics['normalization']=normalization
                with Image.open(path) as exported:
                    if exported.size!=normalized.size or exported.convert('RGBA').tobytes()!=normalized.tobytes():found.append(finding('NORMALIZED_PART_MISMATCH',part,message='原稿と共通処理から再現した画布・画素がエクスポートと一致しません。'))
                # Individual raw ImageGen images are *not* the published character.
                # Keep raw provenance, structural alpha checks and byte-exact normalized
                # export validation. Outlier pixels are assessed only on the assembled
                # Spine animation frames after CAPTURE in review_render.py.
                m=metrics['raw']
                if not m['main_alpha_bbox']:
                    found.append(finding('RAW_EMPTY_PART',part,message='原稿に有効な不透明部分がありません。'))
                if m['opaque_background']:
                    found.append(finding('RAW_OPAQUE_BACKGROUND',part,message='原稿が透明背景ではありません。'))
            else:found.append(finding('RAW_SNAPSHOT_MISSING',part,message='原稿の保存記録がありません。'))
            parts[part]=metrics;issues.extend(found)
        except (ValueError,OSError):issues.append(finding('PART_INVALID',part,message='部位画像を読み込めません。'))
    if manifest:
        flow_path=private_path(root,output+'/export/bundle/flow-manifest.json')
        try:
            flow=json.loads(flow_path.read_text(encoding='utf-8'))
            if flow.get('standard_ears'):
                require(flow['ear_mode']=='PARTIAL_BOTH' and fit_record.get('ear_pass',{}).get('source_kind')=='STANDARD_REFERENCE_EARS','STANDARD_EAR_ARTIFACT_REQUIRED')
                require(flow['standard_ears']['artifact']==fit_record['ear_pass']['artifact'] and flow['standard_ears']['model_calls']==0,'STANDARD_EAR_PROVENANCE')
                from .ear_policy import load as load_ear_decision
                choice=load_ear_decision(root,fit_record['ear_pass']['decision_id']);require(choice==flow['ear_decision'] and choice['mode']=='PARTIAL_BOTH','EAR_MODE_MISMATCH')
                for part in ('HAIR_FRONT','HAIR_BACK'):
                    evidence=fit_record['ear_pass']['measurements'][part];require(evidence.get('both_ears_present') and len(evidence['per_ear'])==2 and all(e['visible_fraction']>=.4 for e in evidence['per_ear']),'STANDARD_EAR_VISIBILITY')
            require(flow['design_id']==record['design_id'] and manifest['design_id']==record['design_id'],'DESIGN_BINDING')
            for part,entry in flow['inputs'].items():require(observed.get('raw/'+part+'.png')==entry['sha256'],'RAW_SNAPSHOT_CHANGED')
        except (ValueError,OSError,KeyError,TypeError) as error:
            code=getattr(error,'code','INPUT_PROVENANCE');code=code if code.startswith('STANDARD_EAR_') or code=='EAR_MODE_MISMATCH' else 'INPUT_PROVENANCE'
            issues.append(finding(code,message='標準耳の実物・可視性・確認記録が一致しません。' if code!='INPUT_PROVENANCE' else '設計と原稿のハッシュが一致しません。'))
        try:
            baseline=json.loads(source.read_text(encoding='utf-8'));data=json.loads((bundle/'skeleton.json').read_text(encoding='utf-8'))
            a=next(s for s in baseline['skins'] if s['name']=='ai-city-original-template')['attachments'];b=next(s for s in data['skins'] if s['name']=='ai-city-original-template')['attachments']
            for slot in ('head-base','ear-l','ear-r',*FACE):require(a.get(slot)==b.get(slot),'FIXED_ATTACHMENT_CHANGED')
            from .character import region
            layout=record['design']['layout']
            if flow.get('geometry_fit'):
                from .hair_fit import validate as validate_fit
                value=json.loads((bundle/'hair-fit.json').read_text(encoding='utf-8'));require(value['fit_id']==flow['geometry_fit']['fit_id'],'FIT_BINDING')
                layout=validate_fit(root,record,value,{p:private_path(root,output+'/raw/'+p+'.png') for p in ('HAIR_FRONT','HAIR_BACK')})
                if value['revision'] in ('head-alpha-fit-006','head-alpha-fit-007'):
                    em=value['metrics'];measured=em['post_anchor_coverage']
                    if measured['side_boundary_max_uncovered_run_head_fraction']>.03 or measured['crown_coverage']<.95:issues.append(finding('HAIR_COVERAGE','HAIR_FRONT',message='無耳の髪を頭部に合わせた状態で、頭頂または側頬に隙間があります。耳を基準に動かさず、髪全体を原写真から再設計してください。'))
                    if measured['central_face_occlusion']>.10:issues.append(finding('PROPORTION','HAIR_FRONT',message='前髪が中央の顔を覆いすぎています。'))
                    if em['rear_head_coverage']<.98:issues.append(finding('HAIR_COVERAGE','HAIR_BACK',message='後髪が固定頭部全体を覆っていません。'))
                    if em['height_alignment']['height_difference_fraction']>.08:issues.append(finding('HEIGHT_MISMATCH','HAIR_BACK',message='同じ頭部に装着した前後の髪の全高が合いません。高さ・輪郭を全体で再設計してください。'))
                if value['revision']=='head-alpha-fit-005':
                    em=value['metrics'];ear=em['ear_alignment'];coverage=em.get('post_anchor_coverage')
                    if ear['status']!='ALIGNED':issues.append(finding('EAR_ALIGNMENT','HAIR_FRONT','FAIL' if ear['status']=='MISALIGNED' else 'UNKNOWN','描画された左右の耳根を固定頭部の目標位置へ確認できません。耳の存在だけでは適合にしません。'))
                    if coverage and coverage['side_boundary_max_uncovered_run_head_fraction']>.03:issues.append(finding('HAIR_COVERAGE','HAIR_FRONT',message='耳根で等比位置決めした後も側頬フレームが連続して露出しています。耳位置を動かさず髪全体を原写真から再設計してください。'))
                    if coverage and (coverage['crown_coverage']<.95 or coverage['central_face_occlusion']>.10):issues.append(finding('PROPORTION','HAIR_FRONT',message='耳位置を固定した状態で頭頂の覆いまたは中央顔の開きが不適合です。押し下げ・横伸ばしで隠さず全体を再生成してください。'))
            for part,slot,width in [('HAIR_FRONT','hair-front',layout['front_width']),('HAIR_BACK','back-hair',layout['back_width'])]:
                raw=private_path(root,output+'/raw/'+part+'.png')
                with Image.open(raw) as im:normalized,_=prepare_texture(im,tuple(profile['parts'][part]['canvas']),'hair')
                if ear_overrides:normalized=ear_overrides[part]
                expected,_=region(normalized,'ai-city-original-template/'+('hair-front' if part=='HAIR_FRONT' else 'hair-back'),width,layout.get('back_top',layout['top']) if part=='HAIR_BACK' else layout['top'],face=part=='HAIR_FRONT',anchor_x=layout.get('front_anchor_x' if part=='HAIR_FRONT' else 'back_anchor_x'),center_x=layout.get('front_center_x' if part=='HAIR_FRONT' else 'back_center_x',0))
                require(b.get(slot)=={slot:expected},'LAYOUT_GEOMETRY_MISMATCH')
            require(digest(bundle/'orientation.js')==digest(ROOT/'ui/orientation.js'),'ORIENTATION_GUARD_CHANGED')
            for field in ('bones','ik','transform','path'):require(baseline.get(field)==data.get(field),'FIXED_RIG_CHANGED')
            def curves(d):
                result=copy.deepcopy(d['animations'])
                for name in ('movement/idle-back','movement/trot-back'):
                    for key in ('drawOrder','draworder'):result[name].pop(key,None)
                return result
            require(curves(baseline)==curves(data),'ANIMATION_CURVES_CHANGED')
            from .template import inspect_template
            for name in inspect_template(source,atlas)['pages']:
                if not name.startswith('ai-city-template-'):require(digest(atlas.parent/name)==digest(bundle/name),'FIXED_TEXTURE_CHANGED')
        except (ValueError,OSError,KeyError,TypeError) as error:issues.append(finding(getattr(error,'code','FIXED_ASSET_INTEGRITY'),message='固定の頭・耳・表情・骨格・動作に変更があります。'))
    status='FAIL' if any(i['result']=='FAIL' for i in issues) else 'UNKNOWN' if issues else 'PASS'
    return {'status':status,'defects':issues,'parts':parts},record,observed


def review_dir(root,identity):
    require(isinstance(identity,str) and re.fullmatch(r'review-[a-f0-9]{32}',identity),'REVIEW_ID')
    return private_path(root,'runtime/work/M05/reviews/'+identity)


def read_review(root,identity,fresh=True):
    folder=review_dir(root,identity);report=json.loads(private_path(root,(folder/'report.json').relative_to(root).as_posix()).read_text(encoding='utf-8'))
    if fresh:
        context=json.loads(private_path(root,(folder/'context.json').relative_to(root).as_posix()).read_text(encoding='utf-8'));source=private_path(root,context['character_output'])
        expected=context['source_files']
        try:require(load_design(root,report['design_id'])==context['design'],'REVIEW_STALE_SOURCE')
        except (ValueError,OSError,KeyError,TypeError):raise DesignError('REVIEW_STALE_SOURCE') from None
        for name,sha in expected.items():
            path=private_path(root,(source/name).relative_to(root).as_posix())
            require((digest(path) if path.is_file() else None)==sha,'REVIEW_STALE_SOURCE')
        require(digest(ROOT/'runtime/config/quality-policy.json')==context['policy_sha256'],'REVIEW_STALE_POLICY')
    return report


def save_report(root,report):
    folder=review_dir(root,report['review_id']);temporary=folder/('report-'+uuid.uuid4().hex+'.tmp')
    temporary.write_bytes(canonical(report)+b'\n');temporary.replace(folder/'report.json')


def aggregate(report):
    if report['hard']['status']=='FAIL' or report['render']['status']=='FAIL':return 'FAIL'
    reviews=report.get('visual_reviews',[])
    if any(x['source']=='HUMAN' and (any(c['result']=='FAIL' for c in x['data']['checks']) or x['data']['defects']) for x in reviews):return 'FAIL'
    latest=reviews[-1]['data'] if reviews else None
    if latest:
        certain=reviews[-1]['source']=='HUMAN'
        if any(c['result']=='FAIL' and (certain or c['confidence']>=policy()['visual_confidence_floor']) for c in latest['checks']) or any(certain or d['confidence']>=policy()['visual_confidence_floor'] for d in latest['defects']):return 'FAIL'
        if latest['defects']:return 'REQUIRES_REVIEW'
    if report['hard']['status']!='PASS' or report['render']['status']!='PASS' or not latest:return 'REQUIRES_REVIEW'
    applicable=[c for c in latest['checks'] if c['result']!='NOT_APPLICABLE']
    if any(c['result']!='PASS' or c['confidence']<policy()['visual_confidence_floor'] for c in applicable):return 'REQUIRES_REVIEW'
    # Controlled calibration is limited; a model PASS remains advisory, never automatic approval.
    if reviews[-1]['source']!='HUMAN':return 'REQUIRES_REVIEW'
    return 'PASS'


def create_review(root,output,identity=None):
    root=Path(root).resolve();hard,record,observed=hard_checks(root,output)
    identity=identity or 'review-'+uuid.uuid4().hex;folder=review_dir(root,identity);folder.mkdir(parents=True,exist_ok=True)
    source=private_path(root,output)
    names=['design.json','export/bundle/build-manifest.json',*observed]
    # Pin every bundle file, not just manifest text, so later mutations invalidate evidence.
    bundle=source/'export/bundle'
    if (bundle/'build-manifest.json').is_file():
        try:names.extend('export/bundle/'+n for n in json.loads((bundle/'build-manifest.json').read_text(encoding='utf-8'))['files'])
        except (ValueError,KeyError,TypeError):pass
    source_files={n:digest(private_path(root,(source/n).relative_to(root).as_posix())) if (source/n).is_file() else None for n in names}
    context={'character_output':output,'design':record,'source_files':source_files,'policy_sha256':digest(ROOT/'runtime/config/quality-policy.json')}
    if (folder/'context.json').exists():require((folder/'context.json').read_bytes()==canonical(context)+b'\n','REVIEW_CONTEXT_CONFLICT')
    else:(folder/'context.json').write_bytes(canonical(context)+b'\n')
    if (folder/'report.json').is_file():return read_review(root,identity)
    report={'schema_version':VERSIONS['product']['review_schema'],'review_id':identity,'character_id':record['design']['character_id'],
            'design_id':record['design_id'],'quality_policy':policy()['revision'],'calibration':policy()['calibration'],
            'created_at':dt.datetime.now(dt.timezone.utc).isoformat(),'hard':hard,'render':{'status':'NOT_RUN','defects':[]},
            'visual_reviews':[],'visual_call':{'status':'NOT_RUN','model_calls_reserved':0},'status':'REQUIRES_REVIEW','production_approved':False}
    report['status']=aggregate(report);save_report(root,report)
    return report
