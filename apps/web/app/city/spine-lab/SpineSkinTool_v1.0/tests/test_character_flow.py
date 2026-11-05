"""Shared-flow failure boundaries; no model requests, no private photos in fixtures."""
import copy,json,unittest
from unittest.mock import patch
from PIL import Image
import test_generation
from spine_skin_tool.design import (draft_design,freeze_design,load_design,validate_design,
    required_parts,part_description,part_request,DesignError)
from spine_skin_tool.character_flow import prepare_requests,resolve_bindings,assemble_character
from spine_skin_tool.generation import generate


class CharacterFlowTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_generation.GenerationTests();self.fixture.setUp();self.root=self.fixture.root;self.f=self.fixture.f
        self.design=draft_design(self.root,'character-reference.png','synthetic')
        self.source=patch('spine_skin_tool.character_flow.source_profile',return_value=(self.f.source,self.f.atlas,self.f.profile));self.source.start()
    def tearDown(self):self.source.stop();self.fixture.tearDown()
    def freeze(self):return freeze_design(self.root,self.design)

    def test_canonical_freeze_repeat_and_mutation_have_different_identities(self):
        a=self.freeze();self.assertEqual(a,self.freeze())
        self.design['appearance']['sleeve']['color']='#123456';b=self.freeze()
        self.assertNotEqual(a['design_id'],b['design_id']);self.assertEqual(load_design(self.root,a['design_id']),a)

    def test_missing_unknown_and_conflicting_fields_reject(self):
        variants=[]
        a=copy.deepcopy(self.design);a.pop('skin_color');variants.append(a)
        a=copy.deepcopy(self.design);a['secret']='not allowed';variants.append(a)
        a=copy.deepcopy(self.design);a['appearance']['leg']['color']='#123456';variants.append(a)
        a=copy.deepcopy(self.design);a['appearance']['lower']['basis']='PHOTO';variants.append(a)
        a=copy.deepcopy(self.design);a['layout']['front_width']=float('nan');variants.append(a)
        a=copy.deepcopy(self.design);a['appearance']['sleeve']['fraction']=True;variants.append(a)
        a=copy.deepcopy(self.design);a['production_approved']=True;variants.append(a)
        for a in variants:
            with self.subTest(a=a),self.assertRaises(ValueError):validate_design(a,self.root)

    def test_photo_drift_and_frozen_record_tampering_are_not_reused(self):
        record=self.freeze();photo=self.root/'runtime/work/M04/character-reference.png'
        before=photo.read_bytes();Image.new('RGBA',(9,11),'red').save(photo)
        with self.assertRaisesRegex(DesignError,'PHOTO_CHANGED'):load_design(self.root,record['design_id'])
        photo.write_bytes(before)
        path=self.root/f"runtime/work/M04/character-flow/designs/design-{record['design_id']}.json"
        data=json.loads(path.read_text());data['design']['skin_color']='#000000';path.write_text(json.dumps(data))
        with self.assertRaisesRegex(DesignError,'FROZEN_RECORD_CHANGED'):load_design(self.root,record['design_id'])

    def test_stale_versions_and_path_traversal_reject(self):
        record=self.freeze()
        with patch.dict('spine_skin_tool.design.VERSIONS',workflow={'revision':'future'}):
            with self.assertRaisesRegex(DesignError,'DESIGN_VERSION_STALE'):load_design(self.root,record['design_id'])
        with self.assertRaises(ValueError):load_design(self.root,'../outside')
        self.design['photo']['file']='../../secret.png'
        with self.assertRaises(ValueError):self.freeze()

    def test_part_scope_does_not_bake_sleeves_or_shoes_into_body(self):
        self.design['appearance']['sleeve']['description']='UNIQUE_SLEEVE_ONLY'
        self.design['appearance']['shoe']['description']='UNIQUE_SHOE_ONLY'
        body=part_description(self.design,'BODY_FRONT')
        self.assertNotIn('UNIQUE_SLEEVE_ONLY',body);self.assertNotIn('UNIQUE_SHOE_ONLY',body)
        self.assertIn('#35333D',body);self.assertIn('UNIQUE_SHOE_ONLY',part_description(self.design,'LEG_BACK'))

    def test_skirt_expands_manifest_without_changing_pants_contract(self):
        self.assertEqual(len(required_parts(self.design)),8)
        self.design['appearance']['lower']['kind']='skirt';self.design['appearance']['leg']['color']='#F4F0E8'
        record=self.freeze();self.assertEqual(len(required_parts(record['design'])),10)
        self.assertIn('No trouser panel',part_description(record['design'],'BODY_BACK'))
        self.assertIn('Separate flared skirt',part_description(record['design'],'SKIRT_BACK'))

    def test_requests_persist_exact_prompts_and_references_without_calls(self):
        record=self.freeze();plan,path=prepare_requests(self.root,record['design_id']);again,_=prepare_requests(self.root,record['design_id'])
        self.assertEqual(plan,again);self.assertTrue((path/'requests.json').is_file());self.assertEqual(plan['model_calls'],0)
        self.assertEqual(plan['parts']['BODY_FRONT']['prompt'],part_request(self.root,record,self.f.profile,'BODY_FRONT')['prompt'])
        ref=plan['parts']['HAIR_FRONT']['references'][0]
        with Image.open(path/ref['file']) as photo:self.assertEqual(photo.size,(24,32))
        (path/ref['file']).write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'REQUEST_REFERENCE_CHANGED'):prepare_requests(self.root,record['design_id'])

    def test_bound_generation_uses_shared_request_and_rejects_overrides(self):
        record=self.freeze();p={'provider':'grok','part':'BODY_FRONT','description':'','execute':False,'design_id':record['design_id']}
        result=generate(self.root,self.f.profile,self.f.atlas,p,test_generation.FakeTransport([]))
        expected=part_request(self.root,record,self.f.profile,'BODY_FRONT')
        self.assertEqual(result['prompt'],expected['prompt']);self.assertEqual(result['prompt_sha256'],expected['prompt_sha256'])
        for change in ({'description':'different outfit'},{'character_reference':'character-reference2.png'},{'provider':'standard'}):
            with self.subTest(change=change),self.assertRaises(ValueError):generate(self.root,self.f.profile,self.f.atlas,{**p,**change},test_generation.FakeTransport([]))

    def test_generated_job_binding_checks_design_part_reference_and_image(self):
        record=self.freeze();self.fixture.save(True)
        payload={'provider':'codex','part':'BODY_FRONT','description':'','execute':True,'design_id':record['design_id']}
        with patch('spine_skin_tool.generation.generate_image',return_value=(test_generation.png(),None)):
            job=generate(self.root,self.f.profile,self.f.atlas,payload,test_generation.FakeTransport([]))
        from spine_skin_tool.generation import prepare_trial_inputs
        with self.assertRaisesRegex(ValueError,'FROZEN_JOB_REQUIRES_CHARACTER_FLOW'):prepare_trial_inputs(self.root,self.f.profile,self.f.atlas,self.f.parts,job['id'])
        raw=self.root/'runtime/work/raw';raw.mkdir();bindings={}
        for p in required_parts(self.design):
            if p.startswith('ARM'):continue
            (raw/(p+'.png')).write_bytes(test_generation.png());bindings[p]={'file':f'runtime/work/raw/{p}.png'}
        bindings['BODY_FRONT']={'job_id':job['id']};plan,_=prepare_requests(self.root,record['design_id'])
        result=resolve_bindings(self.root,record,bindings,self.f.profile,plan)
        self.assertEqual(result['BODY_FRONT']['origin']['kind'],'GENERATED_JOB')
        path=self.root/'runtime/work/M04/generation/jobs'/job['id']/'report.json'
        report=json.loads(path.read_text());report['references'][0]['sha256']='0'*64;path.write_text(json.dumps(report))
        with self.assertRaisesRegex(DesignError,'JOB_REFERENCE_MISMATCH'):resolve_bindings(self.root,record,bindings,self.f.profile,plan)
        report['references']=job['references'];report['design_id']='0'*64;path.write_text(json.dumps(report))
        with self.assertRaisesRegex(DesignError,'JOB_DESIGN_MISMATCH'):resolve_bindings(self.root,record,bindings,self.f.profile,plan)
        report['design_id']=record['design_id'];path.write_text(json.dumps(report))
        image=path.parent/'image.png';before=image.read_bytes();image.write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'JOB_IMAGE_CHANGED'):resolve_bindings(self.root,record,bindings,self.f.profile,plan)
        image.write_bytes(before);(path.parent/'references/character.png').write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'JOB_REFERENCE_FILE_CHANGED'):resolve_bindings(self.root,record,bindings,self.f.profile,plan)

    def test_missing_parts_and_existing_output_never_overwrite_previous(self):
        record=self.freeze();output='runtime/work/existing';destination=self.root/output;destination.mkdir(parents=True);(destination/'best').write_text('preserve')
        with self.assertRaisesRegex(DesignError,'OUTPUT_ALREADY_EXISTS'):assemble_character(self.root,record['design_id'],{},output)
        with self.assertRaisesRegex(DesignError,'CHARACTER_PARTS_INCOMPLETE'):assemble_character(self.root,record['design_id'],{},'runtime/work/new')
        self.assertFalse((self.root/'runtime/work/new').exists());self.assertEqual((destination/'best').read_text(),'preserve')

    def test_private_file_binding_cannot_read_secrets_or_outside_workspace(self):
        record=self.freeze();bindings={p:{'file':'runtime/secrets/key.png'} for p in required_parts(self.design) if not p.startswith('ARM')}
        with self.assertRaises(ValueError):resolve_bindings(self.root,record,bindings,self.f.profile)

    def test_empty_and_opaque_generated_images_reject_before_export(self):
        record=self.freeze();raw=self.root/'runtime/work/raw';raw.mkdir();bindings={}
        for part in required_parts(self.design):
            if part.startswith('ARM'):continue
            (raw/(part+'.png')).write_bytes(test_generation.png());bindings[part]={'file':f'runtime/work/raw/{part}.png'}
        for image in (Image.new('RGBA',(20,30),(0,0,0,0)),Image.new('RGBA',(20,30),(0,0,0,255))):
            image.save(raw/'HAIR_FRONT.png')
            with self.assertRaisesRegex(DesignError,'PART_ALPHA_REQUIRED|PART_IMAGE_INVALID'):resolve_bindings(self.root,record,bindings,self.f.profile)

    def test_export_cannot_recurse_into_its_template_source(self):
        record=self.freeze();source=self.root/'runtime/work/template/source.json'
        bindings={p:{'file':'runtime/work/placeholder.png'} for p in required_parts(self.design) if not p.startswith('ARM')}
        with patch('spine_skin_tool.character_flow.source_profile',return_value=(source,self.f.atlas,self.f.profile)):
            with self.assertRaisesRegex(DesignError,'OUTPUT_TEMPLATE_OVERLAP'):
                assemble_character(self.root,record['design_id'],bindings,'runtime/work/template/recursive')
        self.assertFalse((self.root/'runtime/work/template/recursive').exists())

    def test_versioned_synthetic_fixture_matches_the_strict_contract(self):
        from pathlib import Path
        folder=Path(__file__).resolve().parents[1]/'fixtures/synthetic/shared-design'
        photo=self.root/'runtime/work/M04/character-reference.png';photo.write_bytes((folder/'character-reference.png').read_bytes())
        value=json.loads((folder/'design.json').read_text(encoding='utf-8'))
        record=freeze_design(self.root,value)
        self.assertEqual(record['design']['character_id'],'synthetic-fixture')

    def test_faint_only_hair_has_a_clear_rejection(self):
        from spine_skin_tool.character import region
        with self.assertRaisesRegex(DesignError,'HAIR_MAIN_ALPHA_REQUIRED'):
            region(Image.new('RGBA',(10,20),(50,50,50,20)),'hair',338,313)
