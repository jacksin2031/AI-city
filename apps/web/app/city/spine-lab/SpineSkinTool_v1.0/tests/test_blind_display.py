"""Synthetic local comparison boundaries. Never calls a subscription model."""
import json,unittest
from unittest.mock import patch
import test_blind_trials
from spine_skin_tool.blind_trials import register,folder
from spine_skin_tool.blind_display import photo,snapshot,returned,part_image
from spine_skin_tool.design import DesignError


class BlindDisplayTests(unittest.TestCase):
    def setUp(self):
        self.f=test_blind_trials.BlindTrialsTests();self.f.setUp();self.root=self.f.root
        self.batch=register(self.root,[self.f.case]);self.identity=self.batch['id'];self.sha=self.batch['cases'][0]['photo_sha256']
    def tearDown(self):self.f.tearDown()
    def test_only_exact_registered_photo_can_be_read(self):
        self.assertEqual(photo(self.root,self.identity,1,self.sha),self.f.photo)
        for number,sha in ((1,'0'*64),(0,self.sha),(2,self.sha)):
            with self.assertRaises(DesignError):photo(self.root,self.identity,number,sha)
    def test_no_candidate_does_not_claim_playback_and_read_calls_no_model(self):
        with patch('spine_skin_tool.generation.generate_image') as image,patch('spine_skin_tool.photo_design.execute') as design:
            s=snapshot(self.root,self.identity)
        image.assert_not_called();design.assert_not_called();row=s['cases'][0]
        self.assertEqual(row['candidates'],[]);self.assertFalse(row['quality_approved']);self.assertFalse(s['production_approved'])
        self.assertNotIn(str(self.root),json.dumps(s));self.assertIn(self.sha,row['photo_url'])
    def test_provenance_must_match_photo_not_just_case_number(self):
        p=folder(self.root,self.identity)/'photo-sources.json';source={'case':1,'photo_sha256':self.sha,'source_url':'https://commons.wikimedia.org/wiki/File:Synthetic','framing_ja':'胸部以上','group_ja':'合成試験','credit':'synthetic','license':'test-only'}
        p.write_text(json.dumps([source]),encoding='utf-8');self.assertEqual(snapshot(self.root,self.identity)['cases'][0]['source']['credit'],'synthetic')
        source['photo_sha256']='0'*64;p.write_text(json.dumps([source]),encoding='utf-8')
        with self.assertRaisesRegex(DesignError,'BLIND_DISPLAY_SOURCE_BINDING'):snapshot(self.root,self.identity)
    def test_archived_reads_preserve_photo_checks_but_cannot_advance_or_claim_current(self):
        from spine_skin_tool.blind_trials import advance_case,load
        (self.root/'src').mkdir(exist_ok=True)
        (self.root/'src/feature.py').write_text('NEW_CODE=True')
        archived=snapshot(self.root,self.identity);self.assertFalse(archived['source_current'])
        self.assertEqual(archived['cases'][0]['status'],'PLANNED')
        self.assertEqual(photo(self.root,self.identity,1,self.sha),self.f.photo)
        with self.assertRaisesRegex(DesignError,'BLIND_SOURCE_CHANGED'):advance_case(self.root,self.identity,1)
        self.f.photo.write_bytes(b'broken')
        with self.assertRaisesRegex(DesignError,'BLIND_PHOTO_CHANGED'):load(self.root,self.identity,verify_source=False)
    def make_returned(self):
        job='job-'+'a'*32;p=self.root/'runtime/work/M04/generation/jobs'/job;p.mkdir(parents=True)
        (p/'image.png').write_bytes(self.f.photo.read_bytes())
        s={'id':self.batch['cases'][0]['task_id'],'jobs':{'LEG_FRONT':job}}
        (p/'report.json').write_text(json.dumps({'id':job,'part':'LEG_FRONT','flow_id':s['id'],'status':'GENERATED_AWAITING_MANUAL_REVIEW','image_sha256':self.sha}),encoding='utf-8')
        return s,p
    def test_returned_partial_png_is_scoped_to_exact_case_part_and_sha(self):
        s,p=self.make_returned()
        with patch('spine_skin_tool.blind_display.report',return_value=s):
            self.assertEqual(part_image(self.root,self.identity,1,'LEG_FRONT',self.sha),p/'image.png')
            with self.assertRaises(DesignError):part_image(self.root,self.identity,1,'LEG_BACK',self.sha)
            with self.assertRaises(DesignError):part_image(self.root,self.identity,1,'LEG_FRONT','0'*64)
        (p/'image.png').write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'BLIND_DISPLAY_IMAGE_CHANGED'):returned(self.root,s)
    def test_another_flow_job_cannot_be_shown_as_this_case(self):
        s,p=self.make_returned();v=json.loads((p/'report.json').read_text(encoding='utf-8'));v['flow_id']='flow-'+'b'*32;(p/'report.json').write_text(json.dumps(v),encoding='utf-8')
        with self.assertRaisesRegex(DesignError,'BLIND_DISPLAY_JOB_BINDING'):returned(self.root,s)
    def test_moderation_reason_is_whitelisted_not_a_raw_log_or_a_returned_image(self):
        s,p=self.make_returned();v=json.loads((p/'report.json').read_text(encoding='utf-8'));v.update(status='FAILED_OR_RESULT_UNKNOWN_NO_RETRY',error_code='CODEX_OUTPUT_MODERATION_BLOCKED')
        (p/'report.json').write_text(json.dumps(v),encoding='utf-8');(p/'codex-stderr.log').write_text('private unrelated details; safety_violations=[sexual]',encoding='utf-8')
        row=returned(self.root,s)[0];self.assertIsNone(row['sha256']);self.assertIn('sexual',row['reason_ja']);self.assertNotIn('private',json.dumps(row))
