"""Synthetic persisted flows: display provenance, no live calls or private photos."""
import json,unittest,copy
from unittest.mock import patch
import test_hair_ears as fixtures
from spine_skin_tool.pipeline import create,advance,DEFAULTS
from spine_skin_tool.trial_display import snapshot,texture,job_texture,batch
from spine_skin_tool.design import digest,DesignError


class TrialDisplayTests(unittest.TestCase):
    def setUp(self):
        self.f=fixtures.HairEarsTests();self.f.setUp();self.root=self.f.root
    def tearDown(self):self.f.tearDown()
    def run_flow(self,repair=False):
        source=self.f.source();png=self.f.f.fake_setup()
        (self.root/'runtime/secrets/review.json').write_text(json.dumps({'live_enabled':True,'upload_consent':True,'max_live_calls':7,'timeout_seconds':600}))
        s=create(self.root,{'mode':'HAIR_REFRESH','source_output':source,'limits':{**DEFAULTS,'live_generation':True,'live_review':repair,'max_repair_cycles':1 if repair else 0}})
        def fail(root,rid):
            from spine_skin_tool.review import read_review,save_report,aggregate,policy
            r=read_review(root,rid);r['visual_reviews']=[{'source':'CODEX_SUBSCRIPTION','data':{'checks':[{'category':c,'result':'FAIL' if c=='hair_fit' else 'PASS','confidence':1,'evidence_ids':['synthetic'],'message_ja':'合成検査です。'} for c in policy()['required_visual_checks']],'defects':[{'code':'HAIR_COVERAGE','part':'HAIR_FRONT','confidence':1,'severity':'MAJOR','message_ja':'合成の前髪被覆不足。'}]}}];r['visual_call']['status']='COMPLETED_ADVISORY';r['status']=aggregate(r);save_report(root,r);return r
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)),patch('spine_skin_tool.review_visual.run_visual',side_effect=fail):return advance(self.root,s['id'])
    def test_pair_and_review_are_pinned_and_reads_never_dispatch_models(self):
        s=self.run_flow()
        with patch('spine_skin_tool.generation.generate_image') as image,patch('spine_skin_tool.review_visual.run_visual') as vision,patch('spine_skin_tool.pipeline.advance') as mutate:
            v=snapshot(self.root,s['id']);a=v['rows'][0]
            self.assertEqual(v['image_calls'],2);self.assertEqual(v['visual_calls'],0);self.assertFalse(v['quality_approved']);self.assertIsNone(a['user_opinion']);self.assertIsNone(a['versions']['review']);self.assertEqual(a['verdict'],'UNKNOWN')
            self.assertEqual({p['part'] for p in a['parts']},{'HAIR_FRONT','HAIR_BACK'})
            for p in a['parts']:
                self.assertEqual(digest(texture(self.root,s['id'],a['manifest_sha256'],p['part'])),p['sha256']);self.assertTrue(p['changed']);self.assertEqual(p['part_revision'],0)
            image.assert_not_called();vision.assert_not_called();mutate.assert_not_called()
    def test_front_repair_resolves_retained_back_and_keeps_each_round_review(self):
        s=self.run_flow(True);v=snapshot(self.root,s['id']);self.assertEqual(len(v['rows']),2)
        initial,repaired=v['rows'];self.assertNotEqual(initial['review_id'],repaired['review_id']);self.assertNotEqual(initial['manifest_sha256'],repaired['manifest_sha256'])
        front,back=repaired['parts'];self.assertTrue(front['changed']);self.assertEqual(front['part_revision'],1);self.assertFalse(back['changed']);self.assertEqual(back['part_revision'],0);self.assertEqual(back['sha256'],initial['parts'][1]['sha256']);self.assertEqual(back['job_id'],initial['parts'][1]['job_id']);self.assertEqual(v['image_calls'],3)
        self.assertEqual([a['verdict'] for a in v['rows']],['FAIL','FAIL'])
    def test_raw_hash_change_hides_images_and_never_borrows_prior_pass(self):
        s=self.run_flow();a=snapshot(self.root,s['id'])['rows'][0];raw=texture(self.root,s['id'],a['manifest_sha256'],'HAIR_FRONT');raw.write_bytes(raw.read_bytes()+b'changed')
        with self.assertRaises(ValueError):texture(self.root,s['id'],a['manifest_sha256'],'HAIR_FRONT')
        damaged=snapshot(self.root,s['id'])['rows'][0];self.assertEqual(damaged['parts'],[]);self.assertIsNone(damaged['preview_url']);self.assertEqual(damaged['verdict'],'UNKNOWN');self.assertIsNone(damaged['user_opinion'])
    def test_review_from_another_output_cannot_label_the_candidate(self):
        s=self.run_flow();from spine_skin_tool.pipeline_service import report
        value=copy.deepcopy(report(self.root,s['id']));value['hair_trials'][0]['candidate']['review_id']='review-'+'0'*32
        with patch('spine_skin_tool.pipeline_service.report',return_value=value):v=snapshot(self.root,s['id'])
        a=v['rows'][0];self.assertFalse(a['parts']);self.assertIsNone(a['preview_url']);self.assertEqual(a['verdict'],'UNKNOWN')
    def test_unassembled_result_never_claims_runtime_review_and_job_access_is_scoped(self):
        s=self.run_flow();from spine_skin_tool.pipeline_service import report
        value=copy.deepcopy(report(self.root,s['id']));value['hair_trials'][0]['candidate']=None
        with patch('spine_skin_tool.pipeline_service.report',return_value=value):v=snapshot(self.root,s['id'])
        a=v['rows'][0];self.assertTrue(a['unassembled']);self.assertIsNone(a['preview_url']);self.assertIsNone(a['manifest_sha256'])
        for p in a['parts']:self.assertTrue(job_texture(self.root,s['id'],p['job_id'],p['part']).is_file())
        with self.assertRaises(DesignError):job_texture(self.root,s['id'],'job-'+'0'*32,'HAIR_FRONT')
        with self.assertRaises(DesignError):texture(self.root,s['id'],'0'*64,'BODY_FRONT')
        with self.assertRaises(DesignError):batch(self.root,'../secrets')
    def test_registry_matches_photo_and_does_not_expose_private_paths(self):
        s=self.run_flow();p=self.root/'runtime/work/M07/testbatch/index.json';p.parent.mkdir();p.write_text(json.dumps({'batch':'testbatch','cases':[{'task_id':s['id'],'photo_number':0,'source':'secret-unused'}],'budget':'secret-unused'}))
        value=batch(self.root,'testbatch');self.assertEqual(value['cases'][0]['photo_number'],0);self.assertNotIn('source',value['cases'][0]);self.assertNotIn('budget',value)
        p.write_text(json.dumps({'batch':'testbatch','cases':[{'task_id':s['id'],'photo_number':9}]}))
        with self.assertRaises(DesignError):batch(self.root,'testbatch')
