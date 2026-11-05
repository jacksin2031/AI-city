"""Historical012 hair/ear scope regression; staged013 is in test_head_first."""
import copy,json,unittest
from unittest.mock import patch
import test_pipeline as fixtures
from spine_skin_tool.pipeline import create,advance,DEFAULTS
from spine_skin_tool.pipeline_service import report
from spine_skin_tool.review_render import frame_issues


class HairEarsTests(unittest.TestCase):
    def setUp(self):
        from spine_skin_tool.assembly import VERSIONS
        self.legacy_workflow=patch.dict(VERSIONS['workflow'],{'revision':'photo-to-skin-shared-012','hair_fit_revision':'head-alpha-fit-005'});self.legacy_image=patch.dict(VERSIONS['models'],{'image_prompt_revision':'image-prompt-012'});self.legacy_workflow.start();self.legacy_image.start()
        self.f=fixtures.PipelineTests();self.f.setUp();self.root=self.f.root
    def tearDown(self):self.f.tearDown();self.legacy_image.stop();self.legacy_workflow.stop()
    def source(self):
        from spine_skin_tool.design import freeze_design
        from spine_skin_tool.character_service import dispatch
        draft=copy.deepcopy(self.f.design);draft['observed']['hair']='Short dark hair visible in the synthetic test description.'
        record=freeze_design(self.root,draft)
        source='runtime/work/source-with-observed-hair'
        dispatch('assemble',{'design_id':record['design_id'],'raw_directory':'runtime/work/raw','output':source},self.root)
        return source
    def test_refresh_generates_only_two_hair_parts_reuses_garments_and_hides_original_ears(self):
        source=self.source()
        png=self.f.fake_setup();s=create(self.root,{'mode':'HAIR_REFRESH','source_output':source,'limits':{**DEFAULTS,'live_generation':True,'max_repair_cycles':0}})
        from spine_skin_tool.design import load_design
        design=load_design(self.root,s['design_id'])
        self.assertNotIn('NO shine',design['design']['appearance']['hair']['description'])
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)) as generator:
            r=advance(self.root,s['id'])
        self.assertEqual(generator.call_count,2);self.assertEqual(r['parts'],['HAIR_FRONT','HAIR_BACK']);self.assertEqual(r['analysis_calls_reserved'],0)
        self.assertEqual(r['phase'],'DONE');self.assertFalse(r['quality_approved'])
        policy=json.loads((self.root/r['output']/'export/bundle/orientation-policy.json').read_text())
        self.assertEqual(policy['ear_mode'],'INTEGRATED_SMALL_EARS_IN_HAIR')
        for part in ('BODY_FRONT','BODY_BACK','LEG_FRONT','LEG_BACK'):
            self.assertEqual((self.root/r['output']/'raw'/(part+'.png')).read_bytes(),(self.root/source/'raw'/(part+'.png')).read_bytes())
        q=report(self.root,r['id']);self.assertEqual(len(q['hair_trials']),1);self.assertEqual(q['hair_trials'][0]['verdict'],'UNKNOWN')
        self.assertTrue(any(d['code']=='VISUAL_NOT_COMPLETED' for d in q['hair_trials'][0]['reasons']))
    def test_definite_hair_failure_stops_after_three_repairs_and_keeps_all_reasons(self):
        source=self.source();png=self.f.fake_setup()
        (self.root/'runtime/secrets/review.json').write_text(json.dumps({'live_enabled':True,'upload_consent':True,'max_live_calls':7,'timeout_seconds':600}))
        s=create(self.root,{'mode':'HAIR_REFRESH','source_output':source,'limits':{**DEFAULTS,'live_generation':True,'live_review':True,'max_image_calls':8,'max_visual_calls':7,'max_repair_cycles':3}})
        from spine_skin_tool.review import read_review,save_report,aggregate,policy
        calls=[]
        def fail(root,rid):
            calls.append(rid);target='HAIR_FRONT' if len(calls) in (1,2,6,7) else 'HAIR_BACK'
            r=read_review(root,rid);r['visual_reviews']=[{'source':'CODEX_SUBSCRIPTION','data':{'checks':[{'category':c,'result':'FAIL' if c=='hair_fit' else 'PASS','confidence':1,'evidence_ids':['synthetic'],'message_ja':'合成試験です。'} for c in policy()['required_visual_checks']],'defects':[{'code':'HAIR_COVERAGE','part':target,'confidence':1,'severity':'MAJOR','message_ja':'合成：側面の覆い不足。'}]}}];r['visual_call']['status']='COMPLETED_ADVISORY';r['status']=aggregate(r);save_report(root,r);return r
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)) as generator,patch('spine_skin_tool.review_visual.run_visual',side_effect=fail):r=advance(self.root,s['id'])
        self.assertEqual(generator.call_count,8);self.assertEqual(r['phase'],'DONE');self.assertFalse(r['quality_approved'])
        q=report(self.root,r['id']);self.assertEqual(len(q['hair_trials']),7);self.assertTrue(all(a['verdict']=='FAIL' for a in q['hair_trials']))
        self.assertTrue(all(any(d['code']=='HAIR_COVERAGE' for d in a['reasons']) for a in q['hair_trials']))
        from spine_skin_tool.repair_store import read
        self.assertEqual(read(self.root,r['repair_id'])['part_calls'],{'HAIR_FRONT':3,'HAIR_BACK':3})
    def test_synthetic_runtime_checks_new_ear_policy_without_changing_legacy(self):
        order=['leg-l','leg-r','body','arm-l','arm-r','ear-l','ear-r','head-base','hair-front','back-hair']
        frame={'direction':'front','frame_id':'synthetic','visible_pixels':1000,'bones':[[1,2,3,4]],'drawOrder':order,'slots':[{'name':n,'attachment':None if n in ('ear-l','ear-r','back-hair') else n} for n in order]}
        self.assertFalse(any(d['code']=='EAR_ATTACHMENT_VISIBILITY' for d in frame_issues(frame,False,True)))
        self.assertTrue(any(d['code']=='EAR_ATTACHMENT_VISIBILITY' for d in frame_issues(frame,False,False)))
        frame['slots'][5]['attachment']='ear'
        self.assertTrue(any(d['code']=='EAR_ATTACHMENT_VISIBILITY' for d in frame_issues(frame,False,True)))
    def test_rear_style_alone_cannot_spend_repaint_when_front_back_match(self):
        from spine_skin_tool.repair import route
        d={'code':'STYLE_DRIFT','part':'HAIR_BACK','confidence':1,'severity':'MAJOR'}
        check={'category':'hair_consistency','result':'PASS','confidence':1}
        r={'hard':{'defects':[]},'render':{'defects':[]},'visual_reviews':[{'source':'CODEX_SUBSCRIPTION','data':{'defects':[d],'checks':[check]}}]}
        self.assertEqual(route(r)[0]['action'],'REQUIRES_REVIEW')
        d['part']='HAIR_FRONT';self.assertEqual(route(r)[0]['action'],'REQUIRES_REVIEW')
        d.update(part='HAIR_BACK',code='HAIR_COVERAGE');self.assertEqual(route(r)[0]['action'],'REGENERATE')
        d['code']='STYLE_DRIFT';check['result']='FAIL';self.assertEqual(route(r)[0]['action'],'REQUIRES_REVIEW')
