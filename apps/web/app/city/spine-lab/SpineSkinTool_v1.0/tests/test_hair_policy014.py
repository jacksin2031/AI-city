"""Semantic boundary controls: visible jaw and independent ear visibility."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image,ImageDraw
from spine_skin_tool.ear_geometry import coverage
from spine_skin_tool.hair_stages import stage_gate


class HairPolicy014Tests(unittest.TestCase):
 def test_normal_lower_jaw_is_not_a_side_cheek_coverage_failure(self):
  with tempfile.TemporaryDirectory() as t:
   file=Path(t)/'head.png';Image.new('RGBA',(286,249),'pink').save(file)
   hair=Image.new('RGBA',(300,249));d=ImageDraw.Draw(hair);d.rectangle((0,0,299,35),fill='brown');d.rectangle((0,0,24,199),fill='brown');d.rectangle((275,0,299,199),fill='brown')
   h={'width':286,'height':249,'x':122.13795};layout={'front_width':300,'top':h['x']+h['height']/2,'front_anchor_x':150}
   old=coverage(hair,h,file,layout);current=coverage(hair,h,file,layout,side_end=.78)
   self.assertGreater(old['side_boundary_max_uncovered_run_head_fraction'],.03);self.assertEqual(current['side_boundary_max_uncovered_run_head_fraction'],0);self.assertEqual(current['central_face_occlusion'],0)
 def test_one_visible_ear_cannot_pass_even_if_combined_visible_pixels_are_large(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);folder=root/'runtime/work/candidate/export/bundle';folder.mkdir(parents=True)
   fit={'revision':'head-alpha-fit-007','metrics':{'status':'ESTIMATED_NOT_VISUALLY_APPROVED'},'ear_pass':{'measurements':{'HAIR_FRONT':{'visible_ear_pixels':10000,'per_ear':[{'visible_fraction':.9},{'visible_fraction':0}]}}}}
   file=folder/'hair-fit.json';file.write_text(json.dumps(fit));report={'hard':{'status':'PASS'},'render':{'status':'PASS'},'visual_call':{'status':'COMPLETED_ADVISORY'},'visual_reviews':[{'data':{'checks':[{'category':c,'result':'PASS','confidence':1} for c in ('hair_fit','hair_consistency','ear_visibility')],'defects':[]}}]}
   candidate={'output':'runtime/work/candidate','review_id':'synthetic'}
   with patch('spine_skin_tool.review.read_review',return_value=report):
    self.assertFalse(stage_gate(root,candidate,front_ears=True));fit['ear_pass']['measurements']['HAIR_FRONT']['per_ear'][1]['visible_fraction']=.4;file.write_text(json.dumps(fit));self.assertTrue(stage_gate(root,candidate,front_ears=True))
