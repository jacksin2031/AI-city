"""规格试验的真实图像/资源与拒绝边界。"""
import copy
import json
import unittest
import shutil
from PIL import Image
import test_assembly
from spine_skin_tool.trials import default_trial,validate_trial,create_trial,candidates
from spine_skin_tool.assembly import AssemblyError,verify_bundle

class TrialTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_assembly.AssemblyTests();self.fixture.setUp();self.f=self.fixture
        self.inputs=self.f.root/'imports';shutil.copytree(self.f.parts,self.inputs)
        self.config=default_trial(self.f.profile)
    def tearDown(self):self.fixture.tearDown()
    def trial(self,name='candidate-0001'):
        path=self.f.root/'trials'/name
        result=create_trial(self.f.source,self.f.atlas,self.inputs,self.f.profile,self.config,path)
        return path,result
    def test_identity_and_double_resolution_preserve_geometry_and_input(self):
        self.assertTrue(all(spec['mask']=='none' for spec in self.config['parts'].values()))
        before=self.f.source.read_bytes();first,report=self.trial()
        self.assertEqual(report['parts']['BODY_FRONT']['provenance'],'REFERENCE_REPLAY')
        self.config['export_scale']=2;second,_=self.trial('candidate-0002')
        self.assertEqual(before,self.f.source.read_bytes())
        self.assertEqual(json.loads((first/'bundle/skeleton.json').read_text()),json.loads((second/'bundle/skeleton.json').read_text()))
        self.assertEqual(Image.open(second/'parts/ai-city-template-body.png').size,(4,6))
        self.assertEqual(len(candidates(self.f.root/'trials')),2)
        verify_bundle(second/'bundle')
    def test_imported_resolution_and_mask_are_recorded(self):
        path=self.inputs/'ai-city-template-body.png'
        with Image.open(path) as image:resized=image.resize((20,30))
        resized.save(path)
        self.config['parts']['BODY_FRONT']['mask']='reference';self.config['parts']['BODY_FRONT']['exclude']=[[0,0,.5,1]]
        out,report=self.trial()
        info=report['parts']['BODY_FRONT']
        self.assertEqual(info['generation_input_canvas'],[20,30])
        self.assertEqual(info['provenance'],'IMPORTED_IMAGE_ORIGIN_UNVERIFIED')
        self.assertGreater(info['mask_removed_alpha_fraction'],0)
        self.assertIn('TEMPLATE_ALPHA_SILHOUETTE_CLIPPING',info['warnings'])
        self.assertTrue((out/'inputs/ai-city-template-body.png').is_file())
    def test_invalid_config_rejected_before_output(self):
        for value in (True,3,float('nan')):
            config=copy.deepcopy(self.config);config['export_scale']=value
            with self.assertRaises(AssemblyError):validate_trial(config,self.f.profile)
        for key,value in [('source_anchor',[float('nan'),0]),('scale',False),('exclude',[[.5,0,.2,1]])]:
            config=copy.deepcopy(self.config);config['parts']['BODY_FRONT'][key]=value
            with self.assertRaises(AssemblyError):validate_trial(config,self.f.profile)
        config=copy.deepcopy(self.config);config['production_approved']=True
        with self.assertRaises(AssemblyError):validate_trial(config,self.f.profile)
    def test_fully_erased_candidate_not_listed_and_previous_preserved(self):
        first,_=self.trial();sha=(first/'bundle/build-manifest.json').read_bytes()
        self.config['parts']['BODY_FRONT']['exclude']=[[0,0,1,1]]
        with self.assertRaises(AssemblyError):self.trial('candidate-0002')
        self.assertEqual((first/'bundle/build-manifest.json').read_bytes(),sha)
        self.assertEqual(len(candidates(self.f.root/'trials')),1)
    def test_reference_changes_and_existing_destination_rejected(self):
        self.trial()
        with self.assertRaises(AssemblyError):self.trial()
        self.f.source.write_text(self.f.source.read_text()+' ')
        with self.assertRaises(AssemblyError):self.trial('candidate-0002')
    def test_export_budget_rejected_without_creating_directory(self):
        from unittest.mock import patch
        oversized=copy.deepcopy(self.f.profile)
        oversized['parts']['BODY_FRONT']['canvas']=[5000,5000]
        with patch('spine_skin_tool.trials.make_profile',return_value=oversized):
            with self.assertRaisesRegex(AssemblyError,'EXPORT_PIXEL_BUDGET'):
                create_trial(self.f.source,self.f.atlas,self.inputs,oversized,self.config,self.f.root/'oversized')
        self.assertFalse((self.f.root/'oversized').exists())
