"""Synthetic reference labels/attestations are not real approvals or reliability."""
import copy,json,unittest
from pathlib import Path
from unittest.mock import patch
import test_blind_trials as fixtures
from spine_skin_tool.blind_trials import register,adjudicate,metrics
from spine_skin_tool.acceptance import attest,report
from spine_skin_tool.design import DesignError
from spine_skin_tool.pipeline import advance,edit_design
from spine_skin_tool.review import read_review,save_report,aggregate,policy,review_dir


class M08JudgmentTests(unittest.TestCase):
    def setUp(self):
        # Prediction/label accounting uses the historical integrated-ear fixture;
        # current013 stage gating is covered independently in test_head_first.
        from spine_skin_tool.assembly import VERSIONS
        self.legacy_workflow=patch.dict(VERSIONS['workflow'],{'revision':'photo-to-skin-shared-012','hair_fit_revision':'head-alpha-fit-005'});self.legacy_image=patch.dict(VERSIONS['models'],{'image_prompt_revision':'image-prompt-012'});self.legacy_workflow.start();self.legacy_image.start()
        self.f=fixtures.BlindTrialsTests();self.f.setUp();self.root=self.f.root
    def tearDown(self):self.f.tearDown();self.legacy_image.stop();self.legacy_workflow.stop()
    def generated(self):
        png=self.f.f.fake_setup();v=register(self.root,[self.f.case]);case=v['cases'][0]
        draft=copy.deepcopy(self.f.f.design);draft.update(photo={'file':case['photo'],'sha256':case['photo_sha256']},character_id='m08-1');edit_design(self.root,case['task_id'],draft)
        (self.root/'runtime/secrets/review.json').write_text(json.dumps({'live_enabled':True,'upload_consent':True,'max_live_calls':7,'timeout_seconds':600}))
        def visual(root,rid):
            r=read_review(root,rid);r['visual_reviews']=[{'source':'CODEX_SUBSCRIPTION','data':{'checks':[{'category':c,'result':'PASS','confidence':1,'evidence_ids':['synthetic'],'message_ja':'合成試験です。'} for c in policy()['required_visual_checks']],'defects':[]}}];r['visual_call']['status']='COMPLETED_ADVISORY';r['status']=aggregate(r);save_report(root,r);return r
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)),patch('spine_skin_tool.review_visual.run_visual',side_effect=visual):s=advance(self.root,case['task_id'])
        return v,s
    def test_bound_labels_measure_auxiliary_errors_without_approving_character(self):
        v,s=self.generated();label={'manifest_sha256':s['candidates'][0]['manifest_sha256'],'category':'hair_fit','expected':'FAIL'}
        with self.assertRaisesRegex(DesignError,'BLIND_HUMAN_CONFIRMATION_REQUIRED'):adjudicate(self.root,v['id'],1,[label])
        adjudicate(self.root,v['id'],1,[label],True);m=metrics(self.root,v['id'])['cases'][0];self.assertEqual(m['labeled_checks'],1);self.assertEqual(m['false_accept_rate'],1);self.assertEqual(m['missed_defect_rate'],1);self.assertFalse(m['quality_approved'])
        again=adjudicate(self.root,v['id'],1,[label],True);self.assertEqual(again['recorded'],0);self.assertEqual(again['already_recorded'],1)
    def test_changed_review_does_not_reuse_reference_label_for_new_opinion(self):
        v,s=self.generated();adjudicate(self.root,v['id'],1,[{'manifest_sha256':s['candidates'][0]['manifest_sha256'],'category':'hair_fit','expected':'PASS'}],True)
        p=review_dir(self.root,s['review_id'])/'report.json';data=json.loads(p.read_text(encoding='utf-8'));data['extra_synthetic_observation']='changed';p.write_text(json.dumps(data),encoding='utf-8');m=metrics(self.root,v['id'])['cases'][0];self.assertEqual(m['stale_labels'],1);self.assertIsNone(m['false_accept_rate'])
        adjudicate(self.root,v['id'],1,[{'manifest_sha256':s['candidates'][0]['manifest_sha256'],'category':'hair_fit','expected':'PASS'}],True);m=metrics(self.root,v['id'])['cases'][0];self.assertEqual(m['stale_labels'],1);self.assertEqual(m['labeled_checks'],1);self.assertEqual(m['false_accept_rate'],0)
    def test_external_human_evidence_is_not_a_machine_pass_or_production_release(self):
        p=self.root/'runtime/work/M08/human-test.txt';p.parent.mkdir(parents=True,exist_ok=True);p.write_text('SYNTHETIC_EXTERNAL_TEST_RECORD')
        with self.assertRaises(DesignError):attest(self.root,'clean_windows',p.relative_to(self.root).as_posix(),'合成申告')
        attest(self.root,'clean_windows',p.relative_to(self.root).as_posix(),'合成申告。実機検証ではありません。',True);r=report(self.root);self.assertFalse(r['production_approved']);self.assertEqual(next(g for g in r['gates'] if g['key']=='clean_windows')['status'],'USER_ATTESTED')
        p.write_text('changed');self.assertEqual(next(g for g in report(self.root)['gates'] if g['key']=='clean_windows')['status'],'STALE')
        attest(self.root,'clean_windows',p.relative_to(self.root).as_posix(),'新しい合成申告。',True);self.assertEqual(next(g for g in report(self.root)['gates'] if g['key']=='clean_windows')['status'],'USER_ATTESTED')
    def test_later_human_review_does_not_replace_the_model_prediction(self):
        v,s=self.generated();r=read_review(self.root,s['review_id']);r['visual_reviews'][0]['data']['checks'][0]['result']='FAIL';human=copy.deepcopy(r['visual_reviews'][0]);human['source']='HUMAN';human['data']['checks'][0]['result']='PASS';r['visual_reviews'].append(human);save_report(self.root,r)
        adjudicate(self.root,v['id'],1,[{'manifest_sha256':s['candidates'][0]['manifest_sha256'],'category':r['visual_reviews'][0]['data']['checks'][0]['category'],'expected':'PASS'}],True)
        m=metrics(self.root,v['id'])['cases'][0];self.assertEqual(m['false_reject_rate'],1);self.assertFalse(m['quality_approved'])
