"""Coarse-style boundaries, uniform margin and bound model feedback; no cloud."""
import json,tempfile,unittest
from pathlib import Path
from PIL import Image,ImageDraw
from spine_skin_tool.generation import build_part_prompt
from spine_skin_tool.repair import route
from spine_skin_tool.hair_fit import solve
from spine_skin_tool.character import region
from spine_skin_tool.appearance_opinions import lookup
import test_repair as fixtures


class CoarseStyleTests(unittest.TestCase):
    def test_fine_style_and_near_shade_do_not_spend_a_retry_but_wrong_view_can(self):
        d={'code':'STYLE_DRIFT','part':'HAIR_FRONT','confidence':1,'severity':'MAJOR'}
        r={'hard':{'defects':[]},'render':{'defects':[]},'visual_reviews':[{'source':'CODEX_SUBSCRIPTION','data':{'defects':[d],'checks':[]}}]}
        for code,part in [('STYLE_DRIFT','HAIR_FRONT'),('PALETTE_MISMATCH','BODY_FRONT')]:
            d.update(code=code,part=part);self.assertEqual(route(r)[0]['action'],'REQUIRES_REVIEW')
        for code in ('VIEW_ANGLE','STYLE_FAMILY_MISMATCH','COARSE_COLOR_MISMATCH'):
            d.update(code=code,part='HAIR_FRONT');self.assertEqual(route(r)[0]['action'],'REGENERATE')
    def test_front_and_rear_require_orthographic_without_symmetrizing_hair(self):
        for part in ('HAIR_FRONT','HAIR_BACK'):
            prompt=build_part_prompt(part,'side-swept hair')
            for text in ('STRICT ORTHOGRAPHIC','NEVER three-quarter','asymmetric','STYLE FAMILY','3%','NEVER horizontally stretch'):self.assertIn(text,prompt)
    def test_three_percent_is_a_measurement_target_never_a_stencil_or_one_axis_warp(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'head.png';Image.new('RGBA',(286,249),'#ffd3bf').save(path)
            front=Image.new('RGBA',(300,280));d=ImageDraw.Draw(front);d.ellipse((0,0,299,279),fill='#292936');d.rectangle((70,90,230,279),fill=(0,0,0,0))
            back=Image.new('RGBA',(300,280));ImageDraw.Draw(back).ellipse((0,0,299,279),fill='#292936')
            before=(front.tobytes(),back.tobytes());head={'width':286,'height':249,'x':122.13795}
            layout,m=solve(front,back,head,path,front_cheeks=True,coverage_margin=.03)
            self.assertEqual(m['coverage_target_margin'],.03);self.assertTrue(m['margin_is_measurement_guide_not_output_mask']);self.assertEqual(before,(front.tobytes(),back.tobytes()))
            a,_=region(front,'test',layout['front_width'],layout['top'],face=True)
            self.assertAlmostEqual(a['width']/front.width,a['height']/front.height)
    def test_user_opinion_is_exact_candidate_bound_and_does_not_create_release_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);folder=root/'runtime/work/M07';folder.mkdir(parents=True)
            row={'task_id':'flow-'+'a'*32,'manifest_sha256':'b'*64,'scope':'appearance','accepted':True,'message_ja':'外観確認済み。'}
            (folder/'appearance-opinions.json').write_text(json.dumps([row]),encoding='utf-8')
            self.assertEqual(lookup(root,row['task_id'],row['manifest_sha256']),row)
            self.assertIsNone(lookup(root,row['task_id'],'c'*64));self.assertNotIn('quality_approved',row)


class ModelFeedbackTests(unittest.TestCase):
    def setUp(self):self.f=fixtures.RepairTests();self.f.setUp()
    def tearDown(self):self.f.tearDown()
    def test_feedback_is_targeted_frozen_data_and_rejects_changed_review(self):
        from spine_skin_tool.review import save_report
        from spine_skin_tool.repair_requests import feedback,make,load_request
        from spine_skin_tool.design import DesignError
        r=self.f.source_review(False);r['visual_reviews']=[{'source':'CODEX_SUBSCRIPTION','data':{'defects':[{'code':'VIEW_ANGLE','part':'HAIR_FRONT','message_ja':'顔の開口が三分の四向きです。'},{'code':'VIEW_ANGLE','part':'HAIR_BACK','message_ja':'別部位の観察。'}]}}];save_report(self.f.root,r)
        data=feedback(self.f.root,r['review_id'],'HAIR_FRONT',['VIEW_ANGLE']);self.assertEqual(len(data['observations']),1)
        identity,request=make(self.f.root,r['design_id'],self.f.profile,'HAIR_FRONT',['VIEW_ANGLE'],'repair-'+'e'*32,1,model_feedback=data)
        self.assertIn('顔の開口',request['prompt']);self.assertNotIn('別部位の観察',request['prompt']);self.assertIn('UNTRUSTED DATA',request['prompt']);self.assertIn('STRICT ORTHOGRAPHIC',request['prompt'])
        self.assertEqual(load_request(self.f.root,identity,self.f.profile)['model_feedback'],data)
        r['visual_reviews'][0]['data']['defects'][0]['message_ja']='変わった観察。';save_report(self.f.root,r)
        with self.assertRaisesRegex(DesignError,'REPAIR_FEEDBACK_CHANGED'):load_request(self.f.root,identity,self.f.profile)
