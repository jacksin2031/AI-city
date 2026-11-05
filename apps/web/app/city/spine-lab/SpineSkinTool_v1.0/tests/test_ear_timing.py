"""Synthetic geometry and actual clock arithmetic; no remote calls."""
import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch
from PIL import Image,ImageDraw
from spine_skin_tool.ear_geometry import observe,fit_front,coverage
from spine_skin_tool.production_timing import part_statistics,difference


class EarGeometryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.head=Path(self.tmp.name)/'head.png'
        Image.new('RGBA',(200,200),(255,212,193,255)).save(self.head)
        self.geometry={'width':200,'height':200,'x':100}
        self.targets={'points':[[-98,84],[98,84]]}
    def tearDown(self):self.tmp.cleanup()
    def hair(self,ears=True):
        im=Image.new('RGBA',(300,260));d=ImageDraw.Draw(im)
        d.rectangle((35,20,265,60),fill='#302622');d.rectangle((35,20,60,220),fill='#302622');d.rectangle((240,20,265,220),fill='#302622')
        if ears:
            d.ellipse((40,120,56,146),fill=(255,212,193,255));d.ellipse((244,120,260,146),fill=(255,212,193,255))
        return im
    def test_bilateral_ear_roots_drive_uniform_scale_without_pixel_changes(self):
        im=self.hair();before=im.tobytes();layout,fit=fit_front(im,self.geometry,self.head,self.targets)
        self.assertEqual(fit['status'],'ALIGNED');self.assertEqual(fit['rotation'],0);self.assertFalse(fit['nonuniform_scale'])
        self.assertEqual(im.tobytes(),before)
        for point,target in zip(fit['transformed_roots'],self.targets['points']):
            self.assertAlmostEqual(point[0],target[0],places=5);self.assertAlmostEqual(point[1],target[1],places=5)
        self.assertIn('front_anchor_x',layout)
    def test_no_ears_or_one_ear_is_not_an_approved_fallback(self):
        im=self.hair(False);self.assertEqual(observe(im,self.head)['status'],'UNLOCATABLE')
        ImageDraw.Draw(im).ellipse((40,120,56,146),fill=(255,212,193,255))
        layout,fit=fit_front(im,self.geometry,self.head,self.targets)
        self.assertIsNone(layout);self.assertEqual(fit['status'],'REQUIRES_REVIEW')
    def test_more_than_one_plausible_pair_remains_ambiguous(self):
        im=self.hair();d=ImageDraw.Draw(im)
        for x in (40,244):d.ellipse((x,170,x+16,196),fill=(255,212,193,255))
        self.assertEqual(observe(im,self.head)['status'],'AMBIGUOUS')
    def test_ear_alignment_alone_does_not_pass_coverage(self):
        im=self.hair();ImageDraw.Draw(im).rectangle((0,160,299,259),fill=(0,0,0,0))
        layout,fit=fit_front(im,self.geometry,self.head,self.targets)
        measured=coverage(im,self.geometry,self.head,layout)
        self.assertEqual(fit['status'],'ALIGNED')
        self.assertGreater(measured['side_boundary_max_uncovered_run_head_fraction'],.03)
        self.assertTrue(measured['measurement_only_no_png_edits'])


class TimingTests(unittest.TestCase):
    def test_user_mean_includes_wait_review_and_repairs_not_just_model_time(self):
        attempts=[{'started_at':100,'elapsed_seconds':10},{'started_at':150,'elapsed_seconds':20}]
        result=part_statistics(attempts,200)
        self.assertEqual(result['start_to_incorporation_seconds'],100)
        self.assertEqual(result['mean_start_to_incorporation_seconds'],50)
        self.assertEqual(result['mean_generation_seconds'],15)
        self.assertFalse(result['quality_approved'])
    def test_unknown_or_negative_clock_is_not_invented_as_zero(self):
        for start,end in ((None,3),(4,3),(float('nan'),6)):
            self.assertIsNone(difference(end,start))
        r=part_statistics([{'started_at':100,'elapsed_seconds':None}],None)
        self.assertIsNone(r['mean_generation_seconds']);self.assertIsNone(r['mean_start_to_incorporation_seconds'])
    def test_new_flow_event_has_real_persisted_clock(self):
        from spine_skin_tool.repair_store import commit,directory
        with tempfile.TemporaryDirectory() as tmp,patch('spine_skin_tool.repair_store.time.time',return_value=1234.5):
            root=Path(tmp);identity='flow-'+'a'*32
            directory(root,identity,kind='flow').mkdir(parents=True)
            commit(root,{'id':identity},'SYNTHETIC',kind='flow')
            record=json.loads(next((directory(root,identity,kind='flow')/'events').glob('*.json')).read_text())
            self.assertEqual(record['recorded_at'],1234.5)
