"""仅 loopback、仅显式资源白名单的原始母版预览服务。"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
import re
from urllib.parse import urlsplit, unquote

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.template import inspect_template,digest
from spine_skin_tool.assembly import build,verify_bundle,bundle_zip,AssemblyError
from spine_skin_tool.trials import default_trial,validate_trial,create_trial,candidates,trial_request
from spine_skin_tool.generation import generate,provider_status,prepare_trial_inputs,GenerationError
from spine_skin_tool.character_service import dispatch as character_action,configuration as character_configuration
from spine_skin_tool.review_service import dispatch as review_action,configuration as review_configuration
from spine_skin_tool.repair_service import dispatch as repair_action,configuration as repair_configuration
from spine_skin_tool.pipeline_service import dispatch as flow_action,configuration as flow_configuration

class PreviewHTTPServer(ThreadingHTTPServer):
    # A baseline plus multiple character frames can enqueue >5 local image
    # connections. Set the backlog BEFORE server_bind/server_activate.
    request_queue_size=64


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--atlas',type=Path,required=True)
    parser.add_argument('--port',type=int,default=8766)
    parser.add_argument('--inspect-only',action='store_true')
    parser.add_argument('--report',type=Path)
    parser.add_argument('--parts',type=Path)
    parser.add_argument('--profile',type=Path)
    parser.add_argument('--output-root',type=Path)
    parser.add_argument('--trial-root',type=Path)
    parser.add_argument('--trial-inputs',type=Path)
    args=parser.parse_args()
    workbench=all((args.parts,args.profile,args.output_root))
    if any((args.parts,args.profile,args.output_root)) and not workbench:raise ValueError('WORKBENCH_ARGUMENTS_REQUIRED')
    if bool(args.trial_root)!=bool(args.trial_inputs) or (args.trial_root and not workbench):raise ValueError('TRIAL_ARGUMENTS_REQUIRED')
    trial_profile=json.loads(args.profile.read_text(encoding='utf-8')) if args.trial_root else None
    if args.trial_root:
        for path in (args.trial_root,args.trial_inputs):
            if not path.resolve().is_relative_to((ROOT/'runtime/work').resolve()):raise ValueError('TRIAL_PATH_OUTSIDE_WORK')
    lock=threading.Lock();state={};character_views={};repair_views={};repair_view_lock=threading.Lock()
    def load_state(source,atlas):
        report=inspect_template(source,atlas)
        if report['defects']:raise AssemblyError('TEMPLATE_INVALID')
        directory=source.resolve().parent
        bundle=verify_bundle(directory) if (directory/'build-manifest.json').is_file() else None
        report.update(build=bundle,workbench=bool(workbench and not (directory/'flow-manifest.json').is_file()),trials=bool(args.trial_root))
        report['bundle_manifest_sha256']=digest(directory/'build-manifest.json') if bundle else None
        files={'/':ROOT/'ui/index.html','/viewer.js':ROOT/'ui/viewer.js','/runtime.js':ROOT/'runtime/js/node_modules/@esotericsoftware/spine-canvas/dist/iife/spine-canvas.js','/orientation.js':directory/'orientation.js' if bundle else ROOT/'ui/orientation.js','/asset/skeleton.json':source.resolve(),'/asset/skeleton.atlas':atlas.resolve()}
        files.update({'/asset/'+name:atlas.resolve().parent/name for name in report['pages']})
        if args.trial_root:
            files.update({'/trials':ROOT/'ui/trials.html','/trials.js':ROOT/'ui/trials.js','/character-flow.js':ROOT/'ui/character-flow.js','/reviews':ROOT/'ui/review.html','/review.js':ROOT/'ui/review.js','/calibration':ROOT/'ui/calibration.html','/calibration.js':ROOT/'ui/calibration.js'})
            files.update({'/repairs':ROOT/'ui/repair.html','/repair.js':ROOT/'ui/repair.js','/acceptance':ROOT/'ui/acceptance.html','/acceptance.js':ROOT/'ui/acceptance.js'})
            files.update({'/blind-trials':ROOT/'ui/blind-trials.html','/blind-trials.js':ROOT/'ui/blind-trials.js','/timing.js':ROOT/'ui/timing.js'})
            files.update({'/characters':ROOT/'ui/pipeline.html','/pipeline.js':ROOT/'ui/pipeline.js','/hair-trials':ROOT/'ui/hair-trials.html','/hair-trials.js':ROOT/'ui/hair-trials.js'})
            files.update({'/texture-compare':ROOT/'ui/texture-compare.html','/texture-compare.js':ROOT/'ui/texture-compare.js'})
            for key,spec in trial_profile['parts'].items():
                if key=='BLANK':continue
                files['/trial/reference/'+key]=args.atlas.resolve().parent/spec['file']
                input_path=(args.trial_inputs/spec['file']).resolve()
                if not input_path.is_relative_to(args.trial_inputs.resolve()):raise AssemblyError('INPUT_PATH_ESCAPE')
                files['/trial/input/'+key]=input_path
        if bundle:files['/orientation-policy.json']=directory/'orientation-policy.json'
        return {'report':report,'files':files,'directory':directory,'bundle':bundle}
    def rebuild():
        output=args.output_root.resolve()
        if not any(output.is_relative_to(ROOT/'runtime'/area) for area in ('work','output')):raise AssemblyError('UNSAFE_OUTPUT_ROOT')
        profile=json.loads(args.profile.read_text(encoding='utf-8'))
        index=1
        while (output/f'build-{index:04d}').exists():index+=1
        destination=output/f'build-{index:04d}'
        build(args.source,args.atlas,args.parts,profile,destination)
        state.update(load_state(destination/'skeleton.json',destination/'skeleton.atlas'))
    if workbench:rebuild()
    else:state.update(load_state(args.source,args.atlas))
    baseline_state=state.copy();baseline_state['report']={**state['report'],'workbench':False,'trials':False}
    report=state['report']
    if args.report:
        destination=args.report.resolve()
        if not destination.is_relative_to(ROOT/'runtime'): raise ValueError('REPORT_OUTSIDE_RUNTIME')
        destination.parent.mkdir(parents=True,exist_ok=True)
        destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    if args.inspect_only:
        print(json.dumps({'status':report['status'],'counts':report['counts'],'defects':report['defects']})); return int(bool(report['defects']))
    if report['defects']: raise ValueError('TEMPLATE_INVALID: '+json.dumps(report['defects']))
    class Handler(BaseHTTPRequestHandler):
        def valid_host(self):return self.headers.get('Host') in (f'127.0.0.1:{args.port}',f'localhost:{args.port}')
        def do_POST(self):
            if not self.valid_host() or self.headers.get('Origin')!=f'http://{self.headers.get("Host")}' or not workbench:
                self.send_error(403);return
            if self.path=='/flow/photo' and args.trial_root:
                try:
                    from spine_skin_tool.photo_import import import_photo,MAX_BYTES
                    length=int(self.headers.get('Content-Length','0'))
                    if not 0<length<=MAX_BYTES or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type')!='application/octet-stream':raise ValueError('PHOTO_IMPORT_REQUEST')
                    result=import_photo(ROOT,self.rfile.read(length));body=json.dumps(result).encode();code=200
                except (ValueError,OSError,KeyError,TypeError) as error:
                    body=json.dumps({'code':getattr(error,'code','PHOTO_IMPORT_INVALID'),'message':'PNG・JPEG・WebP画像の形式・容量を確認してください。元の写真は上書きしません。'}).encode();code=422
                self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
            if self.path.startswith('/flow/') and args.trial_root:
                try:
                    length=int(self.headers.get('Content-Length','0'))
                    if not 0<length<=100000 or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type')!='application/json':raise ValueError('REQUEST_INVALID')
                    payload=json.loads(self.rfile.read(length),parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
                    result=flow_action(self.path.removeprefix('/flow/'),payload,ROOT,background=True);body=json.dumps(result).encode();code=200
                except (ValueError,OSError,KeyError,TypeError) as error:
                    body=json.dumps({'code':getattr(error,'code','FLOW_INVALID'),'message':'入力・元写真・利用設定・試験上限を確認してください。以前の候補は保存されています。'}).encode();code=422
                self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
            if self.path.startswith('/repair/') and args.trial_root:
                try:
                    length=int(self.headers.get('Content-Length','0'))
                    if not 0<length<=20000 or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type')!='application/json':raise ValueError('REQUEST_INVALID')
                    payload=json.loads(self.rfile.read(length),parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
                    result=repair_action(self.path.removeprefix('/repair/'),payload,ROOT,background=True);body=json.dumps(result).encode();code=200
                except (ValueError,OSError,KeyError,TypeError) as error:body=json.dumps({'code':getattr(error,'code','REPAIR_INVALID'),'message':'返修の入力・元資料・利用設定を確認してください。以前の候補は保存されています。'}).encode();code=422
                self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
            if self.path.startswith('/review/') and args.trial_root:
                try:
                    length=int(self.headers.get('Content-Length','0'))
                    if not 0<length<=200000 or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type')!='application/json':raise ValueError('REQUEST_INVALID')
                    payload=json.loads(self.rfile.read(length),parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
                    result=review_action(self.path.removeprefix('/review/'),payload,ROOT,background=True)
                    body=json.dumps(result).encode();code=200
                except (ValueError,OSError,KeyError,TypeError) as error:
                    body=json.dumps({'code':getattr(error,'code','REVIEW_INVALID'),'message':'レビュー入力・元データ・証拠を確認してください。以前の候補は保存されています。'}).encode();code=422
                self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
            if self.path.startswith('/character/') and args.trial_root:
                try:
                    length=int(self.headers.get('Content-Length','0'))
                    if not 0<length<=65536 or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type')!='application/json':raise ValueError('REQUEST_INVALID')
                    payload=json.loads(self.rfile.read(length),parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
                    with lock:
                        result=character_action(self.path.removeprefix('/character/'),payload,ROOT)
                        if self.path=='/character/assemble':
                            directory=ROOT/result['bundle']
                            current=load_state(directory/'skeleton.json',directory/'skeleton.atlas');state.update(current)
                            token=result['zip_sha256'];character_views[token]=current
                            result['preview_url']='/character-view/'+token+'/'
                    body=json.dumps(result).encode();code=200
                except (ValueError,OSError,KeyError,TypeError) as error:
                    body=json.dumps({'code':getattr(error,'code','CHARACTER_INVALID'),'message':'設計書・写真・入力素材を確認してください。以前の候補は保存されています。'}).encode();code=422
                self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
            if self.path=='/generation/run' and args.trial_root:
                try:
                    length=int(self.headers.get('Content-Length','0'))
                    if not 0<length<=65536 or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type')!='application/json':raise GenerationError('REQUEST_INVALID')
                    payload=json.loads(self.rfile.read(length),parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
                    result=generate(ROOT,trial_profile,args.atlas.resolve(),payload)
                    body=json.dumps(result).encode();code=200
                except (ValueError,OSError,KeyError,TypeError) as error:
                    body=json.dumps({'message':'生成設定・入力・利用枠を確認してください。前の候補は保存されています。','code':error.code if isinstance(error,GenerationError) else 'GENERATION_INVALID'}).encode();code=422
                self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
            if self.path.startswith('/trial/') and args.trial_root:
                try:
                    length=int(self.headers.get('Content-Length','0'))
                    if not 0<length<=65536 or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type')!='application/json':raise ValueError('REQUEST_INVALID')
                    payload=json.loads(self.rfile.read(length),parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
                    with lock:
                        if self.path=='/trial/request':result=trial_request(validate_trial(payload,trial_profile),trial_profile)
                        elif self.path=='/trial/build':
                            index=1
                            while (args.trial_root/f'candidate-{index:04d}').exists():index+=1
                            if index>9999:raise ValueError('TRIAL_LIMIT')
                            name=f'candidate-{index:04d}';directory=args.trial_root/name
                            result=create_trial(args.source,args.atlas,args.trial_inputs,trial_profile,payload,directory)
                            current=load_state(directory/'bundle/skeleton.json',directory/'bundle/skeleton.atlas')
                            state.update(current);result={'id':name,'report':result}
                        elif self.path=='/trial/activate':
                            if not isinstance(payload,dict) or set(payload)!={'id'} or not isinstance(payload['id'],str) or not re.fullmatch(r'candidate-\d{4}',payload['id']):raise ValueError('CANDIDATE_INVALID')
                            directory=(args.trial_root/payload['id']).resolve()
                            if not directory.is_relative_to(args.trial_root.resolve()) or not (directory/'report.json').is_file():raise ValueError('CANDIDATE_INVALID')
                            state.update(load_state(directory/'bundle/skeleton.json',directory/'bundle/skeleton.atlas'));result={'id':payload['id']}
                        elif self.path=='/trial/generated-build':
                            if not isinstance(payload,dict) or set(payload)!={'id','config'}:raise ValueError('REQUEST_KEYS')
                            config=validate_trial(payload['config'],trial_profile)
                            imported=prepare_trial_inputs(ROOT,trial_profile,args.atlas.resolve(),args.trial_inputs,payload['id'])
                            index=1
                            while (args.trial_root/f'candidate-{index:04d}').exists():index+=1
                            if index>9999:raise ValueError('TRIAL_LIMIT')
                            name=f'candidate-{index:04d}';directory=args.trial_root/name
                            report=create_trial(args.source,args.atlas,imported,trial_profile,config,directory)
                            provenance=json.loads((imported/'generation-provenance.json').read_text(encoding='utf-8'))
                            report.update(model_calls=provenance['record']['model_calls_reserved'],generation=provenance)
                            (directory/'report.json').write_text(json.dumps(report,ensure_ascii=False),encoding='utf-8')
                            current=load_state(directory/'bundle/skeleton.json',directory/'bundle/skeleton.atlas');state.update(current)
                            result={'id':name,'report':report}
                        else:raise ValueError('ENDPOINT_INVALID')
                    body=json.dumps(result).encode();code=200
                except (ValueError,OSError,KeyError,TypeError):body=b'{"message":"\xe8\xa9\xa6\xe9\xa8\x93\xe8\xa8\xad\xe5\xae\x9a\xe3\x81\xa8\xe5\x85\xa5\xe5\x8a\x9bPNG\xe3\x82\x92\xe7\xa2\xba\xe8\xaa\x8d\xe3\x81\x97\xe3\x81\xa6\xe3\x81\x8f\xe3\x81\xa0\xe3\x81\x95\xe3\x81\x84\xe3\x80\x82"}';code=422
                self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
            if self.path!='/rebuild':self.send_error(403);return
            if self.headers.get('Content-Length','0')!='0' or self.headers.get('Transfer-Encoding'):
                self.send_error(400);return
            with lock:
                try:rebuild();body=b'{"status":"REBUILT"}';code=200
                except (ValueError,OSError):body=b'{"status":"FAILED_PREVIOUS_BUILD_PRESERVED"}';code=422
            self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
        def do_GET(self):
            if not self.valid_host():self.send_error(403);return
            path=unquote(urlsplit(self.path).path)
            blind=re.fullmatch(r'/blind-display/(blind-[a-f0-9]{32})/(snapshot|photo/([1-8])/([a-f0-9]{64})\.png|part/([1-8])/((?:HAIR|BODY|LEG|SKIRT)_(?:FRONT|BACK))/([a-f0-9]{64})\.png|head/([1-8])/([a-f0-9]{64})\.png)',path)
            if blind and args.trial_root:
                try:
                    from spine_skin_tool import blind_display
                    if blind.group(2)=='snapshot':body=json.dumps(blind_display.snapshot(ROOT,blind.group(1),follow_current='archive=1' not in urlsplit(self.path).query.split('&'))).encode();mime='application/json'
                    elif blind.group(3):body=blind_display.photo(ROOT,blind.group(1),int(blind.group(3)),blind.group(4)).read_bytes();mime='image/png'
                    elif blind.group(8):body=blind_display.head_image(ROOT,blind.group(1),int(blind.group(8)),blind.group(9)).read_bytes();mime='image/png'
                    else:body=blind_display.part_image(ROOT,blind.group(1),int(blind.group(5)),blind.group(6),blind.group(7)).read_bytes();mime='image/png'
                except (ValueError,OSError,KeyError,TypeError):self.send_error(409);return
                self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body);return
            if path=='/acceptance/report' and args.trial_root:
                try:
                    from spine_skin_tool.acceptance import report as acceptance_report
                    body=json.dumps(acceptance_report(ROOT)).encode()
                except (ValueError,OSError,KeyError,TypeError):self.send_error(409);return
                self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body);return
            display=re.fullmatch(r'/hair-display/(?:batch/([a-z0-9-]{1,40})|(flow-[a-f0-9]{32})/(snapshot|texture/([a-f0-9]{64})/(HAIR_FRONT|HAIR_BACK)|job/(job-[a-f0-9]{32})/(HAIR_FRONT|HAIR_BACK)))',path)
            if display and args.trial_root:
                try:
                    from spine_skin_tool import trial_display
                    if display.group(1):body=json.dumps(trial_display.batch(ROOT,display.group(1))).encode();mime='application/json'
                    elif display.group(3)=='snapshot':body=json.dumps(trial_display.snapshot(ROOT,display.group(2))).encode();mime='application/json'
                    elif display.group(4):body=trial_display.texture(ROOT,display.group(2),display.group(4),display.group(5)).read_bytes();mime='image/png'
                    else:body=trial_display.job_texture(ROOT,display.group(2),display.group(6),display.group(7)).read_bytes();mime='image/png'
                except (ValueError,OSError,KeyError,TypeError):self.send_error(409);return
                self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body);return
            comparison=re.fullmatch(r'/texture-compare/(texture-[a-f0-9]{32})/(config|image/(HAIR_FRONT|HAIR_BACK)/([0-3]))',path)
            if comparison and args.trial_root:
                try:
                    from spine_skin_tool import texture_compare
                    if comparison.group(2)=='config':body=json.dumps(texture_compare.configuration(ROOT,comparison.group(1))).encode();mime='application/json'
                    else:body=texture_compare.raw_file(ROOT,comparison.group(1),comparison.group(3),int(comparison.group(4))).read_bytes();mime='image/png'
                except (ValueError,OSError,KeyError,TypeError):self.send_error(409);return
                self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body);return
            with lock:current=state.copy()
            view_prefix=''
            pinned=re.fullmatch(r'(/character-view/([0-9a-f]{64}))(/.*)',path)
            if pinned:
                view_prefix=pinned.group(1)
                with lock:current=character_views.get(pinned.group(2))
                if current is None:self.send_error(404);return
                path=pinned.group(3)
            repair_view=re.fullmatch(r'(/repair-view/(repair-[a-f0-9]{32})/([0-9a-f]{64}))(/.*)',path)
            flow_view=re.fullmatch(r'(/flow-view/(flow-[a-f0-9]{32})/([0-9a-f]{64}))(/.*)',path)
            texture_view=re.fullmatch(r'(/texture-view/(texture-[a-f0-9]{32})/(source|v[0-3]-[0-3]))(/.*)',path) if args.trial_root else None
            if texture_view:
                try:
                    from spine_skin_tool import texture_compare
                    variant=texture_view.group(3);identity=texture_view.group(2)
                    view_prefix=texture_view.group(1);path=texture_view.group(4)
                    if path=='/download':self.send_error(404);return
                    with repair_view_lock:
                        if view_prefix not in repair_views:
                            folder=texture_compare.source_bundle(ROOT,identity) if variant=='source' else texture_compare.bundle(ROOT,identity,int(variant[1]),int(variant[3]))
                            loaded=load_state(folder/'skeleton.json',folder/'skeleton.atlas')
                            loaded['report']={**loaded['report'],'comparison_only':True,'workbench':False,'trials':False}
                            loaded['files']={p:f for p,f in loaded['files'].items() if p in ('/','/viewer.js','/runtime.js','/orientation.js','/orientation-policy.json') or p.startswith('/asset/')}
                            loaded['watched']=texture_compare.watch_inputs(ROOT,identity,folder)
                            repair_views[view_prefix]=loaded
                        current=repair_views[view_prefix]
                    texture_compare.check_watched(ROOT,current['watched'])
                    if path!='/manifest.json' and path not in current['files']:self.send_error(404);return
                except (ValueError,OSError,KeyError,TypeError):self.send_error(409);return
            if repair_view or flow_view:
                try:
                    if flow_view:
                        from spine_skin_tool.pipeline_service import preview
                        match=flow_view
                    else:
                        from spine_skin_tool.repair_service import preview
                        match=repair_view
                    folder=preview(ROOT,match.group(2),match.group(3));view_prefix=match.group(1);path=match.group(4)
                    with repair_view_lock:
                        if view_prefix not in repair_views:repair_views[view_prefix]=load_state(folder/'skeleton.json',folder/'skeleton.atlas')
                        current=repair_views[view_prefix]
                    # Decode/inspect the pinned package once, verify requested bytes on each read.
                    name=path.removeprefix('/asset/') if path.startswith('/asset/') else path.removeprefix('/')
                    expected=current['report']['build']['files'].get(name)
                    if expected:
                        from spine_skin_tool.design import digest
                        if digest(folder/name)!=expected:raise ValueError('REPAIR_VIEW_CHANGED')
                except (ValueError,OSError,KeyError,TypeError):self.send_error(409);return
            if path.startswith('/baseline/'):
                current=baseline_state;path=path[len('/baseline'):]
            if path=='/manifest.json':
                body=json.dumps(current['report']).encode(); mime='application/json'
            elif path=='/generation/status' and args.trial_root:
                try:body=json.dumps(provider_status(ROOT)).encode();mime='application/json'
                except (ValueError,OSError):self.send_error(422);return
            elif re.fullmatch(r'/generation/image/job-[a-f0-9]{32}',path) and args.trial_root:
                from spine_skin_tool.config import runtime_path
                try:body=runtime_path(ROOT,'runtime/work/M04/generation/jobs/'+path.split('/')[-1]+'/image.png').read_bytes();mime='image/png'
                except (ValueError,OSError):self.send_error(404);return
            elif path=='/review/config' and args.trial_root:
                try:body=json.dumps(review_configuration(ROOT)).encode();mime='application/json'
                except (ValueError,OSError,KeyError,TypeError):
                    body=json.dumps({'code':'REVIEW_SETTINGS','message':'レビュー設定を確認してください。自動送信は行いません。'}).encode()
                    self.send_response(422);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
            elif path=='/repair/config' and args.trial_root:
                try:body=json.dumps(repair_configuration(ROOT)).encode();mime='application/json'
                except (ValueError,OSError,KeyError,TypeError):self.send_error(422);return
            elif path=='/flow/config' and args.trial_root:
                try:body=json.dumps(flow_configuration(ROOT)).encode();mime='application/json'
                except (ValueError,OSError,KeyError,TypeError):self.send_error(422);return
            elif re.fullmatch(r'/review/calibration/bench-[a-f0-9]{32}',path) and args.trial_root:
                try:
                    from spine_skin_tool.review_benchmark import score
                    body=json.dumps(score(ROOT,path.split('/')[-1])).encode();mime='application/json'
                except (ValueError,OSError,KeyError,TypeError):self.send_error(422);return
            elif re.fullmatch(r'/review/calibration-artifact/bench-[a-f0-9]{32}/(?:case-[a-f0-9]{12}|references)\.png',path) and args.trial_root:
                try:
                    from spine_skin_tool.review_benchmark import load,folder
                    from spine_skin_tool.design import private_path,digest
                    identity,name=path.split('/')[-2:];data=load(ROOT,identity,verify_files=False)
                    if name not in data['files']:raise ValueError('BENCH_ARTIFACT')
                    target=private_path(ROOT,(folder(ROOT,identity)/name).relative_to(ROOT).as_posix())
                    if digest(target)!=data['files'][name]:raise ValueError('BENCH_ARTIFACT_CHANGED')
                    body=target.read_bytes();mime='image/png'
                except (ValueError,OSError,KeyError,TypeError):self.send_error(404);return
            elif re.fullmatch(r'/review/artifact/review-[a-f0-9]{32}/.+',path) and args.trial_root:
                try:
                    from spine_skin_tool.review import review_dir
                    from spine_skin_tool.design import private_path
                    pieces=path.split('/');identity=pieces[3];relative='/'.join(pieces[4:]);folder=review_dir(ROOT,identity)/'evidence'
                    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
                    if relative not in manifest['files']:raise ValueError('ARTIFACT_NOT_ALLOWED')
                    target=private_path(ROOT,(folder/relative).relative_to(ROOT).as_posix())
                    if not target.is_relative_to(folder):raise ValueError('ARTIFACT_PATH')
                    from spine_skin_tool.design import digest
                    if digest(target)!=manifest['files'][relative]:raise ValueError('ARTIFACT_CHANGED')
                    body=target.read_bytes();mime='image/png' if target.suffix=='.png' else 'application/json'
                except (ValueError,OSError,KeyError,TypeError):self.send_error(404);return
            elif path=='/character/config' and args.trial_root:
                body=json.dumps(character_configuration(ROOT)).encode();mime='application/json'
            elif path=='/trial/config' and args.trial_root:
                body=json.dumps({'config':default_trial(trial_profile),'profile':trial_profile,'candidates':candidates(args.trial_root)}).encode();mime='application/json'
            elif re.fullmatch(r'/trial/candidate/candidate-\d{4}',path) and args.trial_root:
                directory=(args.trial_root/path.split('/')[-1]).resolve()
                if not directory.is_relative_to(args.trial_root.resolve()) or not (directory/'report.json').is_file():self.send_error(404);return
                body=(directory/'trial.json').read_bytes();mime='application/json'
            elif path=='/download' and current['bundle']:
                try:body=bundle_zip(current['directory'])
                except (ValueError,OSError):self.send_error(409);return
                mime='application/zip'
            elif path in current['files']:
                try:
                    body=current['files'][path].read_bytes()
                    if path=='/' and view_prefix:body=body.replace(b'src="/orientation.js"',('src="'+view_prefix+'/orientation.js"').encode())
                except OSError: self.send_error(404); return
                mime='image/png' if path.endswith('.png') or path.startswith(('/trial/reference/','/trial/input/')) else 'text/javascript' if path.endswith('.js') else 'text/html' if path in ('/','/trials','/reviews','/calibration','/repairs','/characters','/texture-compare','/hair-trials','/acceptance','/blind-trials') else 'text/plain'
            else: self.send_error(404); return
            self.send_response(200); self.send_header('Content-Type',mime+('' if mime=='application/zip' else '; charset=utf-8')); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff');
            if path=='/download':self.send_header('Content-Disposition','attachment; filename="spine-runtime-bundle.zip"')
            self.end_headers(); self.wfile.write(body)
        def log_message(self,*args): pass
    with PreviewHTTPServer(('127.0.0.1',args.port),Handler) as server:
        args.port=server.server_address[1]
        print(f'http://127.0.0.1:{args.port}',flush=True)
        try: server.serve_forever()
        except KeyboardInterrupt: pass
    return 0

if __name__=='__main__': raise SystemExit(main())
