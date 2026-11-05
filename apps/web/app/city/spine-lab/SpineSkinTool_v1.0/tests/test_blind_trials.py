"""Blind admission and durable scope: synthetic images, no subscription calls."""
import json,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import test_pipeline as fixtures
from spine_skin_tool.blind_trials import register,load,metrics
from spine_skin_tool.design import DesignError


class BlindTrialsTests(unittest.TestCase):
    def setUp(self):
        self.f=fixtures.PipelineTests();self.f.setUp();self.root=self.f.root;self.photo=self.root/'runtime/work/M04/character-reference9.png';Image.new('RGB',(20,30),(45,150,180)).save(self.photo)
        self.case={'photo':self.photo.name,'tags':['short_hair','partial_photo']}
    def tearDown(self):self.f.tearDown()
    def test_registration_only_creates_drafts_and_unknown_accuracy_is_not_zero(self):
        with patch('spine_skin_tool.photo_design.execute') as design,patch('spine_skin_tool.generation.generate_image') as gen:v=register(self.root,[self.case])
        design.assert_not_called();gen.assert_not_called();m=metrics(self.root,v['id']);c=m['cases'][0];self.assertFalse(c['finished']);self.assertIsNone(c['false_accept_rate']);self.assertIsNone(c['reported_usage']);self.assertEqual(c['image_requests'],0);self.assertFalse(m['production_approved'])
    def test_renamed_or_reencoded_seen_photo_is_not_a_blind_case(self):
        p=self.root/'runtime/work/M04/generation/jobs'/('job-'+'a'*32)/'references/character.png';p.parent.mkdir(parents=True)
        with Image.open(self.photo) as im:im.save(p,compress_level=0)
        with self.assertRaisesRegex(DesignError,'BLIND_PHOTO_ALREADY_SEEN'):register(self.root,[self.case])
    def test_repeat_enrollment_cannot_start_another_batch(self):
        register(self.root,[self.case])
        with self.assertRaises(FileExistsError):register(self.root,[self.case])
    def test_photo_or_source_changes_stop_before_model_calls(self):
        v=register(self.root,[self.case]);Image.new('RGB',(20,30),(180,30,20)).save(self.photo)
        with self.assertRaisesRegex(DesignError,'BLIND_PHOTO_CHANGED'):load(self.root,v['id'])
    def test_duplicate_case_and_unknown_tags_are_rejected(self):
        with self.assertRaisesRegex(DesignError,'BLIND_PHOTO_ALREADY_SEEN'):register(self.root,[self.case,self.case])
        with self.assertRaisesRegex(DesignError,'BLIND_CASE'):register(self.root,[{**self.case,'tags':['unvalidated-private-label']}])

    def retest_parent(self):
        cases=[self.case]
        for n in (10,11,12):
            name=f'character-reference{n}.png';Image.new('RGB',(20,30),(n*10,60,100)).save(self.photo.parent/name)
            cases.append({'photo':name,'tags':['partial_photo']})
        return cases,register(self.root,cases)
    def test_retest_reuses_only_originals_and_keeps_prior_reservations(self):
        from spine_skin_tool.blind_trials import register_retest
        cases,parent=self.retest_parent();pool=self.root/'runtime/work/M08/holdout-index';before={p.name:p.read_bytes() for p in pool.iterdir()}
        name='character-reference13.png';Image.new('RGB',(20,30),(190,190,200)).save(self.photo.parent/name)
        cases[2]={'photo':name,'tags':['partial_photo']}
        with patch('spine_skin_tool.generation.generate_image') as model:new=register_retest(self.root,cases,parent['id'])
        model.assert_not_called();self.assertEqual(new['scope'],'EXPLICIT_USER_RETEST_NOT_BLIND');load(self.root,new['id'])
        self.assertEqual(len(list(pool.iterdir())),5)
        self.assertTrue(all((pool/n).read_bytes()==b for n,b in before.items()))
        self.assertEqual(new['cases'][0]['enrollment_owner'],parent['id'])
        from spine_skin_tool.blind_display import publish,snapshot
        with self.assertRaisesRegex(DesignError,'DISPLAY_TRIAL_NOT_STOPPED'):publish(self.root,new['id'],parent['id'])
        with patch('spine_skin_tool.blind_display.snapshot',return_value={'cases':[{'status':'REQUIRES_REVIEW'}]*4}):publish(self.root,new['id'],parent['id'])
        self.assertEqual(snapshot(self.root,parent['id'])['id'],new['id'])
        self.assertEqual(snapshot(self.root,parent['id'],follow_current=False)['id'],parent['id'])
    def test_retest_requires_a_different_third_photo(self):
        from spine_skin_tool.blind_trials import register_retest
        cases,parent=self.retest_parent()
        with self.assertRaisesRegex(DesignError,'RETEST_REPLACEMENT_MUST_BE_NEW'):register_retest(self.root,cases,parent['id'])

    def test_current_one_character_version_still_allows_three_corrections(self):
        from spine_skin_tool.blind_trials import register_retest
        from spine_skin_tool.pipeline_store import read
        cases,parent=self.retest_parent()
        new=register_retest(self.root,cases,parent['id'],reuse_all=True,one_version=True)
        for row in new['cases']:
            self.assertEqual(read(self.root,row['task_id'])['limits']['max_repair_cycles'],3)
