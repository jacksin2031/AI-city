"""Durable pipeline boundaries with synthetic photos/fake models, never live calls."""
import copy,io,json,unittest,os,subprocess,sys
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import test_review_integration
from spine_skin_tool.assembly import canonical,bundle_zip
from spine_skin_tool.design import DesignError,digest,load_design
from spine_skin_tool.pipeline import create,advance,DEFAULTS,edit_design,totals,retry_evidence,retry_unavailable
from spine_skin_tool.pipeline_store import directory,read,commit,cancel,lease
from spine_skin_tool.pipeline_service import dispatch,report,preview
from spine_skin_tool.review import read_review,save_report,aggregate

class Crash(BaseException):pass


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.f=test_review_integration.ReviewIntegrationTests();self.f.setUp();self.root=self.f.root
        from spine_skin_tool.assembly import make_profile
        source=(self.f.source,self.f.atlas,make_profile(self.f.source,self.f.atlas))
        self.sources=[patch(name,return_value=source) for name in ('spine_skin_tool.pipeline.source_profile','spine_skin_tool.repair.source_profile')]
        for p in self.sources:p.start()
        self.captures=0;self.capture=patch('spine_skin_tool.review_render.collect_evidence',side_effect=self.fake_capture);self.capture.start()
        self.design=json.loads((self.root/self.f.output/'design.json').read_text())['design']
    def tearDown(self):
        self.capture.stop()
        for p in self.sources:p.stop()
        self.f.tearDown()
    def fake_capture(self,root,rid):
        self.captures+=1;r=read_review(root,rid);r['render']={'status':'PASS','frame_count':246,'defects':[],'fake_test_only':True};r['status']=aggregate(r);save_report(root,r);return r
    def task(self,replay=True,**options):
        return create(self.root,{'mode':'REPLAY','source_output':self.f.output,'limits':{**DEFAULTS,**options}} if replay else {'mode':'GENERATE','photo':'character-reference.png','character_id':'synthetic-review','limits':{**DEFAULTS,'max_repair_cycles':0,**options}})
    def fake_setup(self):
        from spine_skin_tool.generation import defaults
        cfg=defaults();cfg.update(live_enabled=True,upload_consent=True,max_live_calls=18)
        folder=self.root/'runtime/secrets';folder.mkdir(exist_ok=True);(folder/'providers.json').write_bytes(canonical(cfg))
        image=Image.new('RGBA',(100,160));image.paste((53,51,61,255),(2,2,98,158));out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
    def fake_design(self,*args,**kwargs):return {'design':copy.deepcopy(self.design),'needs_input':False,'message_ja':'合成試験の設計です。'}
    def generated(self,hook=None,**options):
        png=self.fake_setup();s=self.task(False,live_design=True,live_generation=True,**options)
        with patch('spine_skin_tool.photo_design.execute',side_effect=self.fake_design),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)) as generator:
            r=advance(self.root,s['id'],hook)
        return r,generator.call_count

    def test_replay_exact_bytes_and_no_false_origin_or_approval(self):
        s=self.task();r=advance(self.root,s['id']);self.assertEqual(r['status'],'REQUIRES_REVIEW');self.assertEqual(self.captures,1);self.assertEqual(totals(self.root,r),{'design_calls_reserved':0,'image_calls_reserved':0,'visual_calls_reserved':0})
        self.assertEqual(bundle_zip(self.f.bundle),bundle_zip(self.root/r['output']/'export/bundle'));self.assertFalse(r['quality_approved'])
        self.assertEqual(preview(self.root,r['id'],r['best_manifest_sha256']),self.root/r['output']/'export/bundle')
    def test_disabled_photo_design_never_submits(self):
        s=self.task(False)
        with patch('spine_skin_tool.photo_design.execute') as model:r=advance(self.root,s['id'])
        model.assert_not_called();self.assertEqual(r['status'],'CONFIGURATION_BLOCKED');self.assertEqual(r['analysis_calls_reserved'],0)
    def test_transient_capture_error_retries_local_evidence_once_without_images(self):
        def capture(root,rid):
            self.captures+=1;r=read_review(root,rid)
            r['render']={'status':'ERROR' if self.captures==1 else 'PASS','frame_count':0 if self.captures==1 else 246,'defects':[]}
            r['status']=aggregate(r);save_report(root,r);return r
        s=self.task()
        with patch('spine_skin_tool.review_render.collect_evidence',side_effect=capture),patch('spine_skin_tool.generation.generate') as model:r=advance(self.root,s['id'])
        model.assert_not_called();self.assertEqual(self.captures,2);self.assertEqual(r['phase'],'DONE');self.assertEqual(len(r['superseded_reviews']),1)
    def test_persistent_capture_error_stops_before_completed_review(self):
        def capture(root,rid):
            self.captures+=1;r=read_review(root,rid);r['render']={'status':'ERROR','defects':[]};r['status']=aggregate(r);save_report(root,r);return r
        s=self.task()
        with patch('spine_skin_tool.review_render.collect_evidence',side_effect=capture),patch('spine_skin_tool.generation.generate') as model:r=advance(self.root,s['id'])
        model.assert_not_called();self.assertEqual(self.captures,2);self.assertEqual(r['phase'],'CAPTURE');self.assertEqual(r['status'],'ERROR_OR_RESULT_UNKNOWN');self.assertFalse(r['quality_approved'])
    def test_explicit_edit_freezes_same_photo_and_cannot_change_after_freeze(self):
        s=self.task(False);r=edit_design(self.root,s['id'],self.design);self.assertEqual(r['design_origin'],'USER_EDITED')
        with self.assertRaisesRegex(DesignError,'FLOW_DESIGN_ALREADY_FROZEN'):edit_design(self.root,s['id'],self.design)
        r=advance(self.root,s['id']);self.assertEqual(r['status'],'CONFIGURATION_BLOCKED');self.assertEqual(r['initial_image_calls_reserved'],0)
    def test_shared_real_generation_protocol_six_parts_and_standard_arms(self):
        r,calls=self.generated();self.assertEqual(calls,6);self.assertEqual(len(r['completed_parts']),6);self.assertEqual(r['initial_image_calls_reserved'],6);self.assertEqual(r['status'],'REQUIRES_REVIEW')
        flow=json.loads((self.root/r['output']/'export/bundle/flow-manifest.json').read_text());self.assertFalse(flow['arms']['ai_generated']);self.assertEqual(len(flow['inputs']),6);self.assertIn('geometry_fit',flow)
        for part,j in r['jobs'].items():
            job=self.root/'runtime/work/M04/generation/jobs'/j;record=json.loads((job/'report.json').read_text());self.assertEqual(record['flow_id'],r['id']);self.assertEqual(record['part'],part);self.assertEqual(record['references'][0]['role'],'original_character_photo');self.assertEqual(len(record['references']),5 if part.startswith('HAIR') else 3)
    def test_replay_preserves_generated_origins_and_the_actual_auto_fit_geometry(self):
        from spine_skin_tool.pipeline import VERSIONS
        for version in ('head-alpha-fit-001','head-alpha-fit-002'):
            with patch.dict(VERSIONS['workflow'],{'hair_fit_revision':version}):source,calls=self.generated()
            self.assertEqual(calls,6)
            s=create(self.root,{'mode':'REPLAY','source_output':source['output'],'auto_fit':False,'limits':{**DEFAULTS,'max_repair_cycles':0}})
            with patch('spine_skin_tool.generation.generate') as model:r=advance(self.root,s['id'])
            model.assert_not_called();self.assertTrue(r['inherited_geometry_fit']);self.assertEqual(r['inherited_fit_revision'],version);self.assertEqual(len(r['replay_jobs']),6)
            self.assertEqual(bundle_zip(self.root/source['output']/'export/bundle'),bundle_zip(self.root/r['output']/'export/bundle'));self.assertEqual(totals(self.root,r)['image_calls_reserved'],0)
    def test_crash_at_send_intent_stops_without_resending(self):
        s=self.task(False,live_generation=True);edit_design(self.root,s['id'],self.design);self.fake_setup()
        def hook(event,state):
            if event=='PART_RESERVED':raise Crash()
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),self.assertRaises(Crash):advance(self.root,s['id'],hook)
        with patch('spine_skin_tool.generation.generate') as generator:r=advance(self.root,s['id'])
        generator.assert_not_called();self.assertEqual(r['status'],'WAIT_RESULT');self.assertEqual(r['initial_image_calls_reserved'],1)

    def failed_part(self,code='CODEX_IMAGEGEN_UNAVAILABLE'):
        from spine_skin_tool.codex_subscription import SubscriptionError
        self.fake_setup();s=self.task(False,live_generation=True);edit_design(self.root,s['id'],self.design)
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',side_effect=SubscriptionError(code)):
            s=advance(self.root,s['id'])
        part=next(iter(s['jobs']));job=s['jobs'][part];return s,part,self.root/'runtime/work/M04/generation/jobs'/job

    def test_explicit_unavailable_retry_keeps_old_cost_and_creates_new_job_only_on_advance(self):
        s,part,folder=self.failed_part();(folder/'codex-result.json').write_bytes(canonical({'status':'UNAVAILABLE','image_path':''}));old=s['jobs'][part]
        with patch('spine_skin_tool.generation.generate_image') as model:r=retry_unavailable(self.root,s['id'])
        model.assert_not_called();self.assertEqual(r['initial_image_calls_reserved'],1);self.assertEqual(r['failed_jobs'][0]['job_id'],old);self.assertNotIn(part,r['jobs'])
        png=self.fake_setup()
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)) as model:r=advance(self.root,s['id'])
        self.assertEqual(model.call_count,6);self.assertEqual(r['initial_image_calls_reserved'],7);self.assertNotEqual(r['jobs'][part],old);self.assertEqual(len(r['completed_parts']),6)

    def test_quota_retry_preserves_unknown_result_and_reservation_and_is_bounded(self):
        s,part,folder=self.failed_part('CODEX_EXEC_FAILED_NO_RETRY');(folder/'codex-events.jsonl').write_bytes(canonical({'type':'turn.failed','error':{'message':'usage limit reached'}}))
        r=retry_unavailable(self.root,s['id']);self.assertTrue(r['failed_jobs'][0]['prior_image_result_unknown']);self.assertEqual(r['initial_image_calls_reserved'],1)
        # Current014 permits initial + three retries; prior quota reservations remain.
        r['jobs'][part]=s['jobs'][part];r['status']=s['status'];r['error_code']=s['error_code'];r['failed_jobs']*=2;r['initial_image_calls_reserved']=3;commit(self.root,r,'SYNTHETIC_THREE_ATTEMPTS')
        with patch('spine_skin_tool.generation.generate_image') as model:r=retry_unavailable(self.root,s['id'])
        model.assert_not_called();self.assertEqual(len(r['failed_jobs']),3);self.assertEqual(r['initial_image_calls_reserved'],3)
        r['jobs'][part]=s['jobs'][part];r['status']=s['status'];r['error_code']=s['error_code'];r['initial_image_calls_reserved']=4;commit(self.root,r,'SYNTHETIC_FOURTH_TERMINAL_FAILURE')
        with self.assertRaisesRegex(DesignError,'FLOW_RETRY_LIMIT'):retry_unavailable(self.root,s['id'])

    def test_legacy_quota_retry_still_rejects_a_fourth_attempt(self):
        from spine_skin_tool.assembly import VERSIONS
        from spine_skin_tool import generation
        with patch.dict(VERSIONS['workflow'],{'revision':'photo-to-skin-shared-013'}),patch.dict(generation.VERSIONS['workflow'],{'revision':'photo-to-skin-shared-013'}),patch.dict(VERSIONS['models'],{'image_prompt_revision':'image-prompt-013'}),patch.dict(generation.VERSIONS['models'],{'image_prompt_revision':'image-prompt-013'}):
            s,part,folder=self.failed_part('CODEX_EXEC_FAILED_NO_RETRY');(folder/'codex-events.jsonl').write_bytes(canonical({'type':'turn.failed','error':{'message':'usage limit reached'}}))
            r=retry_unavailable(self.root,s['id']);r['jobs'][part]=s['jobs'][part];r['status']=s['status'];r['error_code']=s['error_code'];r['failed_jobs']*=2;r['initial_image_calls_reserved']=3;commit(self.root,r,'SYNTHETIC_LEGACY_THREE_ATTEMPTS')
            with self.assertRaisesRegex(DesignError,'FLOW_RETRY_LIMIT'):retry_unavailable(self.root,s['id'])

    def test_unknown_or_moderated_or_returned_generated_result_never_allows_retry(self):
        s,part,folder=self.failed_part('CODEX_EXEC_FAILED_NO_RETRY');self.assertIsNone(retry_evidence(self.root,s))
        for status,reason in [('GENERATED','NONE'),('OUTPUT_BLOCKED','OUTPUT_MODERATION')]:
            (folder/'codex-result.json').write_bytes(canonical({'status':status,'reason_code':reason,'image_path':''}));self.assertIsNone(retry_evidence(self.root,s))
        (folder/'codex-result.json').write_bytes(canonical({'status':'UNAVAILABLE','image_path':''}));(folder/'codex-stderr.log').write_text('moderation_blocked',encoding='utf-8');self.assertIsNone(retry_evidence(self.root,s))
    def test_crash_after_returned_part_generates_each_remaining_part_once(self):
        png=self.fake_setup();s=self.task(False,live_generation=True);edit_design(self.root,s['id'],self.design)
        def hook(event,state):
            if event=='PART_RETURNED':raise Crash()
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)) as generator:
            with self.assertRaises(Crash):advance(self.root,s['id'],hook)
            r=advance(self.root,s['id']);self.assertEqual(generator.call_count,6)
        self.assertEqual(len(r['jobs']),6)
    def test_cancel_after_one_part_stops_five_remaining_and_capture(self):
        def hook(event,state):
            if event=='PART_RETURNED':cancel(self.root,state['id'])
        r,calls=self.generated(hook);self.assertEqual(calls,1);self.assertEqual(r['status'],'CANCELLED');self.assertIsNone(r['best_output']);self.assertEqual(self.captures,0)
    def test_crash_after_assembly_reuses_published_package(self):
        s=self.task()
        def hook(event,state):
            if event=='INITIAL_ASSEMBLED':raise Crash()
        with self.assertRaises(Crash):advance(self.root,s['id'],hook)
        before=digest(self.root/read(self.root,s['id'])['output']/'export/bundle/build-manifest.json');r=advance(self.root,s['id']);self.assertEqual(before,r['best_manifest_sha256']);self.assertEqual(self.captures,1)
    def test_actual_child_process_exit_releases_pipeline_lease_and_restores_output(self):
        from spine_skin_tool.design import ROOT
        s=self.task();script='''
import json,os,sys
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool.assembly import make_profile
from spine_skin_tool.pipeline import advance
p=json.loads(sys.stdin.buffer.read());source,atlas=Path(p['source']),Path(p['atlas']);profile=make_profile(source,atlas)
def die(event,state):
 if event=='INITIAL_ASSEMBLED':os._exit(29)
with patch('spine_skin_tool.pipeline.source_profile',return_value=(source,atlas,profile)),patch('spine_skin_tool.character_flow.source_profile',return_value=(source,atlas,profile)),patch('spine_skin_tool.character.prepare',return_value=(source,atlas,Path(p['inputs']),Path(p['profile']))):advance(Path(p['root']),p['id'],die)
'''
        p={'root':str(self.root),'id':s['id'],'source':str(self.f.source),'atlas':str(self.f.atlas),'inputs':str(self.f.inputs),'profile':str(self.f.profile)}
        child=subprocess.run([sys.executable,'-B','-c',script],input=json.dumps(p).encode(),capture_output=True,timeout=60,env={**os.environ,'PYTHONPATH':str(ROOT/'src')})
        self.assertEqual(child.returncode,29,child.stderr.decode(errors='replace'));self.assertEqual(read(self.root,s['id'])['phase'],'CAPTURE');r=advance(self.root,s['id']);self.assertEqual(r['status'],'REQUIRES_REVIEW');self.assertEqual(totals(self.root,r)['image_calls_reserved'],0)
    def test_design_result_pause_is_editable_no_second_analysis(self):
        s=self.task(False,live_design=True,pause_design=True)
        with patch('spine_skin_tool.photo_design.execute',side_effect=self.fake_design) as model:
            a=advance(self.root,s['id']);b=advance(self.root,s['id'])
        self.assertEqual(model.call_count,1);self.assertEqual(a['status'],b['status']);self.assertEqual(b['status'],'DESIGN_READY');self.assertIsNone(b['design_id'])
    def test_unusable_photo_result_stays_waiting_for_design_even_without_pause(self):
        s=self.task(False,live_design=True);bad=self.fake_design();bad['needs_input']=True
        with patch('spine_skin_tool.photo_design.execute',return_value=bad):advance(self.root,s['id']);r=advance(self.root,s['id'])
        self.assertEqual(r['status'],'DESIGN_READY');self.assertIsNone(r['design_id'])
    def test_missing_analysis_result_is_unknown_not_a_free_retry(self):
        s=self.task(False,live_design=True)
        def hook(event,state):
            if event=='DESIGN_RESERVED':raise Crash()
        with self.assertRaises(Crash):advance(self.root,s['id'],hook)
        with patch('spine_skin_tool.photo_design.execute') as model:r=advance(self.root,s['id'])
        model.assert_not_called();self.assertEqual(r['status'],'WAIT_RESULT');self.assertEqual(r['analysis_calls_reserved'],1)
    def test_analysis_cli_timeout_or_exit_is_persisted_unknown_and_never_resent(self):
        for error in (subprocess.TimeoutExpired('codex',600),subprocess.CalledProcessError(2,'codex')):
            s=self.task(False,live_design=True)
            with patch('spine_skin_tool.photo_design.execute',side_effect=error) as model:r=advance(self.root,s['id'])
            self.assertEqual(model.call_count,1);self.assertEqual(r['status'],'ERROR_OR_RESULT_UNKNOWN');self.assertEqual(r['analysis_calls_reserved'],1)
            with patch('spine_skin_tool.photo_design.execute') as model:resumed=advance(self.root,s['id'])
            model.assert_not_called();self.assertEqual(resumed['status'],'WAIT_RESULT');self.assertEqual(resumed['analysis_calls_reserved'],1)
    def test_replay_photo_and_raw_drift_are_explicit_stale(self):
        s=self.task();(self.root/self.f.output/'raw/BODY_FRONT.png').write_bytes(b'changed');r=advance(self.root,s['id']);self.assertEqual(r['status'],'STALE');self.assertEqual(self.captures,0)

    def test_only_frozen_design_is_independent_of_new_analysis_prompt_revision(self):
        from spine_skin_tool.pipeline import context,VERSIONS
        frozen=self.task();unfrozen=self.task(False)
        with patch.dict(VERSIONS['models'],{'design_prompt_revision':'synthetic-new-analysis'}):
            context(self.root,frozen)
            with self.assertRaisesRegex(DesignError,'FLOW_STALE_CONTRACT'):context(self.root,unfrozen)
        with patch.dict(VERSIONS['models'],{'image_prompt_revision':'synthetic-new-image'}):
            with self.assertRaises(DesignError):context(self.root,frozen)
    def test_pipeline_namespace_does_not_alias_repair_tasks(self):
        from spine_skin_tool.repair_store import read as repair_read
        s=self.task()
        with self.assertRaisesRegex(DesignError,'REPAIR_ID'):repair_read(self.root,s['id'])
        (directory(self.root,s['id'])/'state.json').write_bytes(b'bad projection');self.assertEqual(read(self.root,s['id'])['id'],s['id'])
        with lease(self.root,s['id']):
            with self.assertRaisesRegex(DesignError,'REPAIR_BUSY'):
                with lease(self.root,s['id']):pass

    def test_candidate_presentation_keeps_repair_state_separate_from_quality_approval(self):
        s=self.task();rid='repair-'+'d'*32;s['repair_id']=rid
        s['candidates']=[{'output':self.f.output,'manifest_sha256':'a'*64,'review_id':'review-'+'b'*32,'kind':'REPAIR'}];commit(self.root,s,'SYNTHETIC_REPAIR_LINK')
        for status in ('REQUIRES_REVIEW','REJECTED'):
            repair={'id':rid,'status':status,'phase':'DONE','quality_approved':False,'image_calls_reserved':0,'visual_calls_reserved':0,'attempts':[{'manifest_sha256':'a'*64,'status':status}]}
            with patch('spine_skin_tool.repair_store.read',return_value=repair):r=report(self.root,s['id'])
            self.assertEqual(r['previews'][0]['candidate_status'],status);self.assertFalse(r['quality_approved']);self.assertIsNone(r['best_output'])
    def test_cancel_before_start_keeps_original_and_runs_nothing(self):
        s=self.task();dispatch('cancel',{'id':s['id']},self.root);r=advance(self.root,s['id']);self.assertEqual(r['status'],'CANCELLED');self.assertEqual(self.captures,0)
    def test_budget_cannot_start_partial_character_if_total_is_insufficient(self):
        self.fake_setup();s=self.task(False,live_generation=True,max_image_calls=5);edit_design(self.root,s['id'],self.design)
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.generate') as model:r=advance(self.root,s['id'])
        model.assert_not_called();self.assertEqual(r['error_code'],'FLOW_IMAGE_LIMIT');self.assertEqual(r['initial_image_calls_reserved'],0)
    def test_external_generation_cannot_attach_to_unreserved_pipeline(self):
        from spine_skin_tool.generation import generate,GenerationError
        from spine_skin_tool.assembly import make_profile
        s=self.task(False,live_generation=True);s=edit_design(self.root,s['id'],self.design)
        with self.assertRaisesRegex(GenerationError,'FLOW_RESERVED_JOB_REQUIRED'):
            generate(self.root,make_profile(self.f.source,self.f.atlas),self.f.atlas,{'provider':'codex','part':'BODY_FRONT','description':'','execute':True,'design_id':s['design_id'],'flow_id':s['id']},job_id='job-'+'a'*32)
        self.assertEqual(read(self.root,s['id'])['initial_image_calls_reserved'],0)
    def test_invalid_limits_and_paths_never_create_tasks(self):
        for value in [True,-1,41]:
            with self.assertRaises(DesignError):self.task(max_image_calls=value)
        with self.assertRaises(ValueError):create(self.root,{'mode':'REPLAY','source_output':'runtime/secrets/providers.json'})
        with self.assertRaisesRegex(DesignError,'FLOW_ID'):report(self.root,'../secrets')
    def test_failed_local_capture_can_restart_with_new_review_no_model(self):
        s=self.task()
        def broken(root,rid):
            r=read_review(root,rid);r['render']={'status':'ERROR','defects':[]};save_report(root,r);return r
        with patch('spine_skin_tool.review_render.collect_evidence',side_effect=broken):a=advance(self.root,s['id'])
        self.assertEqual(a['phase'],'CAPTURE');b=advance(self.root,s['id']);self.assertNotEqual(a['review_id'],b['review_id']);self.assertIn(a['review_id'],b['superseded_reviews']);self.assertEqual(totals(self.root,b)['image_calls_reserved'],0)
    def test_forged_status_pass_without_complete_review_cannot_select_quality(self):
        r=advance(self.root,self.task()['id']);review=read_review(self.root,r['review_id']);review['status']='PASS';save_report(self.root,review)
        result=advance(self.root,r['id']);self.assertFalse(result['quality_approved']);self.assertEqual(result['status'],'REQUIRES_REVIEW')
    def test_changed_best_candidate_is_stale_in_the_browser_report(self):
        s=advance(self.root,self.task()['id']);s['quality_approved']=True;commit(self.root,s,'CONTROLLED_APPROVAL_POINTER')
        (self.root/s['best_output']/'raw/BODY_FRONT.png').write_bytes(b'changed after review')
        result=report(self.root,s['id']);self.assertEqual(result['status'],'STALE');self.assertFalse(result['quality_approved'])
    def test_current_pipeline_outputs_enter_the_shared_catalog_and_old_versions_are_hidden(self):
        from spine_skin_tool.review_service import configuration
        from spine_skin_tool.design import VERSIONS
        s=advance(self.root,self.task()['id']);self.assertIn(s['output'],[c['output'] for c in configuration(self.root)['characters']])
        with patch.dict(VERSIONS,models={**VERSIONS['models'],'image_prompt_revision':'future'}):
            self.assertNotIn(s['output'],[c['output'] for c in configuration(self.root)['characters']])
    def test_nested_repair_is_bounded_by_remaining_outer_budget(self):
        from spine_skin_tool.repair import DEFAULTS as RD
        r=advance(self.root,self.task(max_image_calls=2,max_visual_calls=1,max_repair_cycles=1)['id']);review=read_review(self.root,r['review_id'])
        review['hard']['defects']=[{'code':'STANDARD_ARM_OUTLINE_OR_PALETTE','part':'ARM_FRONT','result':'FAIL','confidence':1}];save_report(self.root,review)
        r['phase']='REPAIR';r['status']='PLANNED';commit(self.root,r,'CONTROLLED_REPAIR_INPUT')
        result=advance(self.root,r['id']);self.assertIsNotNone(result['repair_id']);self.assertLessEqual(totals(self.root,result)['image_calls_reserved'],2)
        from spine_skin_tool.repair_store import read as repair_read
        nested=repair_read(self.root,result['repair_id']);self.assertEqual(nested['limits']['max_calls_per_part'],1);self.assertEqual(nested['limits']['max_cycles'],1)
        dispatch('cancel',{'id':r['id']},self.root);self.assertTrue((self.root/'runtime/work/M06/tasks'/nested['id']/'cancel.requested').exists())
