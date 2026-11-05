"""Synthetic rule controls and held-out variants, explicitly not semantic goldens."""
import copy,json,uuid
from PIL import Image
from .design import ROOT,private_path
from .assembly import canonical
from .texture import standard_arm
from .review import check_part,policy
from .review_render import frame_issues
from .reference_assets import library_root


def synthetic_frame(direction='front'):
    back=direction=='back';middle=['arm-r','arm-l','body','skirt'] if back else ['body','skirt','arm-r','arm-l']
    order=['leg-l','leg-r',*middle,'ear-r','ear-l','head-base','back-hair','hair-front','eye-l','mouth']
    slots=[{'name':n,'attachment':None if n in (['ear-l','ear-r','hair-front','eye-l','mouth'] if back else ['back-hair']) else n} for n in order]
    return {'frame_id':'synthetic-frame','direction':direction,'visible_pixels':5000,'bones':[[0,0,1,0,0,1]],'drawOrder':order,'slots':slots}


def run_calibration(root=ROOT):
    identity='calibration-'+uuid.uuid4().hex;folder=private_path(root,'runtime/work/M05/calibration/'+identity);folder.mkdir(parents=True)
    design=json.loads((ROOT/'fixtures/synthetic/shared-design/design.json').read_text(encoding='utf-8'))
    records=[]
    for split,colors in [('development',[('#F4F0E8','#FFD3BF',.21)]),('holdout',[('#394655','#EEC4AE',.72),('#D8A6BF','#F0C6AC',.48)])]:
        for variant,(sleeve,skin,fraction) in enumerate(colors):
            with Image.open(library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images/harri/arm.png') as source:arm=standard_arm(source,{'sleeve_color':sleeve,'skin_color':skin,'sleeve_fraction':fraction})
            erased=arm.copy();pixels=erased.load();rgb=tuple(int(skin[i:i+2],16) for i in (1,3,5))
            for y in range(round(erased.height*fraction),erased.height):
                for x in range(erased.width):
                    r,g,b,a=pixels[x,y]
                    if a:pixels[x,y]=(*rgb,a)
            for name,image,expected in [('outlined',arm,False),('erased-skin-outline',erased,True)]:
                _,issues=check_part(image,'ARM_FRONT',design,arm);found=any(i['result']=='FAIL' for i in issues)
                file=f'{split}-{variant}-{name}.png';image.save(folder/file);records.append({'split':split,'case':file,'expected_defect':expected,'detected':found,'codes':[i['code'] for i in issues]})
        for direction in ['front','back','left','right']:
            base=synthetic_frame(direction)
            mutations=[('valid',base,False)]
            missing=copy.deepcopy(base)
            for s in missing['slots']:
                if s['name']==('back-hair' if direction=='back' else 'hair-front'):s['attachment']=None
            mutations.append(('missing-hair',missing,True))
            ears=copy.deepcopy(base)
            for s in ears['slots']:
                if s['name'].startswith('ear-'):s['attachment']='ear' if direction=='back' else None
            mutations.append(('wrong-ear-visibility',ears,True))
            wrong=copy.deepcopy(base);order=wrong['drawOrder'];order.remove('body');order.insert(order.index('arm-l')+(1 if direction!='back' else 0),'body')
            if direction=='back':order.remove('body');order.insert(order.index('arm-r'),'body')
            mutations.append(('wrong-arm-order',wrong,True))
            for name,frame,expected in mutations:
                codes=[x['code'] for x in frame_issues(frame,True)];records.append({'split':split,'case':direction+'-'+name,'expected_defect':expected,'detected':bool(codes),'codes':codes})
    summaries={}
    for split in ('development','holdout'):
        rows=[r for r in records if r['split']==split]
        summaries[split]={'cases':len(rows),'true_positive':sum(r['expected_defect'] and r['detected'] for r in rows),'true_negative':sum(not r['expected_defect'] and not r['detected'] for r in rows),
            'false_positive':sum(not r['expected_defect'] and r['detected'] for r in rows),'false_negative':sum(r['expected_defect'] and not r['detected'] for r in rows)}
    report={'kind':'SYNTHETIC_RULE_REGRESSION_NOT_SEMANTIC_CALIBRATION','policy':policy()['revision'],'records':records,'summary':summaries,
        'user_approved':False,'automatic_visual_pass_enabled':False,'semantic_blind_test':'NOT_VALIDATED'}
    (folder/'report.json').write_bytes(canonical(report)+b'\n');return {'output':folder.relative_to(root).as_posix(),**report}
