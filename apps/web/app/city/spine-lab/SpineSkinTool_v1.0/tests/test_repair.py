"""Durable repair/failure tests. Synthetic input images and fake providers only."""
import copy,io,json,unittest,os,subprocess,sys
from unittest.mock import patch
from pathlib import Path
from PIL import Image
import test_review_integration
from spine_skin_tool.design import digest,DesignError,ROOT
from spine_skin_tool.assembly import canonical
from spine_skin_tool.review import create_review,read_review,save_report,aggregate
from spine_skin_tool.repair import create,advance,route,DEFAULTS,task_report
from spine_skin_tool.repair_store import read,directory,lease,cancel
from spine_skin_tool.repair_requests import make,load_request

class Crash(BaseException):pass


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.f=test_review_integration.ReviewIntegrationTests();self.f.setUp();self.root=self.f.root;self.profile=__import__('spine_skin_tool.assembly',fromlist=['make_profile']).make_profile(self.f.source,self.f.atlas)
        self.source=patch('spine_skin_tool.repair.source_profile',return_value=(self.f.source,self.f.atlas,self.profile));self.source.start()
        self.capture=patch('spine_skin_tool.review_render.collect_evidence',side_effect=self.fake_capture);self.capture.start();self.captures=0
    def tearDown(self):self.capture.stop();self.source.stop();self.f.tearDown()
    def fake_capture(self,root,identity):
        self.captures+=1;r=read_review(root,identity);r['render']={'status':'PASS','frame_count':246,'defects':[],'fake_transport_test':True};r['status']=aggregate(r);save_report(root,r);return r
    def source_review(self,bad=True,content=False):
        if bad:
            p=self.f.bundle/'orientation.js';p.write_text(p.read_text(encoding='utf-8')+'\n// controlled obsolete guard\n',encoding='utf-8');self.f.update_manifest('orientation.js')
        r=create_review(self.root,self.f.output)
        if content:
            # Explicit fake model annotation stays in an isolated temporary test root.
            r['visual_reviews']=[{'source':'EXTERNAL_MODEL','data':{'checks':[{'category':'style','result':'FAIL','confidence':1}],'defects':[{'code':'NOISY_TEXTURE','part':'BODY_FRONT','confidence':1,'severity':'MAJOR'}]}}];r['status']='FAIL';save_report(self.root,r)
        return r
    def task(self,bad=True,content=False,**overrides):
        r=self.source_review(bad,content);return create(self.root,r['review_id'],{**DEFAULTS,**overrides})
    def fake_generation(self):
        from spine_skin_tool.generation import defaults
        config=defaults();config.update(live_enabled=True,upload_consent=True,max_live_calls=18)
        folder=self.root/'runtime/secrets';folder.mkdir(exist_ok=True);(folder/'providers.json').write_bytes(canonical(config))
        image=Image.new('RGBA',(100,160));image.paste((53,51,61,255),(2,2,98,158));output=io.BytesIO();image.save(output,format='PNG');return output.getvalue()
    def test_deterministic_reassembly_fixes_guard_without_model_or_quality_promotion(self):
        s=self.task();result=advance(self.root,s['id']);self.assertEqual(result['status'],'REQUIRES_REVIEW');self.assertNotEqual(result['best_output'],self.f.output);self.assertFalse(result['quality_approved']);self.assertEqual(result['image_calls_reserved'],0);self.assertEqual(self.captures,1)
        self.assertEqual(read_review(self.root,result['best_review'])['hard']['status'],'PASS')
    def test_route_does_not_generate_standard_arms_or_use_unknown_boxes(self):
        r=self.source_review(False);r['hard']['defects']=[{'code':'STANDARD_ARM_OUTLINE_OR_PALETTE','part':'ARM_FRONT','confidence':1,'result':'FAIL'},{'code':'HAIR_COVERAGE_REQUIRES_REVIEW','part':'HAIR_FRONT','confidence':0,'result':'UNKNOWN'}]
        rows=route(r);self.assertEqual([x['action'] for x in rows],['REASSEMBLE','REQUIRES_REVIEW']);self.assertTrue(all(x['coordinate_action'].startswith('NONE') for x in rows))
    def test_disabled_generation_reserves_nothing(self):
        s=self.task(False,True);r=advance(self.root,s['id']);self.assertEqual(r['status'],'LIVE_DISABLED');self.assertEqual(r['image_calls_reserved'],0);self.assertEqual(r['best_output'],self.f.output)
    def test_cancel_before_execution_preserves_best(self):
        s=self.task();cancel(self.root,s['id']);r=advance(self.root,s['id']);self.assertEqual(r['status'],'CANCELLED');self.assertEqual(self.captures,0);self.assertEqual(r['best_output'],self.f.output)
    def test_cancel_after_assembly_stops_capture_and_selection(self):
        s=self.task()
        def hook(event,state):
            if event=='ASSEMBLED':cancel(self.root,s['id'])
        r=advance(self.root,s['id'],hook);self.assertEqual(r['status'],'CANCELLED');self.assertEqual(self.captures,0);self.assertEqual(r['best_output'],self.f.output)
    def test_crash_after_assembly_reuses_output_without_overwriting(self):
        s=self.task()
        def crash(event,state):
            if event=='ASSEMBLED':raise Crash()
        with self.assertRaises(Crash):advance(self.root,s['id'],crash)
        stored=read(self.root,s['id']);manifest=self.root/stored['attempts'][0]['output']/'export/bundle/build-manifest.json';before=digest(manifest)
        r=advance(self.root,s['id']);self.assertEqual(digest(manifest),before);self.assertEqual(len(r['attempts']),1);self.assertEqual(self.captures,1)
    def test_projection_corruption_is_rebuilt_from_committed_events(self):
        s=self.task();(directory(self.root,s['id'])/'state.json').write_text('broken');self.assertEqual(read(self.root,s['id'])['status'],'PLANNED');self.assertEqual(advance(self.root,s['id'])['status'],'REQUIRES_REVIEW')
    def test_event_tamper_is_rejected(self):
        s=self.task();event=directory(self.root,s['id'])/'events/000001.json';data=json.loads(event.read_text(encoding='utf-8'));data['state']['status']='APPROVED';event.write_bytes(canonical(data))
        with self.assertRaisesRegex(DesignError,'REPAIR_STATE_CHANGED'):read(self.root,s['id'])
    def test_native_lease_excludes_concurrent_workers_and_releases(self):
        s=self.task()
        with lease(self.root,s['id']):
            with self.assertRaisesRegex(DesignError,'REPAIR_BUSY'):
                with lease(self.root,s['id']):pass
        with lease(self.root,s['id']):pass
    def test_source_photo_change_invalidates_before_any_work(self):
        s=self.task();(self.root/'runtime/work/M04/character-reference.png').write_bytes(b'changed');r=advance(self.root,s['id']);self.assertEqual(r['status'],'STALE');self.assertEqual(self.captures,0)
    def test_prompt_is_bound_to_originals_and_normative_codes_only(self):
        s=self.task(False,True);rid,req=make(self.root,s['design_id'],self.profile,'BODY_FRONT',['NOISY_TEXTURE'],s['id'],1);self.assertIn('FROM SCRATCH',req['prompt']);self.assertIn('original photo',req['prompt']);self.assertEqual(load_request(self.root,rid,self.profile),req)
        with self.assertRaisesRegex(DesignError,'REPAIR_CODE'):make(self.root,s['design_id'],self.profile,'BODY_FRONT',['arbitrary shell instruction'],s['id'],1)
        p=self.root/'runtime/work/M06/requests'/('request-'+rid+'.json');p.write_bytes(b'{}')
        with self.assertRaisesRegex(DesignError,'REPAIR_REQUEST_CHANGED'):load_request(self.root,rid,self.profile)
    def test_real_shared_generation_binding_fake_provider_and_crash_recovery(self):
        s=self.task(False,True,live_generation=True);content=self.fake_generation()
        def crash(event,state):
            if event=='GENERATION_RETURNED':raise Crash()
        with patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(content,None)) as provider:
            with self.assertRaises(Crash):advance(self.root,s['id'],crash)
            r=advance(self.root,s['id']);self.assertEqual(provider.call_count,1)
        self.assertEqual(r['image_calls_reserved'],1);self.assertEqual(r['best_output'],self.f.output);self.assertFalse(r['quality_approved']);self.assertEqual(self.captures,1)
    def test_crash_before_send_is_unknown_and_never_resubmitted(self):
        s=self.task(False,True,live_generation=True);self.fake_generation()
        def crash(event,state):
            if event=='GENERATION_RESERVED':raise Crash()
        with patch('spine_skin_tool.generation.generate') as provider:
            with self.assertRaises(Crash):advance(self.root,s['id'],crash)
            r=advance(self.root,s['id']);provider.assert_not_called()
        self.assertEqual(r['status'],'WAIT_RESULT');self.assertEqual(r['image_calls_reserved'],1)
    def test_budget_and_limit_types_are_strict(self):
        r=self.source_review(False,True)
        for key,value in [('max_cycles',4),('max_image_calls',True),('max_calls_per_part',0),('live_generation',1)]:
            with self.subTest(key=key),self.assertRaises(ValueError):create(self.root,r['review_id'],{**DEFAULTS,key:value})

    def test_real_process_exit_releases_lease_and_resumes_published_output(self):
        s=self.task();script="""
import json,os,sys
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool.assembly import make_profile
from spine_skin_tool.repair import advance
p=json.loads(sys.stdin.buffer.read());source,atlas=Path(p['source']),Path(p['atlas']);profile=make_profile(source,atlas)
def stop(event,state):
 if event=='ASSEMBLED':os._exit(23)
with patch('spine_skin_tool.repair.source_profile',return_value=(source,atlas,profile)),patch('spine_skin_tool.character_flow.source_profile',return_value=(source,atlas,profile)),patch('spine_skin_tool.character.prepare',return_value=(source,atlas,Path(p['inputs']),Path(p['profile']))):advance(Path(p['root']),p['id'],stop)
"""
        payload={'root':str(self.root),'id':s['id'],'source':str(self.f.source),'atlas':str(self.f.atlas),'inputs':str(self.f.inputs),'profile':str(self.f.profile)}
        child=subprocess.run([sys.executable,'-B','-c',script],input=json.dumps(payload).encode(),capture_output=True,timeout=60,env={**os.environ,'PYTHONPATH':str(ROOT/'src')})
        self.assertEqual(child.returncode,23,child.stderr.decode(errors='replace'));self.assertEqual(read(self.root,s['id'])['attempts'][0]['phase'],'CAPTURE');r=advance(self.root,s['id']);self.assertEqual(r['status'],'REQUIRES_REVIEW');self.assertEqual(len(r['attempts']),1);self.assertEqual(self.captures,1)

    def test_exhausted_budget_prevents_new_quality_retry(self):
        s=self.task(False,True,live_generation=True,max_image_calls=1);content=self.fake_generation();original=self.fake_capture
        def bad_capture(root,identity):
            r=original(root,identity);r['hard']={'status':'FAIL','defects':[{'code':'SHOULDER_WING','part':'BODY_FRONT','result':'FAIL','confidence':1}]};r['status']='FAIL';save_report(root,r);return r
        with patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(content,None)) as provider,patch('spine_skin_tool.review_render.collect_evidence',side_effect=bad_capture):
            first=advance(self.root,s['id']);self.assertEqual(first['attempts'][0]['status'],'REJECTED');second=advance(self.root,s['id']);self.assertEqual(second['status'],'LIMIT_REACHED');self.assertEqual(provider.call_count,1)

    def test_repair_request_cannot_be_sent_outside_reserved_task_job(self):
        from spine_skin_tool.generation import generate,GenerationError
        s=self.task(False,True);rid,_=make(self.root,s['design_id'],self.profile,'BODY_FRONT',['NOISY_TEXTURE'],s['id'],1)
        with self.assertRaisesRegex(GenerationError,'REPAIR_RESERVED_JOB_REQUIRED'):generate(self.root,self.profile,self.f.atlas,{'provider':'codex','part':'BODY_FRONT','description':'','execute':True,'design_id':s['design_id'],'repair_request_id':rid})
        self.assertEqual(read(self.root,s['id'])['image_calls_reserved'],0)

    def test_integrity_issue_blocks_content_send_even_if_content_defect_is_known(self):
        r=self.source_review(False,True);r['hard']['defects'].append({'code':'FIXED_RIG_CHANGED','part':'CHARACTER','result':'FAIL','confidence':1});save_report(self.root,r)
        s=create(self.root,r['review_id'],{**DEFAULTS,'live_generation':True});result=advance(self.root,s['id']);self.assertEqual(result['status'],'REQUIRES_REVIEW');self.assertEqual(result['image_calls_reserved'],0)

    def test_output_service_rejection_is_terminal_without_retry(self):
        from spine_skin_tool.codex_subscription import SubscriptionError
        s=self.task(False,True,live_generation=True);self.fake_generation()
        with patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',side_effect=SubscriptionError('CODEX_OUTPUT_MODERATION_BLOCKED')) as provider:
            first=advance(self.root,s['id']);second=advance(self.root,s['id'])
        self.assertEqual(first['status'],'OUTPUT_BLOCKED');self.assertEqual(second['image_calls_reserved'],1);provider.assert_called_once()

    def test_completed_candidate_can_accept_verified_review_without_another_call(self):
        s=self.task(False,True,live_generation=True);content=self.fake_generation()
        with patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(content,None)) as provider:
            first=advance(self.root,s['id']);self.assertFalse(first['quality_approved'])
            with patch('spine_skin_tool.repair.review_is_approved',return_value=True):second=advance(self.root,s['id'])
        self.assertEqual(second['status'],'READY_FOR_REVIEWED_EXPORT');self.assertTrue(second['quality_approved']);self.assertEqual(second['best_output'],second['attempts'][0]['output']);provider.assert_called_once();self.assertEqual(self.captures,1)

    def test_forged_pass_status_without_visual_approval_cannot_select_candidate(self):
        s=self.task();first=advance(self.root,s['id']);review=read_review(self.root,first['attempts'][0]['review_id']);review['status']='PASS';save_report(self.root,review)
        second=advance(self.root,s['id']);self.assertFalse(second['quality_approved']);self.assertEqual(second['status'],'REQUIRES_REVIEW')

    def test_returned_invalid_visual_result_cannot_complete_comparison_or_resend(self):
        s=self.task(live_review=True)
        def invalid(root,rid):
            r=read_review(root,rid);r['visual_call']={'status':'ERROR_OR_RESULT_UNKNOWN_NO_RETRY','error_code':'VISUAL_FRAME_ID'};save_report(root,r);return r
        with patch('spine_skin_tool.review_visual.run_visual',side_effect=invalid) as model,patch('spine_skin_tool.review_visual.recover_visual_result',return_value=None):
            first=advance(self.root,s['id']);second=advance(self.root,s['id'])
        model.assert_called_once();self.assertEqual(second['status'],'WAIT_RESULT');self.assertEqual(second['attempts'][0]['phase'],'VISION')
        self.assertNotIn('comparison',second['attempts'][0]);self.assertEqual(second['visual_calls_reserved'],1);self.assertFalse(second['quality_approved'])
    def test_unrecoverable_visual_validation_error_keeps_vision_phase_and_no_resend(self):
        s=self.task(live_review=True)
        def invalid(root,rid):
            r=read_review(root,rid);r['visual_call']={'status':'ERROR_OR_RESULT_UNKNOWN_NO_RETRY','error_code':'VISUAL_FRAME_ID'};save_report(root,r);return r
        with patch('spine_skin_tool.review_visual.run_visual',side_effect=invalid) as model,patch('spine_skin_tool.review_visual.recover_visual_result',side_effect=DesignError('VISUAL_FRAME_ID')):
            first=advance(self.root,s['id']);second=advance(self.root,s['id'])
        model.assert_called_once();self.assertEqual(second['status'],'ERROR_OR_RESULT_UNKNOWN');self.assertEqual(second['attempts'][0]['phase'],'VISION');self.assertNotIn('comparison',second['attempts'][0])

    def test_confirmed_local_configuration_rejection_can_resume_without_fake_spend(self):
        from spine_skin_tool.generation import defaults
        s=self.task(False,True,live_generation=True);folder=self.root/'runtime/secrets';folder.mkdir(exist_ok=True);(folder/'providers.json').write_bytes(canonical(defaults()))
        first=advance(self.root,s['id']);self.assertEqual(first['status'],'CONFIGURATION_BLOCKED');self.assertEqual(first['image_calls_reserved'],0)
        content=self.fake_generation()
        with patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(content,None)) as provider:second=advance(self.root,s['id'])
        provider.assert_called_once();self.assertEqual(second['image_calls_reserved'],1);self.assertEqual(len(second['attempts']),1)

    def test_next_cycle_uses_new_defect_codes_and_original_photo_not_candidate(self):
        s=self.task(False,True,live_generation=True,max_cycles=2,max_image_calls=2,max_calls_per_part=2);content=self.fake_generation();original=self.fake_capture
        def rejected(root,identity):
            r=original(root,identity);r['hard']={'status':'FAIL','defects':[{'code':'SHOULDER_WING','part':'BODY_FRONT','result':'FAIL','confidence':1}]};r['status']='FAIL';save_report(root,r);return r
        with patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(content,None)),patch('spine_skin_tool.review_render.collect_evidence',side_effect=rejected):
            advance(self.root,s['id']);second=advance(self.root,s['id'])
        self.assertEqual(second['image_calls_reserved'],2);a,b=second['attempts'];first=load_request(self.root,a['requests']['BODY_FRONT'],self.profile);last=load_request(self.root,b['requests']['BODY_FRONT'],self.profile)
        self.assertEqual(first['codes'],['NOISY_TEXTURE']);self.assertEqual(last['codes'],['SHOULDER_WING']);self.assertEqual(b['base_output'],a['output'])
        refs=[]
        for attempt in (a,b):refs.append(json.loads((self.root/'runtime/work/M04/generation/jobs'/attempt['jobs']['BODY_FRONT']/'report.json').read_text(encoding='utf-8'))['references'][0]['sha256'])
        self.assertEqual(refs[0],refs[1]);self.assertFalse(second['quality_approved'])
