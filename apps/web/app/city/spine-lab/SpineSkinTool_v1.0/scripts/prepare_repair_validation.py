"""Private M06 validation fixtures; never modifies original characters or calls a model."""
from pathlib import Path
import argparse,json,random,shutil,sys,uuid
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.design import private_path,digest
from spine_skin_tool.character_service import dispatch
from spine_skin_tool.assembly import canonical,verify_bundle
from spine_skin_tool.review import create_review
from spine_skin_tool.repair_store import atomic

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);a=p.parse_args();base=private_path(ROOT,a.source);verify_bundle(base/'export/bundle');record=json.loads((base/'design.json').read_text(encoding='utf-8'));before=digest(base/'export/bundle/build-manifest.json')
    folder=private_path(ROOT,'runtime/work/M06/validation-'+uuid.uuid4().hex);folder.mkdir(parents=True);rows={}
    # Coherent exported-package corruption, while source raw/design remain intact.
    bad=folder/'structural-source';shutil.copytree(base,bad);bundle=bad/'export/bundle'
    file=bundle/'orientation.js';file.write_text(file.read_text(encoding='utf-8')+"\n{const original=globalThis.applySpineOrientation;globalThis.applySpineOrientation=function(r,d,p){original(r,d,p);if(d!=='back')r.findSlot('ear-r').pose.setAttachment(null);};}\n",encoding='utf-8')
    file=bundle/'ai-city-template-arm.png'
    with Image.open(file) as raw:im=raw.convert('RGBA')
    px=im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,alpha=px[x,y]
            if alpha and r>g*1.1:px[x,y]=(255,211,191,alpha)
    im.save(file)
    skeleton=bundle/'skeleton.json';data=json.loads(skeleton.read_text(encoding='utf-8'));skin=next(s for s in data['skins'] if s['name']=='ai-city-original-template')['attachments'];skin['hair-front']['hair-front']['width']*=.7;atomic(skeleton,data)
    manifest=json.loads((bundle/'build-manifest.json').read_text(encoding='utf-8'))
    for name in manifest['files']:manifest['files'][name]=digest(bundle/name)
    atomic(bundle/'build-manifest.json',manifest);verify_bundle(bundle)
    review=create_review(ROOT,bad.relative_to(ROOT).as_posix());rows['structural']={'output':bad.relative_to(ROOT).as_posix(),'review_id':review['review_id']}
    # A content-only source with shared normalization and valid provenance.
    raw=folder/'noise-raw';shutil.copytree(base/'raw',raw);file=raw/'BODY_FRONT.png'
    with Image.open(file) as image:im=image.convert('RGBA')
    px=im.load();rng=random.Random(61102)
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,alpha=px[x,y]
            if alpha>200 and rng.random()<.45:px[x,y]=((245,245,245,alpha) if rng.random()<.5 else (10,10,10,alpha))
    im.save(file);output=(folder/'content-source').relative_to(ROOT).as_posix();dispatch('assemble',{'design_id':record['design_id'],'raw_directory':raw.relative_to(ROOT).as_posix(),'output':output},ROOT)
    review=create_review(ROOT,output);rows['content']={'output':output,'review_id':review['review_id']}
    assert digest(base/'export/bundle/build-manifest.json')==before
    rows['original_source']=a.source;rows['original_manifest_sha256']=before;atomic(folder/'sources.json',rows);print(json.dumps({'sources':(folder/'sources.json').relative_to(ROOT).as_posix(),**rows}))
if __name__=='__main__':main()
