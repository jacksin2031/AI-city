"""显式的本机工作台集成验收；只临时修改 M03 私有测试部件并最终恢复。"""
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import urllib.request
import urllib.error
import zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.assembly import verify_bundle

def main():
    base='http://127.0.0.1:8766'
    parts=ROOT/'runtime/work/M03/parts'
    target=parts/'ai-city-template-body.png'
    backup=target.read_bytes()
    output=ROOT/'runtime/logs/M03';output.mkdir(parents=True,exist_ok=True)
    def manifest():return json.load(urllib.request.urlopen(base+'/manifest.json'))['build']
    def rebuild(expected=200):
        request=urllib.request.Request(base+'/rebuild',data=b'',headers={'Origin':base},method='POST')
        try:
            with urllib.request.urlopen(request,timeout=30) as response:status=response.status
        except urllib.error.HTTPError as error:status=error.code
        assert status==expected,(status,expected)
    before=manifest();results={}
    try:
        with Image.open(io.BytesIO(backup)) as image:
            r,g,b,a=image.split();r=r.point(lambda value:min(255,value+35));Image.merge('RGBA',(r,g,b,a)).save(target)
        rebuild();after=manifest()
        changed=[part for part in before['parts'] if before['parts'][part]!=after['parts'][part]]
        assert changed==['BODY_FRONT'],changed
        assert before['files']['skeleton.json']==after['files']['skeleton.json']
        target.write_bytes(b'invalid png fixture');rebuild(422)
        assert manifest()==after
        results.update(changed_parts=changed,failed_rebuild_preserved_previous=True)
    finally:
        target.write_bytes(backup);rebuild()
    restored=manifest();assert restored['files']==before['files']
    data=urllib.request.urlopen(base+'/download').read();(output/'download.zip').write_bytes(data)
    destination=Path(tempfile.mkdtemp(prefix='download-reloaded-',dir=ROOT/'runtime/work/M03'))
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for info in archive.infolist():
            path=(destination/info.filename).resolve()
            assert path.is_relative_to(destination.resolve()) and not info.is_dir()
            path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(archive.read(info))
    verify_bundle(destination)
    results.update(status='PASS',restored=True,export_sha256=hashlib.sha256(data).hexdigest(),reloaded_files=len(restored['files'])+1,reloaded_directory=destination.relative_to(ROOT).as_posix())
    (output/'rebuild-flow.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print(json.dumps(results))

if __name__=='__main__':main()
